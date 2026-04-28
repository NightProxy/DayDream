# Helium

Chrome Extension API emulation for web proxy environments.

Helium provides a near-complete `chrome.*` API surface that runs inside websites served through a service worker-based web proxy. It supports both Manifest V2 (window-based background pages) and Manifest V3 (ServiceWorker-based service workers) extensions, enabling real Chrome extensions to run inside proxy browsers like DaydreamX. Helium is proxy-implementation agnostic -- it requires no UV/Scramjet-specific hooks or configuration. All integration flows through Reflux (content injection) and a modified BareMux worker (network interception).

## How It Works

Helium does **not** re-implement Chrome's internals. Instead, it provides a **binding layer** where the host application (DaydreamX) maps its own functions (tab creation, navigation, bookmark management, etc.) into the `chrome.*` API surface. Extensions call `chrome.tabs.create(...)` and Helium routes that call to whatever function the host application registered for tab creation.

This means Helium is **not coupled to any specific browser UI** -- it is a generic emulation layer that any proxy browser can plug into.

## Architecture Overview

```
+-----------------------------------------------------------------------+
|  Layer 6: Extension Store / Installer                                 |
|  - CRX download, install, update, uninstall                          |
+-----------------------------------------------------------------------+
|  Layer 5: Proxy Integration (Reflux + BareMux)                        |
|  - Content injection (Reflux @browser), network interception (BareMux)|
+-----------------------------------------------------------------------+
|  Layer 4: Chrome API Implementations                                  |
|  - runtime, storage, tabs, action, alarms, scripting, cookies, ...    |
|  - API binding system: host app maps its functions into chrome.*      |
+-----------------------------------------------------------------------+
|  Layer 3: Message Passing                                             |
|  - SharedWorker backbone, BroadcastChannel, MessageChannel            |
|  - Port system, tab registry, extension-to-extension messaging        |
+-----------------------------------------------------------------------+
|  Layer 2: Execution Contexts                                          |
|  - MV2: hidden iframe background pages                                |
|  - MV3: dedicated Worker for each extension background                |
|  - Content scripts: injected into proxied pages                       |
|  - Extension pages: popup, options, sidepanel, newtab                 |
+-----------------------------------------------------------------------+
|  Layer 1: URL Scheme & Resource Resolution                            |
|  - chrome-extension:// mapping via SW interception                    |
|  - Extension file serving from virtual filesystem                     |
+-----------------------------------------------------------------------+
|  Layer 0: Extension Loader & Manifest Parser                          |
|  - CRX unpacking, manifest.json parsing & validation                  |
|  - Permission resolution, content script registration                 |
+-----------------------------------------------------------------------+
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details.

## Monorepo Structure

```
helium/
├── packages/
│   ├── shared/          # Base classes shared by MV2 and MV3
│   │   └── src/
│   │       ├── ChromeEvent.ts        # Event listener/dispatch (Set-based)
│   │       ├── DeclarativeEvent.ts   # Rule-based declarative events
│   │       ├── ChromeSetting.ts      # get/set/clear with onChange
│   │       ├── ContentSetting.ts     # Per-site content setting rules
│   │       ├── StorageArea.ts        # Full storage implementation
│   │       └── index.ts
│   ├── mv2/             # Manifest V2 Chrome API surface (43 namespaces)
│   │   └── src/
│   │       ├── Chrome.ts             # Root chrome object
│   │       └── api/                  # One file per namespace
│   │           ├── tabs.ts
│   │           ├── runtime.ts
│   │           ├── browserAction.ts  # MV2-only
│   │           ├── app.ts            # MV2-only
│   │           └── ... (44 files)
│   └── mv3/             # Manifest V3 Chrome API surface (51 namespaces)
│       └── src/
│           ├── Chrome.ts             # Root chrome object
│           └── api/                  # One file per namespace
│               ├── tabs.ts
│               ├── runtime.ts
│               ├── action.ts         # MV3-only (replaces browserAction)
│               ├── scripting.ts      # MV3-only
│               ├── declarativeNetRequest.ts  # MV3-only
│               └── ... (52 files)
├── docs/                # Design documentation
│   ├── ARCHITECTURE.md
│   ├── API-BINDING.md
│   ├── MANIFEST-PARSER.md
│   ├── EXECUTION-CONTEXTS.md
│   ├── MESSAGE-PASSING.md
│   ├── API-IMPLEMENTATION.md
│   └── PROXY-INTEGRATION.md
├── tools/
│   └── generate.js      # Code generator: JSON dumps -> TypeScript stubs
├── JSON Objects/
│   ├── MV2.json          # Real Chrome MV2 API surface dump
│   └── MV3.json          # Real Chrome MV3 API surface dump
├── Extensions4Dumping/   # Test extensions used to dump API surfaces
│   ├── all-perms-mv2/
│   └── all-perms-mv3/
├── package.json          # npm workspaces root
└── tsconfig.base.json    # Shared TypeScript config (ES2020, strict)
```

## Code Generation Pipeline

Helium's API stubs are **not hand-written**. They are auto-generated from real Chrome API surface dumps:

1. Load `Extensions4Dumping/all-perms-mv2` or `all-perms-mv3` into Chrome
2. The extension introspects `chrome.*` and dumps every namespace, method, event, enum, and constant to JSON
3. `tools/generate.js` reads `MV2.json` / `MV3.json` and classifies each member (event, method, enum, setting, storage area, etc.)
4. It generates one TypeScript class per namespace with proper event instances, enum constants, and stub methods that throw `"not implemented"`
5. The shared base classes (`ChromeEvent`, `StorageArea`, etc.) provide the actual behavior

This ensures the API surface exactly matches real Chrome, including deprecated methods, version-specific differences, and correct enum values.

## MV2 vs MV3 Key Differences

| Aspect | MV2 | MV3 |
|--------|-----|-----|
| Background context | Persistent page (hidden iframe) | Dedicated Worker (event-driven) |
| Browser action | `chrome.browserAction` | `chrome.action` |
| Script injection | `chrome.tabs.executeScript()` | `chrome.scripting.executeScript()` |
| Request blocking | `webRequestBlocking` (sync) | `declarativeNetRequest` (declarative rules) |
| Host permissions | In `permissions` array | Separate `host_permissions` array |
| MV2-only APIs | `app`, `browserAction` | -- |
| MV3-only APIs | -- | `action`, `declarativeNetRequest`, `dns`, `offscreen`, `processes`, `readingList`, `scripting`, `sidePanel`, `tabGroups`, `webAuthenticationProxy` |
| Storage areas | `local`, `sync`, `managed` | `local`, `sync`, `managed`, `session` |

## Design Documents

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full 6-layer architecture, component diagrams, data flow |
| [API-BINDING.md](docs/API-BINDING.md) | How host apps (DaydreamX) bind their functions into chrome.* |
| [MANIFEST-PARSER.md](docs/MANIFEST-PARSER.md) | CRX unpacking, manifest parsing, permission resolution |
| [EXECUTION-CONTEXTS.md](docs/EXECUTION-CONTEXTS.md) | Background pages, workers, content scripts, extension pages |
| [MESSAGE-PASSING.md](docs/MESSAGE-PASSING.md) | SharedWorker backbone, ports, tab registry |
| [API-IMPLEMENTATION.md](docs/API-IMPLEMENTATION.md) | Tiered priority list, per-namespace implementation notes |
| [PROXY-INTEGRATION.md](docs/PROXY-INTEGRATION.md) | Reflux content injection, BareMux network interception, cookie integration |

## Integration Context

Helium is designed to run on top of:

- **DaydreamX** -- Proxy browser with full tab management, bookmarks, history, sessions. Provides the actual browser functionality that chrome.* APIs delegate to.
- **Reflux** (`@nightnetwork/reflux`) -- BareMux middleware transport with plugin system. Handles content script injection via its `@browser` mechanism, injecting bootstrap scripts and content scripts into HTML responses at the transport level.
- **Modified BareMux Worker** -- Sits between the proxy SW and Reflux in the request pipeline. Evaluates webRequest listeners and declarativeNetRequest rules, intercepts cookies (Set-Cookie capture + Cookie header injection), and communicates with Helium's SharedWorker via BroadcastChannel.
- **UV / Scramjet** -- Service worker-based web proxies that intercept and rewrite page loads. Helium requires no proxy-specific hooks or `config.inject` configuration -- it is proxy-implementation agnostic.

## Current Status

- **Done**: Auto-generated TypeScript stubs for all 43 MV2 and 51 MV3 namespaces with correct events, enums, constants, and method signatures
- **Done**: 5 fully-functional shared base classes (ChromeEvent, DeclarativeEvent, ChromeSetting, ContentSetting, StorageArea)
- **Done**: Code generation pipeline from real Chrome API dumps
- **Done**: Complete architecture design and documentation
- **Not started**: API binding system implementation
- **Not started**: Manifest parser and CRX loader
- **Not started**: Message passing infrastructure
- **Not started**: Extension runtime / execution contexts
- **Not started**: Actual API method implementations
- **Not started**: Proxy integration layer
