# Architecture

This document describes Helium's complete 6-layer architecture for Chrome Extension emulation in web proxy environments.

## Design Principles

1. **Binding over reimplementation** -- Helium does not reimplement browser internals. It provides a binding surface where the host application maps its existing functions into `chrome.*` API calls.
2. **Equal MV2/MV3 support** -- Both manifest versions are first-class citizens with separate API surfaces but shared infrastructure.
3. **Context isolation** -- Each extension runs in its own execution context (worker or iframe) with its own `chrome` object instance. Extensions cannot access each other's state except through explicit messaging APIs.
4. **Proxy-native** -- The architecture assumes a service worker proxy (UV/Scramjet) is intercepting all page loads. Helium integrates through Reflux (middleware transport) for content injection and through a modified BareMux worker for network interception. No direct UV/Scramjet hooks or configuration are required, making Helium proxy-implementation agnostic.
5. **Host-agnostic** -- While designed for DaydreamX, the binding system makes Helium usable with any host application that implements the required interfaces.

## Layer Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    HOST APPLICATION (DaydreamX)                      │
│                                                                     │
│  TabLifecycle  TabManipulation  BookmarkManager  HistoryManager ... │
│       │              │                │               │             │
│       └──────────────┴────────────────┴───────────────┘             │
│                              │                                      │
│                    API Binding Layer                                 │
│                    (registerHandler)                                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────────┐
│                         HELIUM CORE                                 │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────────┐ │
│  │ Layer 6     │  │ Layer 5      │  │ Layer 4                    │ │
│  │ Store /     │  │ Proxy        │  │ Chrome API                 │ │
│  │ Installer   │  │ Integration  │  │ Implementations            │ │
│  └──────┬──────┘  └──────┬───────┘  └────────────┬───────────────┘ │
│         │                │                        │                 │
│  ┌──────┴────────────────┴────────────────────────┴───────────────┐ │
│  │                   Layer 3: Message Passing                     │ │
│  │                                                                │ │
│  │  SharedWorker ←→ BroadcastChannel ←→ MessageChannel (Ports)   │ │
│  │  Tab Registry    Extension Registry    Port Manager            │ │
│  └────────────────────────────┬───────────────────────────────────┘ │
│                               │                                     │
│  ┌────────────────────────────┴───────────────────────────────────┐ │
│  │                 Layer 2: Execution Contexts                    │ │
│  │                                                                │ │
│  │  MV2: Hidden <iframe> background pages                        │ │
│  │  MV3: Dedicated Worker backgrounds                            │ │
│  │  Content Scripts: injected into proxied frames                 │ │
│  │  Extension Pages: popup, options, sidepanel, newtab, devtools │ │
│  └────────────────────────────┬───────────────────────────────────┘ │
│                               │                                     │
│  ┌────────────────────────────┴───────────────────────────────────┐ │
│  │              Layer 1: URL Scheme & Resource Resolution         │ │
│  │                                                                │ │
│  │  chrome-extension://<id>/path → virtual filesystem lookup      │ │
│  │  SW intercept → serve extension files from IndexedDB/OPFS     │ │
│  └────────────────────────────┬───────────────────────────────────┘ │
│                               │                                     │
│  ┌────────────────────────────┴───────────────────────────────────┐ │
│  │              Layer 0: Extension Loader & Manifest Parser       │ │
│  │                                                                │ │
│  │  CRX unpack → manifest.json parse → permission resolution     │ │
│  │  Content script registration → background context creation     │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────────┐
│                    WEB PROXY LAYER                                   │
│                                                                     │
│  Service Worker (UV/Scramjet)                                       │
│  - Intercepts all fetches from proxied pages                        │
│  - Rewrites HTML/JS/CSS URLs                                        │
│  - Serves extension resources via /helium-ext/ path interception    │
│  - NO Helium-specific hooks or config changes required              │
│                                                                     │
│  Reflux Middleware Transport                                        │
│  - @browser injection: Helium bootstrap + content scripts           │
│  - Response middleware for content injection decisions               │
│                                                                     │
│  BareMux Worker (modified)                                          │
│  - Request/response middleware pipeline                              │
│  - webRequest event emission                                        │
│  - declarativeNetRequest rule evaluation                            │
│  - Cookie interception (Set-Cookie / Cookie headers)                │
└─────────────────────────────────────────────────────────────────────┘
```

## Layer 0: Extension Loader & Manifest Parser

**Purpose**: Take a CRX file or unpacked extension directory, parse its manifest, validate permissions, and register the extension with Helium.

**Components**:
- `CRXUnpacker` -- Reads CRX3 binary format, extracts ZIP payload, verifies signatures
- `ManifestParser` -- Parses and validates `manifest.json` for both MV2 and MV3
- `PermissionResolver` -- Resolves declared permissions and host permissions into capability flags
- `ExtensionRegistry` -- Stores parsed extension metadata, keyed by extension ID

**Data flow**:
```
CRX file (binary)
  → CRXUnpacker.unpack()
    → ZIP contents
      → ManifestParser.parse(manifest.json)
        → ExtensionManifest object
          → PermissionResolver.resolve(manifest)
            → ExtensionRecord { id, manifest, permissions, files }
              → ExtensionRegistry.register(record)
                → Writes files to virtual filesystem (IndexedDB/OPFS)
```

**Key decisions**:
- Extension IDs are deterministic hashes of the extension's public key (matching Chrome's behavior) or generated UUIDs for unpacked extensions
- Files are stored in IndexedDB or OPFS (Origin Private File System) for fast access from the service worker
- Manifest validation is strict for required fields but permissive for unknown fields (forward compatibility)

See [MANIFEST-PARSER.md](MANIFEST-PARSER.md) for full details.

## Layer 1: URL Scheme & Resource Resolution

**Purpose**: Map `chrome-extension://<extension-id>/path` URLs to actual resources stored in the virtual filesystem.

**How it works**:

Since browsers don't support custom URL schemes for arbitrary content, Helium uses the service worker to intercept fetch requests and serve extension resources:

```
Extension code calls:  chrome.runtime.getURL("icon.png")
Returns:               /helium-ext/<extension-id>/icon.png
                       (or similar path under the proxy's scope)

When the browser fetches this URL:
  → Service worker intercepts the fetch event
    → Recognizes the /helium-ext/ prefix
      → Looks up file in virtual filesystem
        → Returns a Response with correct MIME type
```

**URL mapping strategies** (evaluated during implementation):

1. **Path-based** (preferred): `/helium-ext/<id>/<path>` -- Works within the existing SW scope, no special configuration needed
2. **Subdomain-based**: `<id>.ext.localhost/<path>` -- Provides better origin isolation but requires DNS/proxy configuration
3. **Blob URL-based**: `blob:<origin>/<uuid>` -- Per-resource URLs, hard to map to paths

**Web-accessible resources**: The manifest's `web_accessible_resources` field determines which extension files can be loaded by web pages. The SW checks this before serving resources to non-extension contexts.

## Layer 2: Execution Contexts

**Purpose**: Create and manage the isolated JavaScript environments where extension code runs.

There are 4 types of execution contexts:

### 2a. Background Context (MV2)

- **Implementation**: Hidden `<iframe>` appended to the host page's DOM (or a dedicated management page)
- **Lifetime**: Persistent -- stays alive as long as the host page is open
- **chrome object**: Full MV2 `Chrome` class instance injected as `window.chrome`
- **DOM access**: Yes (the iframe has a full document)
- **Loads**: `background.scripts` or `background.page` from manifest

### 2b. Background Context (MV3)

- **Implementation**: Dedicated `Worker` (not a real ServiceWorker -- we emulate the event-driven lifecycle)
- **Lifetime**: Event-driven with idle timeout. Helium keeps the worker alive when it has pending callbacks, then terminates it after 30 seconds of inactivity (matching Chrome's behavior). On next event, it respawns the worker.
- **chrome object**: Full MV3 `Chrome` class instance injected into the worker's global scope
- **DOM access**: No (it's a Worker). Extensions needing DOM use `chrome.offscreen.createDocument()`
- **Loads**: `background.service_worker` from manifest

### 2c. Content Scripts

- **Implementation**: JavaScript injected into proxied web pages via the proxy's rewriting pipeline
- **Lifetime**: Tied to the page lifecycle
- **chrome object**: Limited subset -- only `runtime` (messaging), `storage`, `i18n`, and `extension` are available
- **DOM access**: Yes, to the host page's DOM (in an isolated world by default)
- **Injection methods**:
  - Static: Declared in `manifest.json` `content_scripts` array, injected at load time via the proxy
  - Dynamic: Registered via `chrome.scripting.registerContentScripts()` (MV3) or `chrome.tabs.executeScript()` (MV2)

### 2d. Extension Pages

- **Implementation**: `<iframe>` loaded with extension HTML files (popup, options, sidepanel, newtab, devtools)
- **Lifetime**: Tied to the UI element (popup closes when the iframe is removed, options page stays open as a tab)
- **chrome object**: Full API surface, same as background context
- **Loads**: HTML files from the extension's virtual filesystem

See [EXECUTION-CONTEXTS.md](EXECUTION-CONTEXTS.md) for full details including lifecycle management, cleanup, and error handling.

## Layer 3: Message Passing

**Purpose**: Enable communication between all extension contexts (background, content scripts, extension pages, popup) and between extensions.

**Backbone**: A `SharedWorker` acts as the central message router. Every execution context connects to this SharedWorker on creation.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Background   │     │ Content      │     │ Popup        │
│ Worker/Frame │     │ Script       │     │ Frame        │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                     │
       │    MessagePort     │    MessagePort      │
       └────────────────┐   │   ┌─────────────────┘
                        │   │   │
                   ┌────┴───┴───┴────┐
                   │  SharedWorker   │
                   │  (Router)       │
                   │                 │
                   │  - Tab Registry │
                   │  - Port Manager │
                   │  - Ext Registry │
                   └─────────────────┘
```

**Message types**:

| Message | API | Description |
|---------|-----|-------------|
| `runtime.sendMessage` | One-shot | Extension-internal message, background receives |
| `runtime.sendMessage` (external) | One-shot | Cross-extension message |
| `tabs.sendMessage` | One-shot | Background → specific tab's content script |
| `runtime.connect` / `tabs.connect` | Long-lived port | Bidirectional channel with `onMessage` / `onDisconnect` |
| `runtime.connectNative` | Long-lived port | Native messaging (not supported -- will throw) |

**Tab Registry**: The SharedWorker maintains a mapping of `tabId → { contexts[], url, title, active, windowId }`. This is updated by:
- The host application (DaydreamX) calling Helium's internal API when tabs are created/destroyed/navigated
- Content scripts registering themselves on injection

See [MESSAGE-PASSING.md](MESSAGE-PASSING.md) for full protocol details.

## Layer 4: Chrome API Implementations

**Purpose**: The actual implementations of `chrome.*` API methods.

**Key design**: Methods are **not hardcoded**. They use the **binding system** where the host application registers handler functions:

```typescript
// Host application (DaydreamX) during initialization:
helium.bind('tabs.create', async (createProperties) => {
  // Use DaydreamX's own tab creation logic
  const tab = await this.tabs.lifecycle.create(createProperties.url);
  return { id: tab.id, url: tab.url, title: tab.title, ... };
});

// When an extension calls chrome.tabs.create({ url: "..." }):
//   → Helium routes to the registered handler
//   → DaydreamX creates the tab
//   → Result is returned to the extension as a chrome.tabs.Tab object
```

**Implementation tiers** (priority order):

| Tier | Namespaces | Rationale |
|------|-----------|-----------|
| **Tier 1** (Critical) | `runtime`, `storage`, `tabs`, `action`/`browserAction`, `alarms`, `i18n`, `permissions` | Every extension uses these |
| **Tier 2** (Common) | `scripting`, `webNavigation`, `cookies`, `contextMenus`, `notifications`, `windows`, `webRequest`, `declarativeNetRequest` | Most productivity/utility extensions need these |
| **Tier 3** (Specialized) | `bookmarks`, `history`, `downloads`, `sessions`, `management`, `proxy`, `declarativeContent`, `identity` | Category-specific extensions |
| **Tier 4** (Niche) | `tts`, `ttsEngine`, `debugger`, `pageCapture`, `tabCapture`, `desktopCapture`, `offscreen`, `sidePanel`, `tabGroups`, `dns`, `power`, `idle`, `topSites`, `fontSettings`, `privacy`, `contentSettings`, `readingList`, `search`, `browsingData`, `printerProvider` | Low-usage or platform-specific |

**APIs with no external binding needed** (self-contained in Helium):
- `chrome.storage` -- Already implemented via `StorageArea` base class (IndexedDB-backed in production)
- `chrome.alarms` -- Timer management, fully self-contained
- `chrome.i18n` -- Message lookup from `_locales/` files in extension filesystem
- `chrome.runtime` (most of it) -- Manifest access, URL generation, messaging (Layer 3)
- `chrome.permissions` -- Permission state management against the manifest

See [API-BINDING.md](API-BINDING.md) and [API-IMPLEMENTATION.md](API-IMPLEMENTATION.md) for full details.

## Layer 5: Proxy Integration

**Purpose**: Hook into the web proxy stack to implement content script injection, `chrome.webRequest`, `chrome.declarativeNetRequest`, and navigation event tracking -- all without requiring direct UV/Scramjet hooks or configuration changes.

**Key design decision**: Helium does NOT modify UV/Scramjet configuration or use proxy-specific hooks (like `config.inject` or handler event systems). Scramjet does not support these features, and coupling to proxy internals limits portability. Instead, Helium operates through two proxy-agnostic layers:

1. **Reflux** -- for content injection (bootstrap + content scripts via `@browser` injection)
2. **BareMux worker** -- for network interception (webRequest, DNR, cookies)

**Integration points**:

### 5a. Reflux @browser Injection (Content Scripts + Bootstrap)

Reflux's `@browser` injection mechanism inserts the Helium runtime bootstrap and matching content scripts into HTML responses. This operates at the middleware transport level:

```
Browser fetch → SW (UV/Scramjet) → BareMux → Reflux MiddlewareTransport
                                                    │
                                                    ├── Response middleware:
                                                    │   → Evaluate URL against content script match patterns
                                                    │   → Inject Helium bootstrap via @browser
                                                    │   → Inject matching content scripts via @browser
                                                    │
                                                    └── Response returns to SW for rewriting
```

Reflux handles the injection such that injected code is processed appropriately by the proxy rewriter. The bootstrap connects to the SharedWorker, sets up content script chrome API instances, and manages the page-level lifecycle.

### 5b. BareMux Worker (Network Interception)

The modified BareMux worker provides a request/response middleware pipeline that operates below the proxy rewriter layer. This is where network-level chrome API events are implemented:

```
Browser fetch → SW → BareMux Worker
                          │
                          ├── Request Middleware
                          │   → Emit chrome.webRequest.onBeforeRequest
                          │   → Emit chrome.webRequest.onBeforeSendHeaders
                          │   → Evaluate declarativeNetRequest rules
                          │   → Block/redirect/modify headers
                          │
                          ├── Actual network fetch (Epoxy/Libcurl transport)
                          │
                          └── Response Middleware
                              → Emit chrome.webRequest.onHeadersReceived
                              → Emit chrome.webRequest.onCompleted
                              → Intercept Set-Cookie for chrome.cookies
```

### 5c. Navigation Event Tracking

`chrome.webNavigation` events are emitted by observing:
- BareMux worker sees document-type request/response (request-level events)
- Host application (DaydreamX) tab navigation callbacks (commit, error events)
- Content script bootstrap reports DOM lifecycle events (DOMContentLoaded, load complete)
- Content script detects pushState/replaceState (history state events)

See [PROXY-INTEGRATION.md](PROXY-INTEGRATION.md) for full details.

## Layer 6: Extension Store / Installer

**Purpose**: Provide a UI and API for users to install, manage, update, and uninstall extensions.

**Components**:
- `ExtensionInstaller` -- Downloads CRX from URL, unpacks, validates, registers
- `ExtensionManager` -- Enable/disable, get info, list installed extensions (backs `chrome.management`)
- `ExtensionUpdater` -- Periodic update checks against `update_url` from manifest
- Store UI -- The DaydreamX `internal/extensions/index.html` page, which lists installed extensions and provides install/remove controls

**Install flow**:
```
User clicks "Install" on CRX URL
  → ExtensionInstaller.install(crxUrl)
    → Fetch CRX binary
      → CRXUnpacker.unpack() → files + manifest
        → ManifestParser.parse() → validated manifest
          → PermissionResolver.resolve() → permission flags
            → Write files to virtual filesystem
              → ExtensionRegistry.register()
                → Create execution contexts (Layer 2)
                  → Fire chrome.runtime.onInstalled to the extension
```

## Data Flow: Complete Request Lifecycle

This shows what happens when a proxied page makes a network request, from the perspective of all Helium layers:

```
1. Proxied page makes fetch("https://api.example.com/data")

2. Service Worker intercepts →
   UV/Scramjet passes to BareMux transport layer

3. BareMux Worker processes request:
   a. Helium webRequest middleware fires onBeforeRequest to all
      extensions with webRequest permission
   b. MV2 extensions with webRequestBlocking can return
      {cancel: true} or {redirectUrl: "..."} synchronously
   c. MV3 declarativeNetRequest rules are evaluated
   d. If not blocked/redirected, request proceeds

4. Transport (Epoxy/Libcurl) makes actual network request

5. Response returns through BareMux:
   a. onHeadersReceived fires
   b. Cookie interception: Set-Cookie headers captured for
      chrome.cookies store
   c. onCompleted fires
   d. Response passed back to UV/Scramjet for rewriting

6. UV/Scramjet rewrites and delivers response to page
```

## Data Flow: Page Navigation with Content Scripts

```
1. User navigates to https://example.com in DaydreamX

2. DaydreamX creates/updates tab, emits webNavigation.onBeforeNavigate

3. Service Worker intercepts HTML request →
   UV/Scramjet passes to BareMux → Reflux transport

4. Reflux response middleware:
   a. Evaluates URL against all content script match patterns
   b. For matching extensions, injects via @browser:
      - Helium bootstrap script
      - Content script CSS (all at document_start)
      - Content script JS (respecting run_at timing)
   c. Response returns to UV/Scramjet for rewriting

5. Browser renders the page:
   a. Bootstrap executes, connects to SharedWorker
   b. Content scripts execute in their IIFE-isolated scopes
   c. Content scripts connect to SharedWorker for messaging
   d. Bootstrap reports page metadata (URL, title) to SharedWorker

6. Events fire to extensions:
   a. tabs.onUpdated (status: 'loading', then 'complete')
   b. webNavigation.onCommitted, onDOMContentLoaded, onCompleted
```

## Data Flow: Extension Message

```
1. Content script calls chrome.runtime.sendMessage({type: "getData"})

2. Content script's chrome.runtime.sendMessage():
   a. Posts message to SharedWorker via MessagePort:
      { type: "runtime.sendMessage", extensionId: "abc123",
        payload: {type: "getData"}, senderId: "cs-tab42" }

3. SharedWorker receives message:
   a. Looks up extension "abc123" in Extension Registry
   b. Finds background context's MessagePort
   c. Forwards message to background context

4. Background context receives message:
   a. chrome.runtime.onMessage listeners fire
   b. Listener calls sendResponse({result: [1,2,3]})

5. Response routes back:
   a. Background → SharedWorker → Content script
   b. Content script's sendMessage callback receives {result: [1,2,3]}
```

## Threading Model

```
Main Thread (Host Page / DaydreamX UI)
├── Extension Page iframes (popup, options, etc.)
├── MV2 Background iframes (hidden)
└── Host application logic

SharedWorker Thread (Message Router)
├── Tab Registry
├── Port Manager
└── Extension Registry

Dedicated Worker Threads (one per MV3 extension)
├── Extension A background
├── Extension B background
└── ...

Service Worker Thread (Proxy)
├── UV/Scramjet rewriting
├── Extension resource serving (/helium-ext/ paths)
└── Reflux content injection coordination

BareMux Worker Thread (Network Middleware)
├── webRequest event emission
├── declarativeNetRequest rule evaluation
├── Cookie interception
└── Reflux transport (Epoxy/Libcurl)
```

## Storage Architecture

| Store | Technology | Purpose |
|-------|-----------|---------|
| Extension files | IndexedDB or OPFS | Extension resources (JS, HTML, CSS, images, _locales) |
| `chrome.storage.local` | IndexedDB | Per-extension local storage |
| `chrome.storage.sync` | IndexedDB (no actual sync) | Per-extension "sync" storage (sync not available in proxy context) |
| `chrome.storage.session` | In-memory (Map) | Per-extension session storage (cleared on extension restart) |
| `chrome.storage.managed` | IndexedDB (read-only) | Admin-configured storage (populated by host app) |
| Extension metadata | IndexedDB | Manifest, permissions, enabled state, install date |
| Tab registry | In-memory (SharedWorker) | Tab-to-context mappings, rebuilt on SharedWorker restart |
| Alarms | IndexedDB + setTimeout | Persisted alarm definitions, active timers in memory |
| Cookies | IndexedDB | Extension cookie store (separate from browser cookies) |
| Context menus | In-memory | Menu item registrations, rebuilt on extension restart |
