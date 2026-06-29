// src/browser/sitePermissions/scramjetPlugin.ts
//
// Scramjet plugin that patches Web Platform permission-requesting
// APIs in every proxied iframe so DDX can mediate per-origin grants
// through the host (SitePermissionsStore + Nightmare prompt UI).
//
// Patched surfaces:
//   - navigator.permissions.query({name}) — reports the stored
//     state without prompting.
//   - Notification.requestPermission(cb?) — asks the host; sets
//     Notification.permission accordingly.
//   - navigator.geolocation.getCurrentPosition / watchPosition —
//     asks the host before calling through to the native API.
//   - navigator.mediaDevices.getUserMedia({audio, video}) — asks
//     the host before calling through.
//   - navigator.mediaDevices.getDisplayMedia — asks the host before
//     calling through. (display-capture)
//
// Wire flow (in-iframe):
//   1. Patch API entry points.
//   2. On call, postMessage `{__ddxSitePermission, reqId, origin, name}`
//      to `window.parent` (host).
//   3. Wait for `{__ddxSitePermissionResp, reqId, state}`.
//   4. If granted, call through to the native API; if denied,
//      reject with a DOMException matching Chrome's behavior.
//
// Hooks `frame.hooks.init.post` — runs AFTER ScramjetClient is
// installed in the iframe, BEFORE the page's own scripts execute.
// We patch on the iframe's `window` so the patches are visible to
// page code.

/**
 * `frame.hooks.init.post` dispatches its tap callbacks with a SINGLE
 * argument — the frame init context — not a `(ctx, props)` pair.
 * See `src/core/SJ/controller/src/inject.ts:366-375` for the
 * dispatch site: `frameInitContext = {window, client, isTopLevel}`.
 *
 * Earlier versions of this plugin used `(ctxArg, propsArg)` which
 * silently set `propsArg = {}` and then crashed reading
 * `props.window`. The shape mirrors `src/apis/devtools/hookInstaller.ts:210`.
 */
interface ScramjetInitContext {
  window: Window & typeof globalThis;
  client?: unknown;
  isTopLevel?: boolean;
}

interface ScramjetFrameLike {
  hooks: {
    init: {
      post: unknown;
    };
    fetch?: unknown;
  };
}

const HOST_TIMEOUT_MS = 60_000; // give the user time to consider the prompt

/**
 * In-iframe helper: ask the host for permission. Resolves to the
 * granted/denied state.
 */
function askHostScript(origin: string, name: string): Promise<'granted' | 'denied'> {
  // Generate a request id within this iframe; the host echoes it
  // back in the reply.
  const reqId = Math.floor(Math.random() * 2 ** 53);
  return new Promise((resolve) => {
    let settled = false;
    const onReply = (e: MessageEvent): void => {
      const data = e.data as
        | { __ddxSitePermissionResp?: true; reqId?: number; state?: string }
        | null;
      if (!data?.__ddxSitePermissionResp) return;
      if (data.reqId !== reqId) return;
      window.removeEventListener('message', onReply);
      if (settled) return;
      settled = true;
      resolve(data.state === 'granted' ? 'granted' : 'denied');
    };
    window.addEventListener('message', onReply);
    setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onReply);
      resolve('denied');
    }, HOST_TIMEOUT_MS);
    try {
      window.parent.postMessage(
        { __ddxSitePermission: true, reqId, origin, name },
        '*',
      );
    } catch (err) {
      console.warn('[sitePerms/page] host postMessage failed:', err);
      if (!settled) {
        settled = true;
        resolve('denied');
      }
    }
  });
}

/**
 * The patching script. Stringified and `eval`'d in the iframe via
 * the init.post hook. Kept as a single function body so we can
 * serialize it cleanly.
 */
function installPatches(): void {
  // ── helpers ────────────────────────────────────────────────────
  const origin = window.location.origin;
  const reqId = (): number => Math.floor(Math.random() * 2 ** 53);
  const HOST_TIMEOUT = 60_000;

  function askHost(name: string): Promise<'granted' | 'denied'> {
    const id = reqId();
    return new Promise((resolve) => {
      let settled = false;
      const onReply = (e: MessageEvent): void => {
        const d = e.data as
          | { __ddxSitePermissionResp?: true; reqId?: number; state?: string }
          | null;
        if (!d?.__ddxSitePermissionResp) return;
        if (d.reqId !== id) return;
        window.removeEventListener('message', onReply);
        if (settled) return;
        settled = true;
        resolve(d.state === 'granted' ? 'granted' : 'denied');
      };
      window.addEventListener('message', onReply);
      setTimeout(() => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onReply);
        resolve('denied');
      }, HOST_TIMEOUT);
      try {
        window.parent.postMessage(
          { __ddxSitePermission: true, reqId: id, origin, name },
          '*',
        );
      } catch {
        if (!settled) { settled = true; resolve('denied'); }
      }
    });
  }

  // ── navigator.permissions.query ────────────────────────────────
  try {
    const navPerms = (navigator as Navigator & { permissions?: { query?: unknown } }).permissions;
    if (navPerms?.query) {
      const original = (navPerms.query as Function).bind(navPerms);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navPerms.query = (async (desc: any) => {
        try {
          const state = await askHostQuery(desc?.name);
          if (state === 'granted' || state === 'denied') {
            return makePermissionStatus(state);
          }
        } catch { /* fall through */ }
        return original(desc);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;
    }
  } catch (err) { console.warn('[sitePerms/page] permissions.query patch failed:', err); }

  /**
   * Like askHost but doesn't trigger a prompt — used by
   * permissions.query which is read-only per Web spec.
   *
   * Implementation: we use a special message variant
   * `{__ddxSitePermissionQuery:true}` that the host treats as
   * pure-read (no prompt UI). The host falls back to 'prompt' which
   * we map back to "native behavior" (return whatever the unpatched
   * API would).
   */
  function askHostQuery(name: string): Promise<'granted' | 'denied' | 'prompt'> {
    const id = reqId();
    return new Promise((resolve) => {
      let settled = false;
      const onReply = (e: MessageEvent): void => {
        const d = e.data as { __ddxSitePermissionResp?: true; reqId?: number; state?: string } | null;
        if (!d?.__ddxSitePermissionResp || d.reqId !== id) return;
        window.removeEventListener('message', onReply);
        if (settled) return;
        settled = true;
        const s = d.state;
        resolve(s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'prompt');
      };
      window.addEventListener('message', onReply);
      setTimeout(() => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onReply);
        resolve('prompt');
      }, 1500);
      try {
        window.parent.postMessage(
          { __ddxSitePermission: true, __query: true, reqId: id, origin, name },
          '*',
        );
      } catch {
        if (!settled) { settled = true; resolve('prompt'); }
      }
    });
  }

  function makePermissionStatus(state: string): { state: string; onchange: null } {
    return { state, onchange: null };
  }

  // ── Notification.requestPermission ─────────────────────────────
  try {
    const Notif = (window as Window & { Notification?: typeof Notification }).Notification;
    if (Notif && typeof Notif.requestPermission === 'function') {
      const origReq = Notif.requestPermission.bind(Notif);
      Notif.requestPermission = ((cb?: (permission: NotificationPermission) => void) => {
        const p = askHost('notifications').then((state) => {
          const perm: NotificationPermission = state === 'granted' ? 'granted' : 'denied';
          // Best-effort: reflect into Notification.permission.
          try {
            Object.defineProperty(Notif, 'permission', { value: perm, configurable: true });
          } catch { /* swallow */ }
          if (typeof cb === 'function') cb(perm);
          return perm;
        }).catch(() => {
          if (typeof cb === 'function') cb('denied');
          return 'denied' as NotificationPermission;
        });
        return p;
      }) as typeof Notif.requestPermission;
      // Also intercept the constructor — if state is denied, drop the
      // notification. Best-effort.
      // Skipped for now: page can pre-check Notification.permission.
      void origReq;
    }
  } catch (err) { console.warn('[sitePerms/page] Notification patch failed:', err); }

  // ── navigator.geolocation ──────────────────────────────────────
  try {
    const geo = navigator.geolocation;
    if (geo) {
      const origGet = geo.getCurrentPosition.bind(geo);
      const origWatch = geo.watchPosition.bind(geo);
      geo.getCurrentPosition = (
        success: PositionCallback,
        error?: PositionErrorCallback | null,
        options?: PositionOptions,
      ) => {
        void askHost('geolocation').then((state) => {
          if (state === 'granted') {
            try {
              origGet(success, error ?? undefined, options);
            } catch (e) { error?.({ code: 2, message: String(e), PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError); }
          } else {
            error?.({ code: 1, message: 'User denied geolocation', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
          }
        });
      };
      geo.watchPosition = (
        success: PositionCallback,
        error?: PositionErrorCallback | null,
        options?: PositionOptions,
      ): number => {
        // We can't return the watch id synchronously while gated on
        // a prompt. Return a synthetic id and start the watch async.
        let realId = -1;
        const synthId = Math.floor(Math.random() * 2 ** 30);
        void askHost('geolocation').then((state) => {
          if (state === 'granted') {
            try {
              realId = origWatch(success, error ?? undefined, options);
            } catch (e) { error?.({ code: 2, message: String(e), PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError); }
          } else {
            error?.({ code: 1, message: 'User denied geolocation', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
          }
        });
        // Pair the synth id with the real one so clearWatch(synth)
        // can resolve.
        watchMap.set(synthId, () => realId);
        return synthId;
      };
      const watchMap = new Map<number, () => number>();
      const origClear = geo.clearWatch.bind(geo);
      geo.clearWatch = (synthId: number) => {
        const resolver = watchMap.get(synthId);
        if (resolver) {
          const real = resolver();
          if (real >= 0) origClear(real);
          watchMap.delete(synthId);
        } else {
          origClear(synthId);
        }
      };
    }
  } catch (err) { console.warn('[sitePerms/page] geolocation patch failed:', err); }

  // ── navigator.mediaDevices.{getUserMedia, getDisplayMedia} ─────
  try {
    const md = navigator.mediaDevices;
    if (md && typeof md.getUserMedia === 'function') {
      const origUM = md.getUserMedia.bind(md);
      md.getUserMedia = async (constraints?: MediaStreamConstraints): Promise<MediaStream> => {
        const wantsVideo = !!constraints?.video;
        const wantsAudio = !!constraints?.audio;
        if (wantsVideo) {
          const state = await askHost('camera');
          if (state !== 'granted') throw new DOMException('Permission denied', 'NotAllowedError');
        }
        if (wantsAudio) {
          const state = await askHost('microphone');
          if (state !== 'granted') throw new DOMException('Permission denied', 'NotAllowedError');
        }
        return origUM(constraints);
      };
    }
    if (md && typeof md.getDisplayMedia === 'function') {
      const origDM = md.getDisplayMedia.bind(md);
      md.getDisplayMedia = async (constraints?: DisplayMediaStreamOptions): Promise<MediaStream> => {
        const state = await askHost('display-capture');
        if (state !== 'granted') throw new DOMException('Permission denied', 'NotAllowedError');
        return origDM(constraints);
      };
    }
  } catch (err) { console.warn('[sitePerms/page] mediaDevices patch failed:', err); }
}

/**
 * Stringify the patcher function for `eval()` in the iframe realm.
 * We can't pass the function reference directly because the iframe
 * runs in a separate Scramjet realm.
 */
const INSTALL_SOURCE = '(' + installPatches.toString() + ')();';

const EVAL_READY_POLL_MS = 25;
const EVAL_READY_MAX_MS = 2000;

/**
 * Wait until the proxied window has both `eval` (the Scramjet-trapped
 * variant) and `document`. Both are installed by ScramjetClient.hook(),
 * which usually runs just BEFORE init.post, but subframe `hookSubcontext`
 * paths fire init.post earlier — before the client has finished
 * patching the global. Mirrors the polling pattern in
 * `src/apis/devtools/hookInstaller.ts:107-124`.
 */
function waitForEvalReady(win: Window): Promise<Window> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = (): void => {
      const w = win as Window & { eval?: unknown; document?: Document };
      if (typeof w.eval === 'function' && w.document) {
        resolve(win);
        return;
      }
      if (Date.now() - start > EVAL_READY_MAX_MS) {
        reject(new Error('timed out waiting for proxied eval'));
        return;
      }
      setTimeout(tick, EVAL_READY_POLL_MS);
    };
    tick();
  });
}

export class DdxSitePermissionsPlugin {
  public readonly name = 'ddx-site-permissions';
  public readonly dependencies: string[] = [];
  private inner: { tap: (hook: unknown, fn: (...args: unknown[]) => unknown) => void } | null = null;

  install(frame: ScramjetFrameLike): void {
    const Plugin = (globalThis as { $scramjet?: { Plugin?: new (name: string) => unknown } })
      .$scramjet?.Plugin;
    if (!Plugin) {
      console.warn('[sitePerms/page] $scramjet.Plugin unavailable — patching disabled');
      return;
    }
    if (!this.inner) {
      this.inner = new Plugin('ddx-site-permissions') as typeof this.inner;
    }
    if (!this.inner) return;
    const initPost = frame.hooks.init.post;
    // tap callbacks receive ONE arg: the frame init context. See the
    // ScramjetInitContext doc above. The previous `(ctxArg, propsArg)`
    // signature was wrong and caused `Cannot read 'eval' of undefined`.
    this.inner.tap(initPost, (ctxArg: unknown) => {
      const ctx = ctxArg as ScramjetInitContext;
      const win = ctx?.window;
      if (!win) return;
      // Don't double-inject if the same window flows through
      // init.post more than once (subframe re-hook scenarios).
      const tagged = win as Window & { __ddxSitePermsInstalled?: boolean };
      if (tagged.__ddxSitePermsInstalled) return;
      // Scramjet's `eval` trap may not be wired immediately on
      // init.post — Scramjet's client hooking is mid-flight when
      // subframes are constructed. Poll the same way devtools'
      // hookInstaller does (READY_POLL_MAX_MS=~1500ms is enough; we
      // give it 2s here).
      void waitForEvalReady(win)
        .then((ready) => {
          try {
            const evalFn = (ready as Window & { eval?: (s: string) => unknown }).eval;
            if (typeof evalFn !== 'function') return;
            tagged.__ddxSitePermsInstalled = true;
            evalFn.call(ready, INSTALL_SOURCE);
          } catch (err) {
            console.warn('[sitePerms/page] inject failed:', err);
          }
        })
        .catch((err) => {
          // Timed out — the iframe likely closed before its eval
          // was ready. Quietly drop.
          console.debug('[sitePerms/page] inject prerequisite wait failed:', err);
        });
    });
  }
}

// Export for test / debugging.
export { askHostScript };
