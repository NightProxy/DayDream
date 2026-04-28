# API Implementation Guide

This document provides detailed implementation notes for each Chrome API namespace, organized by priority tier.

## Implementation Status Legend

- `[ ]` Not started
- `[~]` Partially implemented (base class provides some behavior)
- `[x]` Fully implemented

## Tier 1: Critical (Every Extension Needs These)

### chrome.runtime

**Status**: `[~]` (events wired up, methods are stubs)

The most important namespace. Provides extension identity, messaging, lifecycle events, and manifest access.

| Method / Property | Implementation Strategy | Needs Binding? |
|---|---|---|
| `runtime.id` | Set from extension manifest/CRX ID at context creation | No |
| `runtime.getManifest()` | Return parsed manifest object (stored in ExtensionRegistry) | No |
| `runtime.getURL(path)` | Return `/helium-ext/<extId>/<path>` (Layer 1 URL resolution) | No |
| `runtime.sendMessage(msg, cb)` | Route through SharedWorker (Layer 3 message passing) | No |
| `runtime.connect(extId?, info?)` | Create port through SharedWorker (Layer 3) | No |
| `runtime.onMessage` | Dispatch from SharedWorker messages (Layer 3) | No |
| `runtime.onConnect` | Dispatch from SharedWorker port connections (Layer 3) | No |
| `runtime.onInstalled` | Fired during extension load sequence | No |
| `runtime.onStartup` | Fired on SharedWorker init (simulates browser startup) | No |
| `runtime.reload()` | Destroy + recreate extension contexts | Yes (host does reload) |
| `runtime.openOptionsPage()` | Open options page tab | Yes (host opens tab) |
| `runtime.getPlatformInfo()` | Return hardcoded platform info (navigator.userAgent parsing) | No |
| `runtime.setUninstallURL(url)` | Store URL, open on uninstall | No (stored in registry) |
| `runtime.getBackgroundPage()` | MV2 only: return background iframe's window | No |
| `runtime.getContexts()` | MV3 only: query context registry in SharedWorker | No |
| `runtime.lastError` | Set before callback invocation on error, cleared after | No |
| `runtime.onSuspend` | MV2 event pages / MV3 worker lifecycle | No |
| `runtime.onSuspendCanceled` | MV2 event pages | No |
| `runtime.onUpdateAvailable` | Fired by update checker | No |
| `runtime.connectNative()` | Not supportable in web context -- throw meaningful error | No |
| `runtime.sendNativeMessage()` | Not supportable -- throw meaningful error | No |

**MV2-specific methods** (in MV2 package only):
- `runtime.getBackgroundPage()` -- Returns the background iframe's `contentWindow`
- `runtime.getVersion()` -- Returns manifest version string

**MV3-specific methods** (in MV3 package only):
- `runtime.getContexts(filter)` -- Queries the SharedWorker's context registry

**Implementation notes**:
- `runtime.id` must be set correctly for each extension instance
- `runtime.lastError` is context-local (each context has its own)
- `runtime.onInstalled` fires with `{ reason: 'install' | 'update' | 'chrome_update' }`. For Helium, only 'install' and 'update' are relevant

### chrome.storage

**Status**: `[~]` (StorageArea base class is fully implemented with in-memory store)

| Area | Quota | Implementation |
|------|-------|----------------|
| `storage.local` | 10MB (`QUOTA_BYTES: 10485760`) | IndexedDB per-extension |
| `storage.sync` | 100KB total, 8KB/item, 512 items max | IndexedDB (no actual sync -- there's no Chrome account) |
| `storage.managed` | Read-only | IndexedDB, populated by host app configuration |
| `storage.session` | 10MB (MV3 only) | In-memory `Map` (cleared on extension restart) |

**What needs to change from current implementation**:
1. Replace in-memory `store: Record<string, any>` with IndexedDB-backed storage
2. Add per-extension isolation (each extension gets its own IndexedDB database or object store)
3. `storage.session` uses in-memory storage (current behavior is correct for this area)
4. `storage.onChanged` must also fire on `chrome.storage.onChanged` (the top-level event, with area name)
5. All methods should return Promises in addition to accepting callbacks (MV3 compatibility)

**IndexedDB schema for storage**:
```
Database: "helium-storage-<extensionId>"

Object store: "local"
  Key: string (storage key)
  Value: any (JSON-serializable)

Object store: "sync"
  Key: string
  Value: any

Object store: "managed"
  Key: string
  Value: any (read-only, populated during extension install)
```

**Change event propagation**:
Storage changes must propagate across all contexts of the same extension. When `storage.local.set({key: "value"})` is called from a popup, the background's `storage.onChanged` listener must fire too. This is done through the SharedWorker:

```
Popup calls storage.local.set({key: "value"})
  → Write to IndexedDB
  → Post to SharedWorker: { type: 'storage.onChanged', extensionId, areaName: 'local', changes: {...} }
  → SharedWorker broadcasts to all contexts of this extension
  → Each context fires storage.onChanged and storage.local.onChanged
```

### chrome.tabs

**Status**: `[ ]` (all stubs)

The second most important namespace. Almost all extensions query or manipulate tabs.

| Method | Binding Required | Notes |
|--------|-----------------|-------|
| `tabs.create(props)` | Yes | Host creates tab, returns TabInfo |
| `tabs.remove(tabIds)` | Yes | Host closes tab(s) |
| `tabs.update(tabId, props)` | Yes | Host updates tab URL, pinned state, etc. |
| `tabs.query(queryInfo)` | Yes | Host returns matching tabs. Must filter by all query params: `active`, `pinned`, `url`, `title`, `windowId`, `currentWindow`, `status`, `lastFocusedWindow`, `groupId` |
| `tabs.get(tabId)` | Yes | Host returns tab info |
| `tabs.getCurrent()` | Partial | Returns info for the tab this context is running in (looked up from context registry) |
| `tabs.move(tabIds, props)` | Yes | Host moves tab(s) |
| `tabs.reload(tabId?, props?)` | Yes | Host reloads tab |
| `tabs.duplicate(tabId)` | Yes | Host duplicates tab |
| `tabs.goBack(tabId?)` | Yes | Host navigates back |
| `tabs.goForward(tabId?)` | Yes | Host navigates forward |
| `tabs.group(options)` | Yes | Host groups tab(s) |
| `tabs.ungroup(tabIds)` | Yes | Host ungroups tab(s) |
| `tabs.highlight(info)` | Yes | Host highlights tabs |
| `tabs.discard(tabId?)` | Yes | Host discards tab (frees memory) |
| `tabs.captureVisibleTab(windowId?, opts?)` | Yes | Host captures screenshot (returns data URL) |
| `tabs.detectLanguage(tabId?)` | Yes | Host detects page language |
| `tabs.sendMessage(tabId, msg, opts?, cb?)` | No | Routes through SharedWorker (Layer 3) |
| `tabs.connect(tabId, connectInfo?)` | No | Creates port through SharedWorker (Layer 3) |
| `tabs.getZoom(tabId?)` | Yes | Host returns zoom level |
| `tabs.setZoom(tabId?, factor)` | Yes | Host sets zoom level |
| `tabs.getZoomSettings(tabId?)` | Yes | Host returns zoom settings |
| `tabs.setZoomSettings(tabId?, settings)` | Yes | Host sets zoom settings |

**MV2-only methods** (deprecated in MV3):
- `tabs.executeScript(tabId?, details, cb?)` -- Inject script. Binding + proxy integration.
- `tabs.insertCSS(tabId?, details, cb?)` -- Inject CSS. Binding + proxy integration.
- `tabs.removeCSS(tabId?, details, cb?)` -- Remove CSS.
- `tabs.getAllInWindow(windowId?, cb?)` -- Deprecated, alias for `query({windowId})`.
- `tabs.getSelected(windowId?, cb?)` -- Deprecated, alias for `query({active: true, windowId})`.
- `tabs.sendRequest(tabId, request, cb?)` -- Deprecated, alias for `sendMessage`.

**TabInfo object shape** (returned by all tab methods):

```typescript
interface TabInfo {
  id: number;
  index: number;
  windowId: number;
  active: boolean;
  pinned: boolean;
  highlighted: boolean;
  incognito: boolean;          // Always false in Helium
  url?: string;                // Only with "tabs" permission
  title?: string;              // Only with "tabs" permission
  favIconUrl?: string;         // Only with "tabs" permission
  pendingUrl?: string;         // Only with "tabs" permission
  status?: 'loading' | 'complete' | 'unloaded';
  discarded: boolean;
  autoDiscardable: boolean;
  mutedInfo?: { muted: boolean; reason?: string; extensionId?: string };
  width?: number;
  height?: number;
  sessionId?: string;
  groupId: number;             // -1 if not grouped
  lastAccessed?: number;
  audible?: boolean;
  openerTabId?: number;
}
```

**Permission-based field filtering**: When an extension without the `tabs` permission calls `tabs.query()`, sensitive fields (`url`, `title`, `favIconUrl`, `pendingUrl`) are stripped from the result. The `activeTab` permission grants these fields temporarily for the active tab when the user invokes the extension.

### chrome.action (MV3) / chrome.browserAction (MV2)

**Status**: `[ ]` (all stubs)

Controls the extension's toolbar icon, badge, and popup.

| Method | Binding Required | Notes |
|--------|-----------------|-------|
| `action.setIcon(details)` | Yes | Host updates icon in toolbar |
| `action.setBadgeText(details)` | Yes | Host updates badge text |
| `action.setBadgeBackgroundColor(details)` | Yes | Host updates badge color |
| `action.setBadgeTextColor(details)` | Yes | Host updates badge text color |
| `action.setTitle(details)` | Yes | Host updates tooltip |
| `action.setPopup(details)` | Hybrid | Store popup path; host uses it when icon is clicked |
| `action.openPopup(opts?)` | Yes | Host opens popup programmatically |
| `action.enable(tabId?)` | Hybrid | Track enabled state; host reflects in UI |
| `action.disable(tabId?)` | Hybrid | Track disabled state; host grays out icon |
| `action.getBadgeText(details)` | No | Return from internal state |
| `action.getTitle(details)` | No | Return from internal state |
| `action.getPopup(details)` | No | Return from internal state |
| `action.getBadgeBackgroundColor(details)` | No | Return from internal state |
| `action.getBadgeTextColor(details)` | No | Return from internal state |
| `action.isEnabled(tabId?)` | No | Return from internal state |
| `action.getUserSettings()` | No | Return `{isOnToolbar: true}` (always) |

**Per-tab state**: Badge text, icon, title, popup, and enabled state can be set per-tab or globally. Internal state is stored as:
```typescript
interface ActionState {
  global: {
    icon: string | Record<string, string>;
    badgeText: string;
    badgeBackgroundColor: [number, number, number, number];
    badgeTextColor: [number, number, number, number];
    title: string;
    popup: string;
    enabled: boolean;
  };
  perTab: Map<number, Partial<typeof global>>;
}
```

When getting a value for a specific tab, check `perTab.get(tabId)` first, fall back to `global`.

### chrome.alarms

**Status**: `[ ]` (all stubs)

Self-contained timer system. No host binding needed.

| Method | Implementation |
|--------|----------------|
| `alarms.create(name?, info)` | `setTimeout`/`setInterval` + IndexedDB persistence |
| `alarms.get(name?, cb?)` | Look up from internal alarm map |
| `alarms.getAll(cb?)` | Return all alarms for this extension |
| `alarms.clear(name?, cb?)` | Clear specific alarm |
| `alarms.clearAll(cb?)` | Clear all alarms |
| `alarms.onAlarm` | Fire when alarm triggers |

**Implementation details**:
- Minimum period: 1 minute (Chrome enforces this; `delayInMinutes` minimum is also 1 for production, but Helium can optionally allow shorter for testing)
- Alarms persist across background context restarts (store in IndexedDB, reload on context creation)
- Each extension has its own alarm namespace (alarm names are scoped to the extension)

```typescript
interface AlarmInfo {
  name: string;
  scheduledTime: number;      // Timestamp when next fire
  periodInMinutes?: number;   // Repeat interval
}

class AlarmManager {
  private alarms: Map<string, AlarmInfo> = new Map();  // key: `${extId}:${name}`
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  create(extensionId: string, name: string, info: { delayInMinutes?: number; when?: number; periodInMinutes?: number }): void {
    const key = `${extensionId}:${name}`;

    // Clear existing alarm with same name
    this.clear(extensionId, name);

    const now = Date.now();
    let scheduledTime: number;

    if (info.when) {
      scheduledTime = info.when;
    } else if (info.delayInMinutes) {
      scheduledTime = now + info.delayInMinutes * 60 * 1000;
    } else {
      scheduledTime = now + 60 * 1000; // default 1 minute
    }

    const alarm: AlarmInfo = {
      name,
      scheduledTime,
      periodInMinutes: info.periodInMinutes,
    };

    this.alarms.set(key, alarm);
    this.scheduleTimer(extensionId, name, alarm);
    this.persistAlarms(); // Write to IndexedDB
  }

  private scheduleTimer(extensionId: string, name: string, alarm: AlarmInfo): void {
    const key = `${extensionId}:${name}`;
    const delay = Math.max(0, alarm.scheduledTime - Date.now());

    const timer = setTimeout(() => {
      // Fire onAlarm event to the extension
      this.fireAlarm(extensionId, alarm);

      // Reschedule if periodic
      if (alarm.periodInMinutes) {
        alarm.scheduledTime = Date.now() + alarm.periodInMinutes * 60 * 1000;
        this.scheduleTimer(extensionId, name, alarm);
        this.persistAlarms();
      } else {
        this.alarms.delete(key);
        this.timers.delete(key);
        this.persistAlarms();
      }
    }, delay);

    this.timers.set(key, timer);
  }
}
```

### chrome.i18n

**Status**: `[ ]` (all stubs)

Internationalization. Self-contained, reads `_locales/` files from the extension's virtual filesystem.

| Method | Implementation |
|--------|----------------|
| `i18n.getMessage(messageName, substitutions?)` | Look up in `_locales/<lang>/messages.json` |
| `i18n.getUILanguage()` | Return `navigator.language` |
| `i18n.getAcceptLanguages(cb?)` | Return `navigator.languages` |
| `i18n.detectLanguage(text, cb?)` | Use heuristics or return 'und' |

**Message resolution order**:
1. Exact locale match (e.g., `en_US`)
2. Language match (e.g., `en`)
3. Default locale (from `manifest.default_locale`)
4. Return empty string

**Message format**:
```json
{
  "appName": {
    "message": "My Extension",
    "description": "The name of the extension"
  },
  "greeting": {
    "message": "Hello, $USER$!",
    "placeholders": {
      "user": {
        "content": "$1",
        "example": "World"
      }
    }
  }
}
```

### chrome.permissions

**Status**: `[ ]` (all stubs)

Runtime permission management. Self-contained.

| Method | Implementation |
|--------|----------------|
| `permissions.getAll(cb?)` | Return current permissions from PermissionResolver |
| `permissions.contains(perms, cb?)` | Check if permissions are granted |
| `permissions.request(perms, cb?)` | Prompt user (host UI) to grant optional permissions |
| `permissions.remove(perms, cb?)` | Revoke optional permissions |
| `permissions.onAdded` | Fire when permissions are added |
| `permissions.onRemoved` | Fire when permissions are removed |

**Notes**:
- `permissions.request()` can only be called from a user gesture context (popup click, etc.)
- Only permissions listed in `optional_permissions` / `optional_host_permissions` can be requested
- `permissions.remove()` can only remove optional permissions, not required ones

## Tier 2: Common Extensions

### chrome.scripting (MV3 only)

| Method | Binding Required | Notes |
|--------|-----------------|-------|
| `scripting.executeScript(injection)` | Hybrid | Host identifies tab, Helium injects via SharedWorker → bootstrap |
| `scripting.insertCSS(injection)` | Hybrid | Host identifies tab, Helium injects CSS via SharedWorker → bootstrap |
| `scripting.removeCSS(injection)` | Hybrid | Host identifies tab, Helium removes CSS via SharedWorker → bootstrap |
| `scripting.registerContentScripts(scripts)` | No | Store in registry, push to Reflux injection plugin |
| `scripting.unregisterContentScripts(filter?)` | No | Remove from registry, push update to Reflux |
| `scripting.getRegisteredContentScripts(filter?)` | No | Query registry |
| `scripting.updateContentScripts(scripts)` | No | Update registry, push update to Reflux |

**executeScript implementation**: Must handle both `func` (function reference) and `files` (file paths) injection targets. For `func`, serialize the function to a string and inject. For `files`, read from extension virtual filesystem and inject. Dynamic injection goes through the SharedWorker to the target tab's bootstrap, NOT through Reflux (since the page is already loaded).

### chrome.webNavigation

| Event | Trigger |
|-------|---------|
| `onBeforeNavigate` | Host app reports tab about to navigate |
| `onCommitted` | Host app reports navigation committed |
| `onDOMContentLoaded` | Content script reports DOMContentLoaded |
| `onCompleted` | Content script reports load complete |
| `onErrorOccurred` | Host app reports navigation error |
| `onCreatedNavigationTarget` | New tab created from link click in proxied page |
| `onReferenceFragmentUpdated` | Hash change detected |
| `onTabReplaced` | Tab replaced (prerender) |
| `onHistoryStateUpdated` | pushState/replaceState detected |

### chrome.cookies

| Method | Implementation |
|--------|----------------|
| `cookies.get(details)` | Query IndexedDB cookie store |
| `cookies.getAll(details)` | Query IndexedDB cookie store with filters |
| `cookies.set(details)` | Write to IndexedDB cookie store |
| `cookies.remove(details)` | Delete from IndexedDB cookie store |
| `cookies.getAllCookieStores()` | Return `[{id: "0", tabIds: [...]}]` |
| `cookies.onChanged` | Fire on set/remove |

**Note**: These are **not** the browser's actual cookies. They are backed by an IndexedDB store that is synced with the BareMux worker's cookie interceptor, which captures `Set-Cookie` headers from proxied responses and injects `Cookie` headers into proxied requests. This provides realistic cookie behavior for extensions. See [PROXY-INTEGRATION.md](PROXY-INTEGRATION.md).

### chrome.contextMenus

| Method | Implementation |
|--------|----------------|
| `contextMenus.create(props, cb?)` | Store menu item, notify host UI | Yes |
| `contextMenus.update(id, props, cb?)` | Update stored item, notify host | Yes |
| `contextMenus.remove(id, cb?)` | Remove stored item, notify host | Yes |
| `contextMenus.removeAll(cb?)` | Remove all for this extension | Yes |
| `contextMenus.onClicked` | Fire when user clicks menu item | No (host emits) |

**Context menu items are stored in-memory** and rebuilt on extension restart. The host application receives the full menu tree and renders it in its context menu UI.

### chrome.notifications

| Method | Binding Required | Notes |
|--------|-----------------|-------|
| `notifications.create(id?, opts)` | Yes | Host shows notification |
| `notifications.update(id, opts)` | Yes | Host updates notification |
| `notifications.clear(id)` | Yes | Host dismisses notification |
| `notifications.getAll()` | No | Return from internal state |
| `notifications.getPermissionLevel()` | No | Return "granted" (always, since this is our controlled environment) |
| `notifications.onClicked` | No | Host emits on user click |
| `notifications.onClosed` | No | Host emits on dismiss |
| `notifications.onButtonClicked` | No | Host emits on button click |

### chrome.windows

| Method | Binding Required | Notes |
|--------|-----------------|-------|
| `windows.create(createData?)` | Yes | Host creates window |
| `windows.remove(windowId)` | Yes | Host closes window |
| `windows.update(windowId, info)` | Yes | Host updates window |
| `windows.get(windowId, info?)` | Yes | Host returns window info |
| `windows.getAll(info?)` | Yes | Host returns all windows |
| `windows.getCurrent(info?)` | Yes | Host returns current window |
| `windows.getLastFocused(info?)` | Yes | Host returns last focused |
| `windows.onCreated` | No | Host emits |
| `windows.onRemoved` | No | Host emits |
| `windows.onFocusChanged` | No | Host emits |
| `windows.onBoundsChanged` | No | Host emits |

**Note**: DaydreamX may operate as a single-window application. In that case, `windows.getAll()` always returns one window, and `windows.create()` could either create a new browser window (if the host supports it) or throw an error.

### chrome.webRequest

| Event | MV2 Behavior | MV3 Behavior |
|-------|-------------|-------------|
| `onBeforeRequest` | Can block/redirect (with `webRequestBlocking`) | Observe only |
| `onBeforeSendHeaders` | Can modify headers (with `webRequestBlocking`) | Observe only |
| `onSendHeaders` | Observe only | Observe only |
| `onHeadersReceived` | Can modify response headers | Observe only |
| `onAuthRequired` | Can provide credentials | Observe only |
| `onResponseStarted` | Observe only | Observe only |
| `onBeforeRedirect` | Observe only | Observe only |
| `onCompleted` | Observe only | Observe only |
| `onErrorOccurred` | Observe only | Observe only |

**Integration**: All webRequest events are emitted by the BareMux worker's network middleware. The BareMux worker communicates with extension contexts via BroadcastChannel through the SharedWorker. See [PROXY-INTEGRATION.md](PROXY-INTEGRATION.md).

### chrome.declarativeNetRequest (MV3 only)

| Method | Implementation |
|--------|----------------|
| `declarativeNetRequest.updateDynamicRules(options)` | Update rules in IndexedDB |
| `declarativeNetRequest.getDynamicRules(filter?)` | Query rules from IndexedDB |
| `declarativeNetRequest.updateSessionRules(options)` | Update in-memory rules |
| `declarativeNetRequest.getSessionRules(filter?)` | Query in-memory rules |
| `declarativeNetRequest.updateEnabledRulesets(options)` | Enable/disable static rulesets |
| `declarativeNetRequest.getEnabledRulesets()` | Return enabled ruleset IDs |
| `declarativeNetRequest.getAvailableStaticRuleCount()` | Return remaining quota |
| `declarativeNetRequest.isRegexSupported(regexOptions)` | Test regex validity |
| `declarativeNetRequest.testMatchOutcome(request)` | Test which rules would match |
| `declarativeNetRequest.onRuleMatchedDebug` | Fire on rule match (debug only) |

**Rule evaluation** happens in the BareMux worker's network middleware alongside webRequest, but rule management (CRUD) is in Helium core.

## Tier 3: Specialized

### chrome.bookmarks

Fully host-bound. All CRUD operations delegate to DaydreamX's bookmark manager. Events are emitted by the host.

### chrome.history

Fully host-bound. All query/modification operations delegate to DaydreamX's history system.

### chrome.downloads

Fully host-bound. Download operations delegate to DaydreamX's download manager.

### chrome.sessions

Fully host-bound. Session restore operations delegate to DaydreamX's session manager.

### chrome.management

Hybrid:
- `management.getAll()`, `management.get(id)`, `management.getSelf()` -- Read from ExtensionRegistry (self-contained)
- `management.setEnabled(id, enabled)`, `management.uninstall(id)` -- Modify ExtensionRegistry + host UI update
- `management.onInstalled`, `management.onUninstalled`, `management.onEnabled`, `management.onDisabled` -- Emitted during extension lifecycle operations

### chrome.proxy

Host-bound. Proxy configuration delegates to the proxy layer (BareMux/Reflux transport settings).

### chrome.identity

Partially implementable:
- `identity.getAuthToken()` -- Could integrate with an OAuth flow if the host provides it
- `identity.getProfileUserInfo()` -- Return profile info if the host provides it
- `identity.launchWebAuthFlow(details)` -- Open a popup/tab for OAuth redirect flow
- Most identity methods will be stubs initially

### chrome.declarativeContent

Self-contained using `DeclarativeEvent` base class. Evaluates page state rules against content script reports.

## Tier 4: Niche

Most Tier 4 APIs will remain as stubs initially. Implementation priority will be driven by specific extension compatibility requirements.

| Namespace | Feasibility | Notes |
|-----------|-------------|-------|
| `tts` / `ttsEngine` | Feasible | Use Web Speech API (`speechSynthesis`) |
| `offscreen` | Feasible | Create hidden iframe (similar to MV2 background) |
| `sidePanel` | Feasible | Host renders iframe in sidebar UI |
| `tabGroups` | Feasible if host supports | Delegate to host's tab group management |
| `idle` | Feasible | Track user activity (mouse/keyboard events) |
| `power` | Not feasible | Cannot prevent system sleep from web context |
| `debugger` | Not feasible | Cannot attach Chrome DevTools Protocol from web context |
| `tabCapture` / `desktopCapture` | Partial | Could use `getDisplayMedia()` but with limitations |
| `pageCapture` | Not feasible | Cannot save MHTML from web context |
| `dns` | Not feasible | Cannot do DNS lookups from web context |
| `topSites` | Feasible | Return from host's "most visited" data |
| `fontSettings` | Partial | Can read some font info but cannot change browser fonts |
| `privacy` | Partial | Some settings mappable to proxy config |
| `contentSettings` | Partial | Some settings manageable via content script injection |
| `search` | Feasible | Delegate to host's search/omnibox |
| `readingList` | Feasible if host supports | Delegate to host's reading list |
| `browsingData` | Partial | Can clear IndexedDB/cookies/cache within proxy scope |
| `printerProvider` | Not feasible | No printing API access in web context |

## Cross-Cutting Concerns

### Promise/Callback Duality

Every method that accepts a callback must also return a Promise (for MV3 compatibility). The binding system wrapper handles this automatically (see [API-BINDING.md](API-BINDING.md)).

### chrome.runtime.lastError

Must be set before any callback invocation where the operation failed. Must be cleared after the callback returns. Must be per-context (not global).

### Extension-Scoped State

All API state (alarms, storage, action state, context menus, etc.) is scoped to the extension. Two extensions cannot see each other's alarms, storage keys, or context menus.

### Tab ID Consistency

Tab IDs must be consistent across all API calls and events. The SharedWorker's Tab Registry is the source of truth. The host application must report tab creation/destruction to keep the registry in sync.
