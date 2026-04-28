# Proxy Integration

This document describes how Helium integrates with the proxy stack to implement content script injection, request interception, and navigation event tracking. Helium requires **no direct UV/Scramjet hooks or configuration** -- all integration flows through Reflux (content injection) and a modified BareMux worker (network interception).

## Design Decision: No Proxy-Specific Hooks

Previous designs considered using UV/Scramjet-specific features like `config.inject` arrays or handler event hooks. These were dropped because:

1. **Scramjet does not support** `config.inject` or equivalent hook points
2. **Proxy coupling** limits portability -- Helium should work with any BareMux-compatible SW proxy
3. **Reflux already provides** `@browser` injection that works across proxy implementations
4. **BareMux worker** is already modified for premium systems and provides a clean network middleware entrypoint

## Integration Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser                                  │
│                                                                 │
│  Page makes fetch/XHR/navigation request                        │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│                   Service Worker                                │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  UV/Scramjet Handler                                     │   │
│  │                                                          │   │
│  │  1. Intercept fetch event                                │   │
│  │  2. Pass to BareMux transport layer                      │   │
│  │  3. Receive response                                     │   │
│  │  4. Rewrite HTML/JS/CSS content                          │   │
│  │  5. Return rewritten response                            │   │
│  │                                                          │   │
│  │  Helium SW addition:                                     │   │
│  │  - Serve /helium-ext/<id>/<path> from virtual FS         │   │
│  │  (This is a fetch handler, not a proxy hook)             │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         │                                       │
│  ┌──────────────────────▼──────────────────────────────────┐   │
│  │  BareMux Worker (modified)                               │   │
│  │                                                          │   │
│  │  Network middleware:                                     │   │
│  │  ├── Helium webRequest plugin (onBeforeRequest, etc.)    │   │
│  │  ├── Helium DNR plugin (declarativeNetRequest rules)     │   │
│  │  ├── Helium cookie interceptor (Set-Cookie capture)      │   │
│  │  └── Other middleware                                    │   │
│  │                                                          │   │
│  │  → Transport fetch (Epoxy/Libcurl)                       │   │
│  │                                                          │   │
│  │  Response middleware:                                    │   │
│  │  ├── Helium webRequest plugin (onHeadersReceived, etc.)  │   │
│  │  ├── Helium cookie interceptor (cookie jar sync)         │   │
│  │  └── Other middleware                                    │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         │                                       │
│  ┌──────────────────────▼──────────────────────────────────┐   │
│  │  Reflux MiddlewareTransport                              │   │
│  │                                                          │   │
│  │  Content injection (response middleware):                │   │
│  │  ├── Evaluate URL against content script match patterns  │   │
│  │  ├── @browser inject: Helium bootstrap script            │   │
│  │  ├── @browser inject: Matching content script CSS        │   │
│  │  └── @browser inject: Matching content script JS         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Content Script Injection via Reflux

### How @browser Injection Works

Reflux's `@browser` injection mechanism inserts scripts and styles into HTML responses at the middleware transport level. When the response passes through Reflux, Helium's injection plugin evaluates the target URL against all registered content script match patterns and injects the appropriate code.

### Injection Plugin

```typescript
// Reflux plugin for content script injection
const heliumInjectionPlugin = {
  name: 'helium-content-injection',
  version: '1.0.0',
  match: { url: '*' },

  responseMiddleware: async (response, request, context) => {
    // Only process HTML responses
    const contentType = response.headers?.['content-type'] || '';
    if (!contentType.includes('text/html')) return response;

    const url = request.url;
    const isMainFrame = context.destination === 'document';

    // Get matching content scripts for this URL
    const plans = contentScriptInjector.getMatchingScripts(url, isMainFrame);
    if (plans.length === 0 && !needsBootstrap(url)) return response;

    // Build injection payloads
    const injections = await contentScriptInjector.buildInjections(plans);

    // Inject via Reflux's @browser mechanism
    // Bootstrap is always injected first (document_start)
    context.injectBrowser(injections.bootstrap);

    // CSS is always injected at document_start
    for (const css of injections.css) {
      context.injectBrowser(css);
    }

    // JS injected according to run_at timing
    for (const js of injections.js) {
      context.injectBrowser(js);
    }

    return response;
  },
};
```

### Content Script Match Evaluation

```typescript
class ContentScriptInjector {
  private registry: RegisteredContentScript[] = [];

  /**
   * Determine which content scripts to inject for a given URL.
   */
  getMatchingScripts(url: string, isMainFrame: boolean): InjectionPlan[] {
    const plans: InjectionPlan[] = [];

    for (const script of this.registry) {
      // 1. Check URL matches
      if (!script.matches.matches(url)) continue;
      if (script.excludeMatches.matches(url)) continue;

      // 2. Check glob patterns
      if (script.includeGlobs.size > 0 && !script.includeGlobs.matches(url)) continue;
      if (script.excludeGlobs.matches(url)) continue;

      // 3. Check frame eligibility
      if (!isMainFrame && !script.allFrames) continue;

      // 4. Check about:blank handling
      if (url === 'about:blank' && !script.matchAboutBlank) continue;

      plans.push({
        extensionId: script.extensionId,
        js: script.js,
        css: script.css,
        runAt: script.runAt,
        world: script.world,
      });
    }

    // Sort by extension ID for deterministic injection order
    plans.sort((a, b) => a.extensionId.localeCompare(b.extensionId));

    return plans;
  }

  /**
   * Build the actual injection payloads for Reflux @browser injection.
   */
  async buildInjections(plans: InjectionPlan[]): Promise<InjectionPayload> {
    const result: InjectionPayload = {
      bootstrap: this.buildBootstrapScript(plans),
      css: [],
      js: [],
    };

    for (const plan of plans) {
      // CSS is always injected at document_start (matching Chrome behavior)
      for (const cssPath of plan.css) {
        const cssContent = await this.readExtensionFile(plan.extensionId, cssPath);
        result.css.push({
          type: 'style',
          content: cssContent,
          attributes: {
            'data-helium-css': plan.extensionId,
            'data-helium-path': cssPath,
          },
        });
      }

      // JS injection
      for (const jsPath of plan.js) {
        const jsContent = await this.readExtensionFile(plan.extensionId, jsPath);
        const wrapped = this.wrapContentScript(plan, jsContent);

        result.js.push({
          type: 'script',
          content: wrapped,
          runAt: plan.runAt,
          attributes: {
            'data-helium-cs': plan.extensionId,
            'data-helium-world': plan.world || 'ISOLATED',
          },
        });
      }
    }

    return result;
  }

  private wrapContentScript(plan: InjectionPlan, code: string): string {
    if (plan.world === 'MAIN') {
      // MAIN world: run directly in page context, no isolation
      return code;
    }

    // ISOLATED world: wrap in IIFE with chrome API
    return `(function(chrome) {
  'use strict';
  ${code}
})(window.__helium_createContentScriptChrome__('${plan.extensionId}'));`;
  }
}
```

### Bootstrap Script

The bootstrap script is injected into every page that has at least one matching content script. It sets up the content script runtime environment:

```typescript
function buildBootstrapScript(plans: InjectionPlan[]): string {
  // Pre-compute extension IDs that need chrome API instances
  const extensionIds = [...new Set(plans.map(p => p.extensionId))];

  return `
(function() {
  // Connect to SharedWorker for messaging
  var sw = new SharedWorker('/helium/router.worker.js');
  var routerPort = sw.port;
  routerPort.start();

  // Active ports for this page
  var activePorts = new Map();

  // Create content script chrome API for an extension
  window.__helium_createContentScriptChrome__ = function(extensionId) {
    var contextId = 'ctx-cs-' + extensionId + '-' + Math.random().toString(36).slice(2);

    // Register with SharedWorker
    routerPort.postMessage({
      type: '__helium_register',
      contextId: contextId,
      contextType: 'CONTENT_SCRIPT',
      extensionId: extensionId,
      tabId: window.__helium_tabId__,
      frameId: 0,
      url: location.href,
    });

    // Build limited chrome API
    return {
      runtime: {
        id: extensionId,
        sendMessage: function(extId, msg, opts, cb) {
          /* route through routerPort */
        },
        onMessage: new ChromeEvent(),
        connect: function(extId, info) {
          /* create port */
        },
        onConnect: new ChromeEvent(),
        getURL: function(path) {
          return '/helium-ext/' + extensionId + '/' + path;
        },
        getManifest: function() {
          /* cached manifest */
        },
        lastError: null,
      },
      storage: {
        local: new StorageArea(/* ... */),
        sync: new StorageArea(/* ... */),
        session: new StorageArea(/* ... */),
        onChanged: new ChromeEvent(),
      },
      i18n: {
        getMessage: function(name, subs) { /* ... */ },
        getUILanguage: function() { return navigator.language; },
        getAcceptLanguages: function(cb) { cb(Array.from(navigator.languages)); },
      },
      extension: {
        getURL: function(path) {
          return '/helium-ext/' + extensionId + '/' + path;
        },
      },
    };
  };

  // Handle incoming messages from SharedWorker
  routerPort.onmessage = function(event) {
    var msg = event.data;
    // Route to appropriate content script chrome instance
  };

  // Report page metadata for tab registry
  routerPort.postMessage({
    type: '__helium_page_info',
    url: location.href,
    title: document.title,
  });

  // Track title changes
  new MutationObserver(function() {
    routerPort.postMessage({
      type: '__helium_page_info',
      url: location.href,
      title: document.title,
    });
  }).observe(document.querySelector('title') || document.head, {
    childList: true, subtree: true, characterData: true
  });

  // Report DOM lifecycle events for webNavigation
  document.addEventListener('DOMContentLoaded', function() {
    routerPort.postMessage({
      type: '__helium_lifecycle',
      event: 'DOMContentLoaded',
      url: location.href,
    });
  });

  window.addEventListener('load', function() {
    routerPort.postMessage({
      type: '__helium_lifecycle',
      event: 'load',
      url: location.href,
    });
  });

  // Track pushState/replaceState for webNavigation.onHistoryStateUpdated
  var origPushState = history.pushState;
  var origReplaceState = history.replaceState;

  history.pushState = function() {
    origPushState.apply(this, arguments);
    routerPort.postMessage({
      type: '__helium_history_state',
      url: location.href,
    });
  };

  history.replaceState = function() {
    origReplaceState.apply(this, arguments);
    routerPort.postMessage({
      type: '__helium_history_state',
      url: location.href,
    });
  };
})();
`;
}
```

### run_at Timing

Content scripts have three injection timing modes. Reflux's `@browser` injection handles these:

| `run_at` | When | Injection Strategy |
|----------|------|-------------------|
| `document_start` | Before any page scripts | Injected at top of `<head>` via @browser |
| `document_end` | After DOM parsed, before subresources | Injected at end of `<body>` or wrapped in `DOMContentLoaded` listener |
| `document_idle` | After page load or after timeout | Wrapped in `load` event listener with idle detection |

```typescript
function wrapForTiming(code: string, runAt: string): string {
  switch (runAt) {
    case 'document_start':
      return code; // Injected at head, runs immediately

    case 'document_end':
      return `
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { ${code} }, {once: true});
} else {
  ${code}
}`;

    case 'document_idle':
      return `
(function() {
  function runIdle() { ${code} }
  if (document.readyState === 'complete') {
    runIdle();
  } else {
    window.addEventListener('load', function() {
      // Match Chrome's idle behavior: run after load or after 200ms, whichever first
      setTimeout(runIdle, 0);
    }, {once: true});
  }
})();`;

    default:
      return code;
  }
}
```

### Dynamic Content Script Registration

When extensions call `chrome.scripting.registerContentScripts()` at runtime, the new scripts need to be available for future page loads. The registration flows from Helium core to the Reflux injection plugin:

```
Extension calls chrome.scripting.registerContentScripts(scripts)
  → Helium core validates and stores registration
  → Posts update to SharedWorker
  → SharedWorker broadcasts to Reflux injection plugin
  → Plugin updates its internal registry
  → Future page loads evaluate the new match patterns
```

For the Reflux plugin to receive updates, it maintains a communication channel with the SharedWorker (via BroadcastChannel or direct MessagePort, depending on the threading context).

## Extension Resource Serving

Extension files (JS, HTML, CSS, images, etc.) are served by a fetch handler in the service worker that intercepts requests to the `/helium-ext/` path prefix. This is NOT a proxy hook -- it's a standard `fetch` event handler registered alongside (or within) the proxy's SW:

```typescript
// In service worker (registered alongside UV/Scramjet):
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);

  // Check if this is a Helium extension resource request
  if (url.pathname.startsWith('/helium-ext/')) {
    event.respondWith(serveExtensionResource(event.request));
    return;
  }

  // Otherwise, let UV/Scramjet handle it
});

async function serveExtensionResource(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathMatch = url.pathname.match(/^\/helium-ext\/([a-p]{32})\/(.+)$/);

  if (!pathMatch) {
    return new Response('Not found', { status: 404 });
  }

  const extensionId = pathMatch[1];
  const resourcePath = pathMatch[2];

  // 1. Check if the resource is web-accessible
  const referer = request.headers.get('Referer') || '';
  const isExtensionContext = referer.includes('/helium-ext/' + extensionId);

  if (!isExtensionContext) {
    const manifest = await getExtensionManifest(extensionId);
    if (!isWebAccessible(manifest, resourcePath, referer)) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  // 2. Read file from virtual filesystem (IndexedDB/OPFS)
  const fileContent = await extensionFS.readFile(extensionId, resourcePath);
  if (!fileContent) {
    return new Response('Not found', { status: 404 });
  }

  // 3. Determine MIME type and return
  const mimeType = getMimeType(resourcePath);

  return new Response(fileContent, {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': fileContent.byteLength.toString(),
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    'html': 'text/html; charset=utf-8',
    'js': 'application/javascript; charset=utf-8',
    'mjs': 'application/javascript; charset=utf-8',
    'css': 'text/css; charset=utf-8',
    'json': 'application/json; charset=utf-8',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'otf': 'font/otf',
    'wasm': 'application/wasm',
    'map': 'application/json',
  };
  return types[ext || ''] || 'application/octet-stream';
}
```

## BareMux Network Middleware

The modified BareMux worker provides the entrypoint for all network-level chrome API functionality. This replaces the previous design of using Reflux plugins for webRequest/DNR.

### Why BareMux Instead of Reflux for Network

- BareMux sits below Reflux in the stack, giving access to all requests including those Reflux might not see
- The BareMux worker is already modified for premium systems, making it a natural extension point
- Network interception (blocking, redirecting, header modification) is fundamentally a transport-level concern
- Reflux's plugin system is better suited for higher-level middleware (like content injection) rather than low-level request manipulation

### webRequest Implementation

```typescript
// Inside the BareMux worker:

interface WebRequestMiddleware {
  onRequest(request: BareMuxRequest, context: RequestContext): Promise<BareMuxRequest | BlockedResponse>;
  onResponse(response: BareMuxResponse, request: BareMuxRequest, context: RequestContext): Promise<BareMuxResponse>;
}

const heliumWebRequest: WebRequestMiddleware = {
  async onRequest(request, context) {
    const details = buildWebRequestDetails(request, context);

    // --- onBeforeRequest ---
    const beforeResult = await emitWebRequestEvent(
      'onBeforeRequest', details, { blocking: true }
    );

    if (beforeResult.cancel) {
      return { blocked: true, reason: 'extension' };
    }
    if (beforeResult.redirectUrl) {
      request.url = beforeResult.redirectUrl;
    }

    // --- onBeforeSendHeaders ---
    const headerResult = await emitWebRequestEvent(
      'onBeforeSendHeaders', details, { blocking: true }
    );

    if (headerResult.requestHeaders) {
      request.headers = headerResult.requestHeaders;
    }

    // --- onSendHeaders (informational only) ---
    emitWebRequestEvent('onSendHeaders', details, { blocking: false });

    return request;
  },

  async onResponse(response, request, context) {
    const details = buildWebResponseDetails(response, request, context);

    // --- onHeadersReceived ---
    const headerResult = await emitWebRequestEvent(
      'onHeadersReceived', details, { blocking: true }
    );

    if (headerResult.responseHeaders) {
      response.headers = headerResult.responseHeaders;
    }
    if (headerResult.redirectUrl) {
      return { redirect: headerResult.redirectUrl };
    }

    // --- onResponseStarted (informational) ---
    emitWebRequestEvent('onResponseStarted', details, { blocking: false });

    // --- onCompleted (informational) ---
    emitWebRequestEvent('onCompleted', details, { blocking: false });

    return response;
  },
};
```

### WebRequest Event Emission

```typescript
/**
 * Emit a webRequest event to all extensions that have listeners.
 * For blocking events, waits for all listeners to respond.
 *
 * Communication from BareMux worker to extension contexts goes through
 * the SharedWorker message backbone.
 */
async function emitWebRequestEvent(
  eventName: string,
  details: WebRequestDetails,
  options: { blocking: boolean }
): Promise<WebRequestResult> {
  const listeners = getWebRequestListeners(eventName);
  const results: WebRequestResult[] = [];

  for (const listener of listeners) {
    // Check URL filter
    if (!listener.filter.urls.matches(details.url)) continue;

    // Check type filter
    if (listener.filter.types && !listener.filter.types.includes(details.type)) continue;

    // Check tab filter
    if (listener.filter.tabId !== undefined && listener.filter.tabId !== details.tabId) continue;

    // Check window filter
    if (listener.filter.windowId !== undefined && listener.filter.windowId !== details.windowId) continue;

    if (options.blocking && listener.extraInfoSpec?.includes('blocking')) {
      // MV2 blocking: send to extension and wait for response
      const result = await sendBlockingWebRequestEvent(
        listener.extensionId, eventName, details
      );
      results.push(result);
    } else {
      // Non-blocking: fire and forget
      sendWebRequestEvent(listener.extensionId, eventName, details);
    }
  }

  // Merge results (first cancel wins, first redirect wins)
  return mergeWebRequestResults(results);
}
```

### WebRequestDetails Object

```typescript
interface WebRequestDetails {
  requestId: string;
  url: string;
  method: string;
  frameId: number;
  parentFrameId: number;
  tabId: number;
  type: ResourceType;
  timeStamp: number;
  originUrl?: string;
  documentUrl?: string;
  initiator?: string;
  requestBody?: {
    error?: string;
    formData?: Record<string, string[]>;
    raw?: Array<{ bytes?: ArrayBuffer; file?: string }>;
  };
  requestHeaders?: HttpHeader[];
  responseHeaders?: HttpHeader[];
  statusCode?: number;
  statusLine?: string;
  ip?: string;
  fromCache?: boolean;
}

type ResourceType =
  | 'main_frame' | 'sub_frame' | 'stylesheet' | 'script'
  | 'image' | 'font' | 'object' | 'xmlhttprequest' | 'ping'
  | 'csp_report' | 'media' | 'websocket' | 'webtransport'
  | 'webbundle' | 'other';
```

### declarativeNetRequest Implementation

DNR rules are evaluated in the BareMux worker alongside webRequest:

```typescript
const heliumDNR: WebRequestMiddleware = {
  async onRequest(request, context) {
    const url = request.url;
    const resourceType = determineResourceType(request);
    const initiator = request.headers?.['Origin'] || '';

    // Evaluate all extensions' DNR rules
    for (const [extensionId, rulesets] of dnrRuleStore) {
      for (const ruleset of rulesets) {
        if (!ruleset.enabled) continue;

        for (const rule of ruleset.rules) {
          if (matchesDNRRule(rule, url, resourceType, initiator)) {
            const result = applyDNRAction(rule.action, request);
            if (result.blocked || result.redirect) {
              return result;
            }
          }
        }
      }
    }

    return request;
  },

  async onResponse(response, request, context) {
    // DNR response header modification
    for (const [extensionId, rulesets] of dnrRuleStore) {
      for (const ruleset of rulesets) {
        if (!ruleset.enabled) continue;

        for (const rule of ruleset.rules) {
          if (rule.action.type === 'modifyHeaders' && rule.action.responseHeaders) {
            if (matchesDNRRule(rule, request.url, determineResourceType(request), '')) {
              for (const mod of rule.action.responseHeaders) {
                applyHeaderModification(response.headers, mod);
              }
            }
          }
        }
      }
    }

    return response;
  },
};

function matchesDNRRule(rule: DNRRule, url: string, type: string, initiator: string): boolean {
  const condition = rule.condition;

  if (condition.urlFilter && !matchesUrlFilter(url, condition.urlFilter)) return false;
  if (condition.regexFilter && !new RegExp(condition.regexFilter).test(url)) return false;

  if (condition.resourceTypes && !condition.resourceTypes.includes(type)) return false;
  if (condition.excludedResourceTypes && condition.excludedResourceTypes.includes(type)) return false;

  if (condition.domains && !condition.domains.some(d => matchesDomain(initiator, d))) return false;
  if (condition.excludedDomains && condition.excludedDomains.some(d => matchesDomain(initiator, d))) return false;

  if (condition.requestMethods && !condition.requestMethods.includes(rule.method)) return false;

  return true;
}

function applyDNRAction(action: DNRAction, request: any): any {
  switch (action.type) {
    case 'block':
      return { blocked: true };

    case 'redirect':
      if (action.redirect?.url) {
        request.url = action.redirect.url;
        return { redirect: action.redirect.url };
      }
      if (action.redirect?.regexSubstitution) {
        // Apply regex substitution
      }
      return request;

    case 'allow':
      return request;

    case 'upgradeScheme':
      request.url = request.url.replace('http://', 'https://');
      return request;

    case 'modifyHeaders':
      if (action.requestHeaders) {
        for (const mod of action.requestHeaders) {
          applyHeaderModification(request.headers, mod);
        }
      }
      return request;

    case 'allowAllRequests':
      return request;

    default:
      return request;
  }
}
```

### BareMux ↔ SharedWorker Communication

The BareMux worker needs to communicate with extension contexts (to emit events and receive listener registrations). Since BareMux runs as a worker, it uses BroadcastChannel to communicate with the SharedWorker:

```typescript
// In BareMux worker:
const heliumChannel = new BroadcastChannel('helium-baremux');

// Send webRequest event to SharedWorker for routing to extensions
function sendWebRequestEvent(extensionId: string, eventName: string, details: WebRequestDetails): void {
  heliumChannel.postMessage({
    type: 'webRequest.event',
    extensionId,
    eventName,
    details,
  });
}

// Receive listener registrations from SharedWorker
heliumChannel.onmessage = (event) => {
  const msg = event.data;

  switch (msg.type) {
    case 'webRequest.addListener':
      addWebRequestListener(msg.extensionId, msg.eventName, msg.filter, msg.extraInfoSpec);
      break;

    case 'webRequest.removeListener':
      removeWebRequestListener(msg.extensionId, msg.eventName, msg.listenerId);
      break;

    case 'dnr.updateRules':
      updateDNRRules(msg.extensionId, msg.rulesets);
      break;

    case 'contentScript.updateRegistry':
      // Forward to Reflux injection plugin
      updateContentScriptRegistry(msg.scripts);
      break;
  }
};
```

## Cookie Integration

Extension cookie access is implemented through two mechanisms:

### 1. BareMux Cookie Interceptor (Real Cookies)

The BareMux worker intercepts `Set-Cookie` response headers and `Cookie` request headers to maintain a cookie jar that mirrors the actual cookies for proxied domains:

```typescript
const cookieInterceptor: WebRequestMiddleware = {
  async onRequest(request, context) {
    // Inject cookies from our jar into the request
    const cookies = await cookieStore.getCookiesForUrl(request.url);
    if (cookies.length > 0) {
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      request.headers['Cookie'] = cookieHeader;
    }
    return request;
  },

  async onResponse(response, request, context) {
    // Capture Set-Cookie headers into our jar
    const setCookies = response.headers['set-cookie'];
    if (setCookies) {
      const parsed = Array.isArray(setCookies) ? setCookies : [setCookies];
      for (const raw of parsed) {
        const cookie = parseCookie(raw, request.url);
        await cookieStore.set(cookie);

        // Emit chrome.cookies.onChanged to extensions
        heliumChannel.postMessage({
          type: 'cookies.onChanged',
          changeInfo: {
            removed: false,
            cookie: cookieToChrome(cookie),
            cause: 'overwrite',
          },
        });
      }
    }
    return response;
  },
};
```

### 2. IndexedDB Cookie Store (Extension API)

The `chrome.cookies` API reads from and writes to an IndexedDB-backed store that is synced with the BareMux interceptor:

```typescript
class CookieIntegration {
  async getCookies(details: {
    url: string; name?: string; domain?: string; storeId?: string;
  }): Promise<Cookie[]> {
    const url = new URL(details.url);
    const cookies = await cookieStore.getAll({
      domain: details.domain || url.hostname,
      name: details.name,
    });

    return cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      hostOnly: !c.domain.startsWith('.'),
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
      session: !c.expires,
      expirationDate: c.expires ? c.expires.getTime() / 1000 : undefined,
      storeId: '0',
    }));
  }

  async setCookie(details: {
    url: string; name: string; value: string;
    domain?: string; path?: string; secure?: boolean;
    httpOnly?: boolean; sameSite?: string; expirationDate?: number;
  }): Promise<Cookie> {
    const cookie = {
      name: details.name,
      value: details.value,
      domain: details.domain || new URL(details.url).hostname,
      path: details.path || '/',
      secure: details.secure || false,
      httpOnly: details.httpOnly || false,
      sameSite: details.sameSite || 'lax',
      expires: details.expirationDate ? new Date(details.expirationDate * 1000) : undefined,
    };

    await cookieStore.set(cookie);

    // Notify BareMux worker to include this cookie in future requests
    heliumChannel.postMessage({
      type: 'cookies.set',
      cookie,
    });

    // Fire chrome.cookies.onChanged
    this.emitCookieChange('explicit', cookie);

    return cookieToChrome(cookie);
  }
}
```

## Navigation Event Tracking

`chrome.webNavigation` events are tracked by combining information from multiple sources:

```typescript
class NavigationTracker {
  // Source 1: BareMux sees document-type requests
  onDocumentRequest(request: BareMuxRequest, tabId: number): void {
    this.emitToExtensions('webNavigation.onBeforeNavigate', {
      tabId,
      url: request.url,
      frameId: 0,
      parentFrameId: -1,
      timeStamp: Date.now(),
      processId: -1,
    });
  }

  // Source 2: Host application navigation callbacks
  onTabNavigationCommitted(tabId: number, url: string, transitionType: string): void {
    this.emitToExtensions('webNavigation.onCommitted', {
      tabId,
      url,
      frameId: 0,
      timeStamp: Date.now(),
      transitionType,
      transitionQualifiers: [],
      processId: -1,
    });
  }

  // Source 3: Content script bootstrap reports DOMContentLoaded
  onContentScriptDOMContentLoaded(tabId: number, url: string, frameId: number): void {
    this.emitToExtensions('webNavigation.onDOMContentLoaded', {
      tabId,
      url,
      frameId,
      timeStamp: Date.now(),
      processId: -1,
    });
  }

  // Source 4: Content script bootstrap reports load complete
  onContentScriptLoadComplete(tabId: number, url: string, frameId: number): void {
    this.emitToExtensions('webNavigation.onCompleted', {
      tabId,
      url,
      frameId,
      timeStamp: Date.now(),
      processId: -1,
    });
  }

  // Source 5: Content script detects pushState/replaceState
  onHistoryStateUpdated(tabId: number, url: string, frameId: number, transitionType: string): void {
    this.emitToExtensions('webNavigation.onHistoryStateUpdated', {
      tabId,
      url,
      frameId,
      timeStamp: Date.now(),
      transitionType,
      transitionQualifiers: [],
      processId: -1,
    });
  }
}
```

## Dynamic Script Injection (chrome.scripting / chrome.tabs.executeScript)

When an extension calls `chrome.scripting.executeScript()` at runtime (not via manifest content scripts), Helium needs to inject code into an already-loaded page. This does NOT go through Reflux -- it uses the SharedWorker to send an injection command to the target tab's content script bootstrap:

```typescript
async function executeScriptInTab(
  extensionId: string,
  tabId: number,
  injection: {
    func?: Function;
    files?: string[];
    args?: any[];
    target: { tabId: number; frameIds?: number[]; allFrames?: boolean };
    world?: 'ISOLATED' | 'MAIN';
  }
): Promise<any[]> {
  // 1. Build the code to inject
  let code: string;

  if (injection.func) {
    const args = injection.args ? JSON.stringify(injection.args) : '[]';
    code = `(${injection.func.toString()}).apply(null, ${args})`;
  } else if (injection.files) {
    const scripts = await Promise.all(
      injection.files.map(f => extensionFS.readFile(extensionId, f))
    );
    code = scripts.map(s => new TextDecoder().decode(s!)).join(';\n');
  } else {
    throw new Error('Either func or files must be specified');
  }

  // 2. Send injection request to the bootstrap in the target tab
  //    via SharedWorker message routing
  const result = await sendToContentScript(tabId, {
    type: '__helium_inject',
    extensionId,
    code,
    world: injection.world || 'ISOLATED',
    frameIds: injection.target.frameIds,
    allFrames: injection.target.allFrames,
  });

  return result;
}
```

The content script bootstrap handles `__helium_inject` messages by creating and executing a `<script>` element (for MAIN world) or evaluating within the content script's scope (for ISOLATED world).

## Initialization Sequence

When the host application starts up:

```
1. Service Worker registers (UV/Scramjet)
   - Helium fetch handler registered for /helium-ext/ paths
   - No proxy configuration changes required

2. BareMux worker initializes:
   a. Helium network middleware registers (webRequest, DNR, cookies)
   b. BroadcastChannel opens for SharedWorker communication
   c. Loads persisted DNR rules and webRequest listener state

3. Main page loads:
   a. SharedWorker starts (message router)
   b. Helium core initializes
   c. Host application (DaydreamX) registers API bindings
   d. For each installed extension:
      - Create background context (Layer 2)
      - Fire chrome.runtime.onStartup
   e. Push content script registrations to Reflux injection plugin
   f. Push webRequest listener state to BareMux worker

4. User navigates to a proxied page:
   a. Request flows: SW → BareMux (webRequest events) → Transport
   b. Response flows: Transport → BareMux (cookie capture, webRequest) → Reflux
   c. Reflux evaluates content script matches for the URL
   d. Reflux injects bootstrap + content scripts via @browser
   e. Response returns to SW for rewriting
   f. Browser renders the page
   g. Bootstrap executes, connects to SharedWorker
   h. Content scripts execute in isolated scopes
   i. Extensions receive tabs.onUpdated, webNavigation events
```
