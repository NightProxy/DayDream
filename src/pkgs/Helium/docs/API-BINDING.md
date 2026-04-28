# API Binding System

This document describes how the host application (DaydreamX or any other proxy browser) maps its own functions into Helium's `chrome.*` API surface.

## Motivation

Helium does not reimplement browser functionality. Instead, it acts as a translation layer: when an extension calls `chrome.tabs.create({url: "https://example.com"})`, Helium needs to actually create a tab in the host application. The binding system is the mechanism by which the host application tells Helium "when an extension wants to create a tab, call this function."

This decouples Helium from any specific browser UI and makes it reusable across different proxy browser projects.

## Core Concepts

### Handlers

A **handler** is a function registered by the host application to implement a specific Chrome API method. When an extension calls that API method, Helium invokes the registered handler instead of the stub that throws "not implemented."

### Handler Registry

The **handler registry** is a map from API method paths (like `"tabs.create"`) to handler functions. There is one global registry shared across all extensions.

### Handler Signature Contract

Each Chrome API method has an expected input/output contract. The handler must accept the same parameters the Chrome API method documents and return the expected result type. Helium handles callback/Promise wrapping -- the handler always works with async/await.

## API Design

### Registering Handlers

```typescript
import { Helium } from 'helium';

const helium = new Helium();

// Register a single handler
helium.bind('tabs.create', async (createProperties: chrome.tabs.CreateProperties) => {
  // Host app creates a tab using its own logic
  const tab = await myBrowser.tabs.create({
    url: createProperties.url,
    active: createProperties.active ?? true,
    index: createProperties.index,
    pinned: createProperties.pinned ?? false,
  });

  // Return a chrome.tabs.Tab-shaped object
  return {
    id: tab.id,
    index: tab.index,
    windowId: tab.windowId,
    active: tab.active,
    pinned: tab.pinned,
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    status: tab.loading ? 'loading' : 'complete',
    incognito: false,
    highlighted: tab.active,
  };
});

// Register multiple handlers at once
helium.bindAll({
  'tabs.create': async (props) => { /* ... */ },
  'tabs.remove': async (tabIds) => { /* ... */ },
  'tabs.update': async (tabId, updateProps) => { /* ... */ },
  'tabs.query': async (queryInfo) => { /* ... */ },
  'windows.create': async (createData) => { /* ... */ },
  'windows.remove': async (windowId) => { /* ... */ },
});
```

### Handler Invocation Flow

```
Extension calls chrome.tabs.create({url: "https://example.com"})
  │
  ├── Is this a content script context?
  │   YES → Serialize call, send to background via SharedWorker
  │          Background context processes it (below)
  │   NO  → Continue
  │
  ├── Look up handler for "tabs.create" in Handler Registry
  │   NOT FOUND → throw Error("chrome.tabs.create is not implemented")
  │   FOUND     → Continue
  │
  ├── Permission check: does extension have "tabs" permission?
  │   NO  → throw Error("Permission denied: tabs")
  │   YES → Continue
  │
  ├── Invoke handler with (createProperties)
  │   │
  │   ├── Handler is async → await result
  │   └── Handler throws   → propagate error to extension via chrome.runtime.lastError
  │
  ├── Validate return value shape (optional, development mode only)
  │
  └── Return result to extension
      ├── If extension used callback style: callback(result)
      └── If extension used promise style: resolve(result)
```

### Callback / Promise Duality

Real Chrome APIs support both callback and Promise styles:

```javascript
// Callback style (MV2 and MV3)
chrome.tabs.create({url: "https://example.com"}, function(tab) {
  console.log(tab.id);
});

// Promise style (MV3 only, or MV2 with polyfill)
const tab = await chrome.tabs.create({url: "https://example.com"});
console.log(tab.id);
```

Helium handles this duality automatically. The generated stub methods detect whether the last argument is a function (callback style) and wrap accordingly:

```typescript
// Inside the generated ChromeTabs class (after binding system is wired up):
create(...args: any[]): any {
  const { params, callback } = extractCallbackArg(args, 'tabs.create');
  const handler = this._registry.get('tabs.create');

  if (!handler) {
    throw new Error('chrome.tabs.create is not implemented');
  }

  const promise = handler(...params);

  if (callback) {
    promise.then(
      (result) => callback(result),
      (error) => {
        chrome.runtime.lastError = { message: error.message };
        callback(undefined);
      }
    );
  }

  return promise;
}
```

## Handler Categories

### Category 1: Host-Bound (Requires DaydreamX Integration)

These methods **must** be implemented by the host application because they control browser UI or state that Helium cannot manage independently.

| Namespace | Methods | DaydreamX Source |
|-----------|---------|------------------|
| `tabs` | `create`, `remove`, `update`, `query`, `get`, `getCurrent`, `move`, `reload`, `duplicate`, `highlight`, `goBack`, `goForward`, `group`, `ungroup`, `discard`, `captureVisibleTab`, `detectLanguage` | `TabLifecycle`, `TabManipulation`, `TabPageClient` |
| `windows` | `create`, `remove`, `update`, `get`, `getAll`, `getCurrent`, `getLastFocused` | Window management in DaydreamX |
| `bookmarks` | `create`, `remove`, `update`, `get`, `getTree`, `search`, `move`, `getChildren`, `getRecent`, `getSubTree` | Bookmark manager in DaydreamX |
| `history` | `search`, `getVisits`, `addUrl`, `deleteUrl`, `deleteRange`, `deleteAll` | `TabHistoryIntegration` |
| `downloads` | `download`, `pause`, `resume`, `cancel`, `open`, `show`, `search`, `erase`, `getFileIcon`, `removeFile`, `acceptDanger` | Download manager in DaydreamX |
| `sessions` | `getRecentlyClosed`, `restore`, `getDevices` | Session manager in DaydreamX |
| `contextMenus` | `create`, `update`, `remove`, `removeAll` | Context menu UI in DaydreamX |
| `notifications` | `create`, `update`, `clear`, `getAll`, `getPermissionLevel` | Notification UI in DaydreamX |
| `action` / `browserAction` | `setIcon`, `setBadgeText`, `setTitle`, `setPopup`, `openPopup`, `enable`, `disable`, `getBadgeText`, `getTitle`, `getPopup`, `isEnabled` | Extension toolbar in DaydreamX |

### Category 2: Self-Contained (No Host Binding Needed)

These APIs are fully implemented within Helium itself, using browser primitives (IndexedDB, timers, etc.):

| Namespace | Implementation Strategy |
|-----------|----------------------|
| `storage` | `StorageArea` base class backed by IndexedDB |
| `alarms` | `setTimeout`/`setInterval` + IndexedDB for persistence |
| `i18n` | Message lookup from `_locales/` in extension virtual filesystem |
| `runtime` (most methods) | Manifest access, URL generation, messaging via Layer 3 |
| `permissions` | Permission state tracked in-memory against manifest declarations |
| `declarativeContent` | `DeclarativeEvent` base class with page state matching |

### Category 3: Network-Bound (Requires BareMux Integration)

These APIs hook into the network request/response pipeline via the modified BareMux worker:

| Namespace | Integration Point |
|-----------|------------------|
| `webRequest` | BareMux worker request/response middleware |
| `declarativeNetRequest` | BareMux worker request middleware (rule evaluation) |
| `cookies` | BareMux worker cookie interceptor (Set-Cookie/Cookie headers) + IndexedDB store |

### Category 3b: Injection-Bound (Requires Reflux Integration)

These APIs hook into Reflux's content injection pipeline:

| Namespace | Integration Point |
|-----------|------------------|
| `webNavigation` | BareMux (request-level) + host app callbacks + content script bootstrap (DOM events) |
| `scripting` | Reflux injection plugin (content script registration) + SharedWorker (dynamic injection) |

### Category 4: Hybrid (Partial Host Binding + Partial Self-Contained)

| Namespace | Host-Bound Parts | Self-Contained Parts |
|-----------|-----------------|---------------------|
| `runtime` | `reload` (host restarts extension), `openOptionsPage` (host opens tab) | `getManifest`, `getURL`, `id`, `sendMessage`, `connect`, `onInstalled`, `onMessage`, `onConnect` |
| `tabs` | All CRUD + navigation | `sendMessage`, `connect` (messaging is Layer 3) |
| `management` | `setEnabled`, `uninstall` (host manages extension lifecycle) | `getAll`, `get`, `getSelf`, `getPermissionWarnings` (reads from ExtensionRegistry) |
| `webNavigation` | Navigation commit/error callbacks (host emits) | DOM lifecycle events (from content script bootstrap), history state changes |

## DaydreamX Integration Contract

The host application must implement the following interface to fully power Helium's Tier 1 + Tier 2 APIs:

```typescript
interface HeliumHostBindings {
  // Tab management
  'tabs.create': (props: TabCreateProperties) => Promise<TabInfo>;
  'tabs.remove': (tabIds: number | number[]) => Promise<void>;
  'tabs.update': (tabId: number, props: TabUpdateProperties) => Promise<TabInfo>;
  'tabs.query': (query: TabQueryInfo) => Promise<TabInfo[]>;
  'tabs.get': (tabId: number) => Promise<TabInfo>;
  'tabs.getCurrent': () => Promise<TabInfo | undefined>;
  'tabs.move': (tabIds: number | number[], props: {index: number, windowId?: number}) => Promise<TabInfo | TabInfo[]>;
  'tabs.reload': (tabId?: number, reloadProps?: {bypassCache?: boolean}) => Promise<void>;
  'tabs.duplicate': (tabId: number) => Promise<TabInfo>;
  'tabs.goBack': (tabId?: number) => Promise<void>;
  'tabs.goForward': (tabId?: number) => Promise<void>;
  'tabs.group': (options: {tabIds: number | number[], groupId?: number, createProperties?: {windowId?: number}}) => Promise<number>;
  'tabs.ungroup': (tabIds: number | number[]) => Promise<void>;
  'tabs.highlight': (highlightInfo: {tabs: number | number[], windowId?: number}) => Promise<WindowInfo>;
  'tabs.discard': (tabId?: number) => Promise<TabInfo | undefined>;
  'tabs.captureVisibleTab': (windowId?: number, options?: {format?: string, quality?: number}) => Promise<string>;
  'tabs.detectLanguage': (tabId?: number) => Promise<string>;

  // Window management
  'windows.create': (createData?: WindowCreateData) => Promise<WindowInfo>;
  'windows.remove': (windowId: number) => Promise<void>;
  'windows.update': (windowId: number, updateInfo: WindowUpdateInfo) => Promise<WindowInfo>;
  'windows.get': (windowId: number, getInfo?: {populate?: boolean}) => Promise<WindowInfo>;
  'windows.getAll': (getInfo?: {populate?: boolean, windowTypes?: string[]}) => Promise<WindowInfo[]>;
  'windows.getCurrent': (getInfo?: {populate?: boolean}) => Promise<WindowInfo>;
  'windows.getLastFocused': (getInfo?: {populate?: boolean}) => Promise<WindowInfo>;

  // Action / BrowserAction
  'action.setIcon': (details: {tabId?: number, imageData?: any, path?: string | object}) => Promise<void>;
  'action.setBadgeText': (details: {text: string, tabId?: number}) => Promise<void>;
  'action.setBadgeBackgroundColor': (details: {color: string | number[], tabId?: number}) => Promise<void>;
  'action.setBadgeTextColor': (details: {color: string | number[], tabId?: number}) => Promise<void>;
  'action.setTitle': (details: {title: string, tabId?: number}) => Promise<void>;
  'action.setPopup': (details: {popup: string, tabId?: number}) => Promise<void>;
  'action.openPopup': (options?: {windowId?: number}) => Promise<void>;
  'action.enable': (tabId?: number) => Promise<void>;
  'action.disable': (tabId?: number) => Promise<void>;
  'action.getBadgeText': (details: {tabId?: number}) => Promise<string>;
  'action.getBadgeBackgroundColor': (details: {tabId?: number}) => Promise<number[]>;
  'action.getBadgeTextColor': (details: {tabId?: number}) => Promise<number[]>;
  'action.getTitle': (details: {tabId?: number}) => Promise<string>;
  'action.getPopup': (details: {tabId?: number}) => Promise<string>;
  'action.isEnabled': (tabId?: number) => Promise<boolean>;
  'action.getUserSettings': () => Promise<{isOnToolbar: boolean}>;

  // Bookmarks
  'bookmarks.get': (idOrList: string | string[]) => Promise<BookmarkTreeNode[]>;
  'bookmarks.getTree': () => Promise<BookmarkTreeNode[]>;
  'bookmarks.getChildren': (id: string) => Promise<BookmarkTreeNode[]>;
  'bookmarks.getRecent': (numberOfItems: number) => Promise<BookmarkTreeNode[]>;
  'bookmarks.getSubTree': (id: string) => Promise<BookmarkTreeNode[]>;
  'bookmarks.search': (query: string | {query?: string, url?: string, title?: string}) => Promise<BookmarkTreeNode[]>;
  'bookmarks.create': (bookmark: {parentId?: string, index?: number, title?: string, url?: string}) => Promise<BookmarkTreeNode>;
  'bookmarks.update': (id: string, changes: {title?: string, url?: string}) => Promise<BookmarkTreeNode>;
  'bookmarks.move': (id: string, destination: {parentId?: string, index?: number}) => Promise<BookmarkTreeNode>;
  'bookmarks.remove': (id: string) => Promise<void>;
  'bookmarks.removeTree': (id: string) => Promise<void>;

  // History
  'history.search': (query: {text: string, startTime?: number, endTime?: number, maxResults?: number}) => Promise<HistoryItem[]>;
  'history.getVisits': (details: {url: string}) => Promise<VisitItem[]>;
  'history.addUrl': (details: {url: string, title?: string, visitTime?: number}) => Promise<void>;
  'history.deleteUrl': (details: {url: string}) => Promise<void>;
  'history.deleteRange': (range: {startTime: number, endTime: number}) => Promise<void>;
  'history.deleteAll': () => Promise<void>;

  // Context Menus
  'contextMenus.create': (createProperties: ContextMenuCreateProperties) => number | string;
  'contextMenus.update': (id: number | string, updateProperties: ContextMenuUpdateProperties) => Promise<void>;
  'contextMenus.remove': (menuItemId: number | string) => Promise<void>;
  'contextMenus.removeAll': () => Promise<void>;

  // Notifications
  'notifications.create': (notificationId: string | undefined, options: NotificationOptions) => Promise<string>;
  'notifications.update': (notificationId: string, options: NotificationOptions) => Promise<boolean>;
  'notifications.clear': (notificationId: string) => Promise<boolean>;
  'notifications.getAll': () => Promise<Record<string, boolean>>;
  'notifications.getPermissionLevel': () => Promise<string>;

  // Downloads
  'downloads.download': (options: DownloadOptions) => Promise<number>;
  'downloads.pause': (downloadId: number) => Promise<void>;
  'downloads.resume': (downloadId: number) => Promise<void>;
  'downloads.cancel': (downloadId: number) => Promise<void>;
  'downloads.search': (query: DownloadQuery) => Promise<DownloadItem[]>;
  'downloads.open': (downloadId: number) => Promise<void>;

  // Sessions
  'sessions.getRecentlyClosed': (filter?: {maxResults?: number}) => Promise<Session[]>;
  'sessions.restore': (sessionId?: string) => Promise<Session>;
}
```

## Event Emission

The binding system also works in reverse -- the host application needs to **emit events** when things happen in the browser:

```typescript
// DaydreamX emits events when browser state changes:

// When a new tab is created (e.g., user clicks "New Tab"):
helium.emit('tabs.onCreated', tabInfo);

// When a tab is activated:
helium.emit('tabs.onActivated', { tabId: 123, windowId: 1 });

// When a tab's URL changes:
helium.emit('tabs.onUpdated', tabId, { url: newUrl, status: 'loading' }, tabInfo);

// When a tab is closed:
helium.emit('tabs.onRemoved', tabId, { windowId: 1, isWindowClosing: false });

// When a bookmark is created:
helium.emit('bookmarks.onCreated', bookmarkId, bookmarkNode);

// When navigation completes in a tab:
helium.emit('webNavigation.onCompleted', {
  tabId: 123,
  url: "https://example.com",
  frameId: 0,
  timeStamp: Date.now(),
});
```

**Event routing**: When `helium.emit(...)` is called, the SharedWorker broadcasts the event to all extension contexts that have registered listeners for it (and have the required permissions).

## Permission Enforcement

Before invoking any handler, Helium checks the calling extension's permissions:

```typescript
const PERMISSION_MAP: Record<string, string[]> = {
  'tabs.create':        ['tabs'],
  'tabs.query':         ['tabs'],         // URL/title fields redacted without permission
  'tabs.captureVisibleTab': ['activeTab', 'tabs', '<all_urls>'],
  'bookmarks.create':   ['bookmarks'],
  'bookmarks.remove':   ['bookmarks'],
  'history.search':     ['history'],
  'cookies.get':        ['cookies'],      // + host permission for the cookie's domain
  'downloads.download': ['downloads'],
  'notifications.create': ['notifications'],
  'contextMenus.create': ['contextMenus'],
  'webRequest.onBeforeRequest.addListener': ['webRequest'],  // + host permissions
  'webNavigation.onCompleted.addListener': ['webNavigation'],
  // ...
};
```

**Note**: Some `chrome.tabs` methods work without the `tabs` permission but return limited information (no `url`, `title`, or `favIconUrl` fields). Helium replicates this behavior by stripping sensitive fields from the response when the permission is missing.

## Error Handling

### chrome.runtime.lastError

Chrome extensions use `chrome.runtime.lastError` to detect errors in callback-style calls:

```javascript
chrome.tabs.create({url: "invalid"}, function(tab) {
  if (chrome.runtime.lastError) {
    console.error(chrome.runtime.lastError.message);
    return;
  }
  // success
});
```

Helium sets `chrome.runtime.lastError` before invoking the callback when the handler throws or rejects, and clears it afterward. For Promise-style calls, errors propagate as rejections.

### Unbound Method Errors

If an extension calls a method with no registered handler, the behavior depends on configuration:

- **Strict mode** (default): throws `Error("chrome.tabs.create is not implemented")`
- **Permissive mode**: logs a warning and returns `undefined` (useful for extensions that feature-detect by catching errors)

## Registration Timing

Handlers must be registered **before** any extension contexts are created. The recommended initialization order:

```typescript
// 1. Create Helium instance
const helium = new Helium();

// 2. Register all host bindings
helium.bindAll({ /* ... */ });

// 3. Initialize the message passing backbone
await helium.startMessageRouter();

// 4. Load installed extensions (creates execution contexts)
await helium.loadExtensions();

// 5. Start emitting events from the host application
helium.emit('runtime.onStartup');
```
