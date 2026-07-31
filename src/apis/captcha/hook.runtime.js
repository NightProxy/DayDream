// Captcha interception hook that runs INSIDE every scramjet-proxied page.
//
// PORTED from Daylight's `src/lib/turnstile/turnstileHook.runtime.js`. The
// only changes from the upstream file are:
//   1. `__nplus_*` markers → `__ddx_captcha_*` (see ../markers.ts).
//   2. `__nplus_turnstile_solve` → `__ddx_captcha_req` (the wire marker
//      consumed by RequestResponseChannel in src/apis/eventsBridge.ts).
//   3. `__nplus_turnstile_result` → `__ddx_captcha_res`.
//   4. `console.log('[nplus-hook] ...')` → `console.log('[ddx-captcha-hook] ...')`.
//   5. The whole IIFE is wrapped in a defensive try/catch so any runtime
//      error inside the hook never breaks the proxied page.
//
// Functional logic — wrapping turnstile/hcaptcha/grecaptcha render+execute,
// the createElement race-fix, the auto-render <div class="cf-turnstile">
// scanner, the MutationObserver, the backstop poller, the widget-token
// bookkeeping for poll-style integrations — is preserved verbatim. If the
// upstream Daylight file is updated, re-port by running the marker rename
// over the new source and dropping it in here.
//
// Delivery: this file is loaded via `?raw` (see ./hookSource.ts) and
// registered as an inline script with `scriptInjectionRegistry` (see
// ./index.ts). Scramjet's rewriter prepends our inline script to <head>
// of every proxied document, before any page script runs (proven at
// src/apis/scriptInjection/installer.ts:136-141). So `turnstile.render`,
// `hcaptcha.render`, `grecaptcha.render`, `grecaptcha.execute` are
// guaranteed to hit our wrappers when the page calls them.

;try { (function () {
  if (window.__ddx_captcha_hook_installed) return;
  window.__ddx_captcha_hook_installed = true;
  try { console.log('[ddx-captcha-hook] installing captcha interceptor at', location.href); } catch (e) {}

  // ──────────────────────────────────────────────────────────────────
  // MessageChannel handshake.
  //
  // We CANNOT receive replies via `window.addEventListener('message',
  // …)` reliably: scramjet's Window.postMessage proxy on the proxied
  // realm is buggy when the HOST calls `proxiedWindow.postMessage(…)`
  // back at us — it crashes inside scramjet trying to look up a
  // SCRAMJETCLIENT symbol on the host's globalThis (which doesn't
  // exist). The crash manifests as "Cannot read properties of
  // undefined (reading 'url')" on pages like dash.cloudflare.com.
  //
  // Workaround: page creates a MessageChannel and ships port2 to the
  // host via `window.parent.postMessage(…, '*', [port2])`. The host
  // reads `event.ports[0]` and replies via port.postMessage(), which
  // is NEVER wrapped by scramjet in the host realm (scramjet only
  // wraps MessagePort.postMessage inside proxied realms). The page
  // listens on port1 for replies.
  //
  // Sending port via postMessage works because page→host messages run
  // through scramjet's Window.postMessage proxy with the PROXIED
  // realm's client (which does exist), so the wrapper succeeds. The
  // transfer list is preserved.
  // ──────────────────────────────────────────────────────────────────
  var __ddxReplyPort = null;
  try {
    var channel = new MessageChannel();
    __ddxReplyPort = channel.port1;
    __ddxReplyPort.start();
    // Send port2 to host. The host bridge's `message` listener checks
    // `event.ports.length` on hook-ready and stores the port.
    window.parent.postMessage({
      __ddx_captcha_hook_ready: { pageUrl: location.href, at: Date.now() }
    }, '*', [channel.port2]);
  } catch (e) {
    try { console.warn('[ddx-captcha-hook] port handshake failed:', e); } catch (_) {}
    // Best-effort fallback: announce without a port. The host will
    // fall back to event.source.postMessage which may crash on some
    // pages, but at least we tried.
    try {
      window.parent.postMessage({
        __ddx_captcha_hook_ready: { pageUrl: location.href, at: Date.now() }
      }, '*');
    } catch (_) {}
  }

  var pending = Object.create(null);
  // Widget bookkeeping so integrations that POLL `turnstile.getResponse(id)`
  // (rather than relying on the `callback` option) still receive the solved
  // token. render() returns a widgetId; we map it to its token (empty until
  // the solve completes) and to its solve metadata (for reset → re-solve).
  var widgetTokens = Object.create(null); // widgetId -> token ('' while pending)
  var widgetMeta = Object.create(null);   // widgetId -> { type, sitekey, opts, extras }

  var WIDGET_PREFIX = {
    turnstile: 'cf-chl-widget-',
    hcaptcha: 'h-chl-widget-',
    'recaptcha-v2': 'g-chl-widget-',
    'recaptcha-v3': 'g-chl-widget-',
  };

  function genId() {
    return 'ns_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36);
  }

  function fillResponseField(doc, fieldName, token) {
    if (!fieldName) return false;
    try {
      var inputs = doc.querySelectorAll('input[name="' + fieldName + '"], textarea[name="' + fieldName + '"]');
      if (!inputs.length) return false;
      var any = false;
      for (var i = 0; i < inputs.length; i++) {
        var input = inputs[i];
        input.value = token;
        try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
        any = true;
      }
      return any;
    } catch (e) { return false; }
  }

  // Each captcha type has its canonical response field. Fill all that apply
  // when a token comes back — pages can use either.
  var RESPONSE_FIELDS_BY_TYPE = {
    turnstile: ['cf-turnstile-response', 'cf_challenge_response'],
    hcaptcha: ['h-captcha-response', 'g-recaptcha-response'], // hCaptcha drop-in mode also fills g-recaptcha-response
    'recaptcha-v2': ['g-recaptcha-response'],
    'recaptcha-v3': ['g-recaptcha-response'],
  };

  function handleReplyEnvelope(data) {
    if (!data || typeof data !== 'object') return;
    var result = data.__ddx_captcha_res;
    if (!result || typeof result !== 'object') return;
    var entry = pending[result.requestId];
    if (!entry) return;
    delete pending[result.requestId];
    processReply(entry, result);
  }

  // Reply listeners — accept replies from either the MessagePort
  // (preferred, see handshake above) OR the regular window.message
  // path (legacy fallback for when the port handshake fails).
  if (__ddxReplyPort) {
    try {
      __ddxReplyPort.addEventListener('message', function (event) {
        handleReplyEnvelope(event && event.data);
      });
    } catch (e) {}
  }
  window.addEventListener('message', function (event) {
    handleReplyEnvelope(event && event.data);
  });

  function processReply(entry, result) {

    // RequestResponseChannel sends `{requestId, ok, result | error}`.
    // Normalize to the legacy `{token | error}` shape this hook was
    // written against — both flat-token and ok/result envelopes are
    // accepted so a future protocol tweak doesn't require hook changes.
    var ok = (result.ok === true) || (typeof result.token === 'string' && result.token.length > 0);
    var token = (typeof result.result === 'string' && result.result) || result.token || '';
    var errorCode = result.error || (ok ? null : 'ddx_solver_failed');

    if (ok && token) {
      // Record the token against its widgetId so getResponse(widgetId) can
      // return it for poll-based integrations.
      if (entry.widgetId) {
        try { widgetTokens[entry.widgetId] = token; } catch (e) {}
      }
      var fields = (RESPONSE_FIELDS_BY_TYPE[entry.type] || ['cf-turnstile-response']).slice();
      if (entry.responseFieldName && fields.indexOf(entry.responseFieldName) === -1) {
        fields.unshift(entry.responseFieldName);
      }
      for (var i = 0; i < fields.length; i++) fillResponseField(document, fields[i], token);
      try { window.__ddx_captcha_last_token = token; } catch (e) {}
      if (typeof entry.callback === 'function') {
        try { entry.callback(token); } catch (e) {}
      }
      if (entry.resolve) {
        try { entry.resolve(token); } catch (e) {}
      }
    } else {
      var code = errorCode || 'ddx_solver_failed';
      if (typeof entry.errorCallback === 'function') {
        try { entry.errorCallback(code); } catch (e) {}
      }
      if (entry.reject) {
        try { entry.reject(new Error(code)); } catch (e) {}
      }
    }
  }

  // Posts a solve request to the host bridge and registers a widget so the
  // result can be routed back via callback, response-field injection, AND
  // getResponse(widgetId) polling. Returns the widgetId (already prefixed).
  function postSolveRequest(type, sitekey, opts, extras) {
    opts = opts || {};
    extras = extras || {};
    var requestId = genId();
    var widgetId = extras.widgetId || (WIDGET_PREFIX[type] || 'cf-chl-widget-') + requestId;
    try {
      widgetTokens[widgetId] = '';
      widgetMeta[widgetId] = { type: type, sitekey: sitekey, opts: opts, extras: extras };
    } catch (e) {}
    pending[requestId] = {
      type: type,
      sitekey: sitekey,
      widgetId: widgetId,
      callback: opts.callback,
      errorCallback: opts['error-callback'] || opts['errorCallback'] || opts['error-callback'.replace('-', '')],
      responseFieldName: opts['response-field-name'],
      resolve: extras.resolve,
      reject: extras.reject,
    };
    try {
      window.parent.postMessage({
        __ddx_captcha_req: {
          requestId: requestId,
          type: type,
          sitekey: sitekey,
          pageUrl: location.href,
          action: opts.action || extras.action || null,
          cData: opts.cData || opts.cdata || null,
          // Solve with the SAME User-Agent that will submit the token —
          // CF can reject a Turnstile token whose UA doesn't match the
          // client.
          userAgent: (function () { try { return navigator.userAgent; } catch (e) { return null; } })(),
          invisible: !!(opts.size === 'invisible' || extras.invisible),
          enterprise: !!extras.enterprise,
          minScore: extras.minScore,
        }
      }, '*');
      try { console.log('[ddx-captcha-hook] ' + type + ' solve posted', requestId, sitekey); } catch (e) {}
    } catch (e) {
      delete pending[requestId];
      if (extras.reject) extras.reject(e);
    }
    return widgetId;
  }

  // ============================================================
  // Turnstile
  // ============================================================
  function wrapTurnstileRender(orig) {
    return function (container, opts) {
      opts = opts || {};
      try {
        console.log('[ddx-captcha-hook] turnstile.render INTERCEPTED', {
          sitekey: opts.sitekey ? String(opts.sitekey).slice(0, 32) : null,
          action: opts.action || null,
          cData: opts.cData || opts.cdata || null,
          responseFieldName: opts['response-field-name'],
          optKeys: Object.keys(opts).join(','),
        });
      } catch (e) {}
      if (!opts.sitekey) return orig.call(this, container, opts);
      return postSolveRequest('turnstile', opts.sitekey, opts);
    };
  }

  // ============================================================
  // Generic getResponse / reset / remove wrappers.
  //
  // Cloudflare Turnstile, hCaptcha, and reCAPTCHA share these method names
  // with the same semantics. Since we short-circuit render() (no real widget
  // iframe is ever created), the real getResponse() knows nothing about our
  // synthetic widgetIds — so we answer from our own token store, falling
  // back to the original for any widget we didn't create.
  // ============================================================
  function wrapGetResponse(orig) {
    return function (widgetId) {
      try {
        if (widgetId != null && Object.prototype.hasOwnProperty.call(widgetTokens, widgetId)) {
          return widgetTokens[widgetId] || '';
        }
        // No-arg form (single-widget pages): return the most recent token.
        if (widgetId == null) {
          var keys = Object.keys(widgetTokens);
          for (var i = keys.length - 1; i >= 0; i--) {
            if (widgetTokens[keys[i]]) return widgetTokens[keys[i]];
          }
        }
      } catch (e) {}
      try { return orig ? orig.apply(this, arguments) : undefined; } catch (e) { return undefined; }
    };
  }
  function wrapReset(orig) {
    return function (widgetId) {
      try {
        var meta = (widgetId != null) ? widgetMeta[widgetId] : null;
        if (meta) {
          widgetTokens[widgetId] = '';
          // Re-solve, reusing the same widgetId so callers keep their handle.
          postSolveRequest(meta.type, meta.sitekey, meta.opts, { widgetId: widgetId });
          return;
        }
      } catch (e) {}
      try { return orig ? orig.apply(this, arguments) : undefined; } catch (e) {}
    };
  }
  function wrapRemove(orig) {
    return function (widgetId) {
      try {
        if (widgetId != null && Object.prototype.hasOwnProperty.call(widgetTokens, widgetId)) {
          delete widgetTokens[widgetId];
          delete widgetMeta[widgetId];
        }
      } catch (e) {}
      try { return orig ? orig.apply(this, arguments) : undefined; } catch (e) {}
    };
  }

  // ============================================================
  // hCaptcha
  // ============================================================
  function wrapHcaptchaRender(orig) {
    return function (container, opts) {
      opts = opts || {};
      try { console.log('[ddx-captcha-hook] hcaptcha.render INTERCEPTED', { sitekey: opts.sitekey }); } catch (e) {}
      if (!opts.sitekey) return orig.call(this, container, opts);
      return postSolveRequest('hcaptcha', opts.sitekey, opts, {
        invisible: opts.size === 'invisible',
      });
    };
  }
  function wrapHcaptchaExecute(orig) {
    return function (widgetIdOrOpts, opts) {
      // hcaptcha.execute(widgetId) or hcaptcha.execute(opts)
      try { console.log('[ddx-captcha-hook] hcaptcha.execute INTERCEPTED'); } catch (e) {}
      var resolve, reject;
      var p = new Promise(function (r, j) { resolve = r; reject = j; });
      var sitekey = (opts && opts.sitekey) || (widgetIdOrOpts && widgetIdOrOpts.sitekey) || window.__ddx_captcha_last_hcaptcha_sitekey;
      if (!sitekey) return orig.apply(this, arguments);
      postSolveRequest('hcaptcha', sitekey, {}, { resolve: resolve, reject: reject, invisible: true });
      return p;
    };
  }

  // ============================================================
  // reCAPTCHA (Google)
  // ============================================================
  function wrapGrecaptchaRender(orig) {
    return function (container, opts) {
      opts = opts || {};
      try { console.log('[ddx-captcha-hook] grecaptcha.render INTERCEPTED', { sitekey: opts.sitekey, size: opts.size }); } catch (e) {}
      if (!opts.sitekey) return orig.call(this, container, opts);
      // Remember sitekey so a later grecaptcha.execute(widgetId) without opts
      // can fall back to it.
      try { window.__ddx_captcha_last_recaptcha_sitekey = opts.sitekey; } catch (e) {}
      return postSolveRequest('recaptcha-v2', opts.sitekey, opts, {
        invisible: opts.size === 'invisible',
      });
    };
  }
  function wrapGrecaptchaExecute(orig) {
    // v3 entry point — `grecaptcha.execute(sitekey, {action})` returns a Promise.
    return function (sitekey, opts) {
      opts = opts || {};
      try { console.log('[ddx-captcha-hook] grecaptcha.execute INTERCEPTED', { sitekey: sitekey, action: opts.action }); } catch (e) {}
      // If invoked with no sitekey arg (rare — v2 invisible re-trigger), fall back.
      if (typeof sitekey !== 'string' || !sitekey) return orig.apply(this, arguments);
      var resolve, reject;
      var p = new Promise(function (r, j) { resolve = r; reject = j; });
      postSolveRequest('recaptcha-v3', sitekey, {}, {
        resolve: resolve,
        reject: reject,
        action: opts.action,
        minScore: opts.minScore,
      });
      return p;
    };
  }

  // ============================================================
  // Generic global-wrapper installer (turnstile / hcaptcha / grecaptcha)
  // ============================================================
  function wrapApi(globalName, methodWraps, hookedKey) {
    var api = window[globalName];
    if (!api || typeof api !== 'object' || api[hookedKey]) return false;
    var didWrap = false;
    for (var method in methodWraps) {
      if (!Object.prototype.hasOwnProperty.call(methodWraps, method)) continue;
      var origFn = api[method];
      if (typeof origFn !== 'function') continue;
      try {
        var wrapped = methodWraps[method](origFn);
        var captured = origFn;
        Object.defineProperty(api, method, {
          configurable: true,
          enumerable: true,
          get: function (w) { return function () { return w; }; }(wrapped),
          set: function (v) { captured = v; }, // ignored after first wrap
        });
        void captured;
        didWrap = true;
      } catch (e) {
        try { api[method] = methodWraps[method](origFn); didWrap = true; } catch (_) {}
      }
    }
    if (didWrap) {
      try { api[hookedKey] = true; } catch (e) {}
      try { console.log('[ddx-captcha-hook] ' + globalName + ' wrapped'); } catch (e) {}
    }
    return didWrap;
  }

  function tryWrapAll() {
    var anyWrapped = false;
    if (wrapApi('turnstile', {
      render: wrapTurnstileRender,
      getResponse: wrapGetResponse,
      reset: wrapReset,
      remove: wrapRemove,
    }, '__ddx_captcha_hooked')) anyWrapped = true;
    if (wrapApi('hcaptcha', {
      render: wrapHcaptchaRender,
      execute: wrapHcaptchaExecute,
      getResponse: wrapGetResponse,
      reset: wrapReset,
      remove: wrapRemove,
    }, '__ddx_captcha_hooked')) anyWrapped = true;
    if (wrapApi('grecaptcha', {
      render: wrapGrecaptchaRender,
      execute: wrapGrecaptchaExecute,
      getResponse: wrapGetResponse,
      reset: wrapReset,
    }, '__ddx_captcha_hooked')) anyWrapped = true;
    // grecaptcha.enterprise is reCAPTCHA Enterprise — same API surface.
    if (window.grecaptcha && window.grecaptcha.enterprise) {
      try {
        var ent = window.grecaptcha.enterprise;
        if (!ent.__ddx_captcha_hooked) {
          if (typeof ent.render === 'function') ent.render = wrapGrecaptchaRender(ent.render);
          if (typeof ent.execute === 'function') ent.execute = wrapGrecaptchaExecute(ent.execute);
          ent.__ddx_captcha_hooked = true;
          anyWrapped = true;
        }
      } catch (e) {}
    }
    return anyWrapped;
  }

  // ============================================================
  // Auto-render handling.
  //
  // Cloudflare Turnstile, hCaptcha, and reCAPTCHA all support "implicit"
  // rendering: their api.js scans the DOM for <div class="cf-turnstile">,
  // <div class="h-captcha">, <div class="g-recaptcha"> on load and renders
  // any matching divs automatically — using INTERNAL closure references to
  // the render fn, which our window.turnstile.render wrap can NOT intercept.
  //
  // Workaround: before api.js scans, strip the trigger class so api.js sees
  // nothing, then synthesise the solve ourselves using data-* attributes.
  // Result token is fed to the page-provided data-callback global AND
  // injected into the canonical hidden response field. dash.cloudflare.com
  // uses this path.
  // ============================================================
  var AUTO_RENDER_CONFIGS = [
    {
      type: 'turnstile',
      className: 'cf-turnstile',
      responseFieldName: 'cf-turnstile-response',
    },
    {
      type: 'hcaptcha',
      className: 'h-captcha',
      responseFieldName: 'h-captcha-response',
    },
    {
      type: 'recaptcha-v2',
      className: 'g-recaptcha',
      responseFieldName: 'g-recaptcha-response',
    },
  ];

  function resolveGlobalCallback(name) {
    if (!name || typeof name !== 'string') return undefined;
    try {
      // Support dotted paths like "myObj.handleSolve".
      var parts = name.split('.');
      var ctx = window;
      for (var i = 0; i < parts.length; i++) {
        if (!ctx) return undefined;
        ctx = ctx[parts[i]];
      }
      return typeof ctx === 'function' ? ctx : undefined;
    } catch (e) { return undefined; }
  }

  function ensureResponseInput(el, fieldName) {
    try {
      var form = el.closest ? el.closest('form') : null;
      var scope = form || document;
      if (scope.querySelector('input[name="' + fieldName + '"], textarea[name="' + fieldName + '"]')) return;
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = fieldName;
      (form || el).appendChild(input);
    } catch (e) {}
  }

  function processAutoRenderDivs() {
    for (var c = 0; c < AUTO_RENDER_CONFIGS.length; c++) {
      var cfg = AUTO_RENDER_CONFIGS[c];
      var nodes;
      try { nodes = document.getElementsByClassName(cfg.className); } catch (e) { continue; }
      if (!nodes || !nodes.length) continue;
      var arr = [];
      for (var i = 0; i < nodes.length; i++) arr.push(nodes[i]);
      for (var j = 0; j < arr.length; j++) {
        var el = arr[j];
        if (el.__ddx_captcha_auto_handled) continue;
        var sitekey = el.getAttribute('data-sitekey');
        if (!sitekey) continue;
        el.__ddx_captcha_auto_handled = true;
        try {
          // Hide from api.js's auto-scan selector. Keep a parallel class so
          // the page's CSS still targets it (most use .cf-turnstile etc. for
          // sizing/positioning).
          el.classList.remove(cfg.className);
          el.classList.add(cfg.className + '-ddx');
        } catch (e) {}

        var callbackName = el.getAttribute('data-callback');
        var errorCbName = el.getAttribute('data-error-callback') || el.getAttribute('data-expired-callback');
        var responseFieldName = el.getAttribute('data-response-field-name') || cfg.responseFieldName;
        var opts = {
          sitekey: sitekey,
          callback: resolveGlobalCallback(callbackName),
          'error-callback': resolveGlobalCallback(errorCbName),
          'response-field-name': responseFieldName,
          size: el.getAttribute('data-size') || undefined,
          action: el.getAttribute('data-action') || undefined,
          cData: el.getAttribute('data-cdata') || undefined,
        };
        try {
          console.log('[ddx-captcha-hook] auto-render INTERCEPTED', {
            type: cfg.type,
            sitekey: String(sitekey).slice(0, 32),
            callback: callbackName || null,
            responseFieldName: responseFieldName,
          });
        } catch (e) {}

        ensureResponseInput(el, responseFieldName);

        var extras = {};
        if (cfg.type === 'hcaptcha') extras.invisible = opts.size === 'invisible';
        postSolveRequest(cfg.type, sitekey, opts, extras);
      }
    }
  }

  // ============================================================
  // Script-tag detection — hook the ?onload= callback so we wrap the
  // captcha API the instant it loads, BEFORE any page code uses it.
  // ============================================================
  var API_SCRIPT_PATTERNS = [
    { regex: /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/, defaultOnload: null },
    { regex: /(js\.hcaptcha\.com|hcaptcha\.com)\/1\/api\.js/, defaultOnload: null },
    { regex: /(www\.google\.com|www\.recaptcha\.net|www\.google\.cn|recaptcha\.net)\/recaptcha\/(api|enterprise)\.js/, defaultOnload: null },
  ];

  function hookOnloadParam(scriptEl) {
    try {
      var src = scriptEl.src || scriptEl.getAttribute('src') || '';
      if (!src) return;
      var matched = false;
      for (var i = 0; i < API_SCRIPT_PATTERNS.length; i++) {
        if (API_SCRIPT_PATTERNS[i].regex.test(src)) { matched = true; break; }
      }
      if (!matched) return;
      if (scriptEl.__ddx_captcha_handled) return;
      scriptEl.__ddx_captcha_handled = true;
      var u;
      try { u = new URL(src, location.href); } catch (e) { return; }
      var onloadName = u.searchParams.get('onload');
      try { console.log('[ddx-captcha-hook] captcha api.js detected:', src.slice(0, 80), 'onload=', onloadName); } catch (e) {}
      if (onloadName) {
        var origOnload = window[onloadName];
        var wrappedOnload = function () {
          try { console.log('[ddx-captcha-hook] api.js onload firing, wrapping captcha apis'); } catch (e) {}
          tryWrapAll();
          if (typeof origOnload === 'function') return origOnload.apply(this, arguments);
        };
        try {
          Object.defineProperty(window, onloadName, {
            configurable: true,
            enumerable: true,
            get: function () { return wrappedOnload; },
            set: function (v) { origOnload = v; },
          });
        } catch (e) {
          window[onloadName] = wrappedOnload;
        }
      }

      // RACE FIX (the important one for SPAs like dash.cloudflare.com):
      // Most captcha integrations inject api.js dynamically then call
      // render() from the script's load handler:
      //   const s = document.createElement('script'); s.src = '...api.js';
      //   s.onload = () => turnstile.render(el, { sitekey, callback });
      //   document.head.appendChild(s);
      // By the time the load event fires, api.js has executed and assigned
      // window.turnstile — but the page's load handler calls render() before
      // our 50ms backstop poll has a chance to wrap it, so the REAL render
      // runs and the challenge iframe is created (which then can't complete
      // its postMessage handshake through the proxy).
      //
      // We can't pre-define window.turnstile as an accessor — Cloudflare's
      // api.js treats an existing `turnstile` property as "already loaded"
      // and bails. Instead we chain the SCRIPT element's own load handler:
      // our wrap installs synchronously the instant api.js finishes, BEFORE
      // the page's load handler runs, so its render() call hits our wrapper.
      try {
        var prevOnload = scriptEl.onload;
        scriptEl.onload = function () {
          try { console.log('[ddx-captcha-hook] api.js load — installing wrap before page handler'); } catch (e) {}
          try { tryWrapAll(); } catch (e) {}
          if (typeof prevOnload === 'function') return prevOnload.apply(this, arguments);
        };
      } catch (e) {}
      // Secondary: a capture-phase load listener as a backstop for the
      // addEventListener('load', …) registration style.
      try {
        scriptEl.addEventListener('load', function () { try { tryWrapAll(); } catch (e) {} }, { capture: true });
      } catch (e) {}

      // Also start backstop polling — covers no-onload scripts and any
      // captcha API that lands without going through our onload wrapper.
      startBackstopPoll();
    } catch (e) {
      try { console.warn('[ddx-captcha-hook] hookOnloadParam failed', e && e.message); } catch (_) {}
    }
  }

  var backstopStarted = false;
  function startBackstopPoll() {
    if (backstopStarted) return;
    backstopStarted = true;
    var ticks = 0;
    var h = setInterval(function () {
      tryWrapAll();
      processAutoRenderDivs();
      if (ticks++ > 400) clearInterval(h);
    }, 50);
  }

  // STRONGEST race fix: instrument script elements at CREATION time, before
  // the page assigns its own load handler. A capture-phase 'load' listener
  // registered here fires in registration order ahead of the page's handler
  // (which it registers later, after createElement returns) — regardless of
  // whether the page uses `script.onload =` or `addEventListener('load')`.
  // So when api.js finishes loading, we wrap window.turnstile.render BEFORE
  // the page's handler calls render(). This deterministically wins the race
  // that pure 50ms polling loses on SPAs like dash.cloudflare.com.
  //
  // We only ADD a listener and always return the genuine element — never
  // alter createElement's behaviour — so this stays compatible with the
  // proxy's own DOM patching.
  try {
    var __ddxOrigCreateElement = document.createElement;
    document.createElement = function (tagName) {
      var el = __ddxOrigCreateElement.apply(this, arguments);
      try {
        if (typeof tagName === 'string' && tagName.toLowerCase() === 'script') {
          el.addEventListener('load', function () {
            try {
              var s = el.src || el.getAttribute('src') || '';
              if (!s) return;
              for (var i = 0; i < API_SCRIPT_PATTERNS.length; i++) {
                if (API_SCRIPT_PATTERNS[i].regex.test(s)) {
                  try { console.log('[ddx-captcha-hook] api.js load (createElement listener) — wrapping first'); } catch (e) {}
                  tryWrapAll();
                  break;
                }
              }
            } catch (e) {}
          }, true);
        }
      } catch (e) {}
      return el;
    };
  } catch (e) {
    try { console.warn('[ddx-captcha-hook] createElement instrumentation failed', e && e.message); } catch (_) {}
  }

  function scanExistingScripts() {
    try {
      var nodes = document.querySelectorAll('script[src]');
      for (var i = 0; i < nodes.length; i++) hookOnloadParam(nodes[i]);
    } catch (e) {}
  }
  scanExistingScripts();
  // Static divs that were inline in the HTML are already in the DOM at hook
  // install time — process them now so api.js never sees the class.
  processAutoRenderDivs();

  try {
    var obs = new MutationObserver(function (mutations) {
      var sawCaptchaDiv = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (!n) continue;
          if (n.tagName === 'SCRIPT') { hookOnloadParam(n); continue; }
          if (n.nodeType === 1) {
            // Cheap pre-check before walking descendants
            try {
              for (var k = 0; k < AUTO_RENDER_CONFIGS.length; k++) {
                if (n.classList && n.classList.contains(AUTO_RENDER_CONFIGS[k].className)) { sawCaptchaDiv = true; break; }
              }
              if (!sawCaptchaDiv && n.querySelector) {
                for (var k2 = 0; k2 < AUTO_RENDER_CONFIGS.length; k2++) {
                  if (n.querySelector('.' + AUTO_RENDER_CONFIGS[k2].className)) { sawCaptchaDiv = true; break; }
                }
              }
            } catch (e) {}
          }
        }
        // class attr being set on an existing div would also matter, but
        // most real-world auto-render divs are emitted with the class set,
        // not added via setAttribute.
      }
      if (sawCaptchaDiv) processAutoRenderDivs();
    });
    obs.observe(document.documentElement || document, { childList: true, subtree: true });
  } catch (e) {
    try { console.warn('[ddx-captcha-hook] MutationObserver failed', e && e.message); } catch (_) {}
    startBackstopPoll();
  }

  // Always start backstop too — covers dynamic API loads with no script tag.
  startBackstopPoll();
})(); } catch (__ddx_captcha_hook_e__) {
  try { console.error('[ddx-captcha-hook] fatal hook error (continuing without interception):', __ddx_captcha_hook_e__); } catch (_) {}
}
