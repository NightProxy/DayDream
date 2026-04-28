# @anthropic/chrome-api-mv3

Auto-generated Manifest V3 Chrome API surface with 51 namespaces.

## Structure

```
src/
├── Chrome.ts          # Root class assembling all namespaces
└── api/
    ├── index.ts       # Barrel export
    ├── action.ts      # ChromeAction (MV3-only, replaces browserAction)
    ├── alarms.ts
    ├── bookmarks.ts
    ├── browsingData.ts
    ├── clipboard.ts
    ├── contentSettings.ts
    ├── contextMenus.ts
    ├── cookies.ts
    ├── debugger.ts
    ├── declarativeContent.ts
    ├── declarativeNetRequest.ts  # MV3-only
    ├── desktopCapture.ts
    ├── dns.ts                    # MV3-only
    ├── dom.ts
    ├── downloads.ts
    ├── extension.ts
    ├── fontSettings.ts
    ├── gcm.ts
    ├── history.ts
    ├── i18n.ts
    ├── identity.ts
    ├── idle.ts
    ├── instanceID.ts
    ├── management.ts
    ├── notifications.ts
    ├── offscreen.ts              # MV3-only
    ├── pageCapture.ts
    ├── permissions.ts
    ├── power.ts
    ├── printerProvider.ts
    ├── privacy.ts
    ├── processes.ts              # MV3-only
    ├── proxy.ts
    ├── readingList.ts            # MV3-only
    ├── runtime.ts
    ├── scripting.ts              # MV3-only
    ├── search.ts
    ├── sessions.ts
    ├── sidePanel.ts              # MV3-only
    ├── storage.ts
    ├── system.ts
    ├── tabCapture.ts
    ├── tabGroups.ts              # MV3-only
    ├── tabs.ts
    ├── topSites.ts
    ├── tts.ts
    ├── ttsEngine.ts
    ├── webAuthenticationProxy.ts  # MV3-only
    ├── webNavigation.ts
    ├── webRequest.ts
    └── windows.ts
```

## Usage

```typescript
import { Chrome } from '@anthropic/chrome-api-mv3';

const chrome = new Chrome();

// Events are live ChromeEvent instances
chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked in tab:', tab);
});

// Methods are stubs (throw "not implemented" until bound)
chrome.scripting.executeScript({ target: { tabId: 1 }, files: ['content.js'] }); // throws

// Enums and constants are correctly typed
console.log(ChromeScripting.ExecutionWorld.ISOLATED);  // "ISOLATED"
console.log(ChromeRuntime.OnInstalledReason.INSTALL);  // "install"
```

## MV3-Only APIs

These namespaces exist only in the MV3 package:

| Namespace | Replaces (MV2) | Notes |
|-----------|----------------|-------|
| `chrome.action` | `chrome.browserAction` | Unified toolbar button API |
| `chrome.scripting` | `chrome.tabs.executeScript/insertCSS` | Dynamic script injection |
| `chrome.declarativeNetRequest` | `chrome.webRequest` (blocking) | Declarative request rules |
| `chrome.offscreen` | -- | Background DOM access via hidden document |
| `chrome.sidePanel` | -- | Browser sidebar panel |
| `chrome.tabGroups` | -- | Tab group management |
| `chrome.dns` | -- | DNS resolution |
| `chrome.processes` | -- | Browser process info |
| `chrome.readingList` | -- | Reading list management |
| `chrome.webAuthenticationProxy` | -- | WebAuthn proxy |

## MV3-Specific Differences

### Runtime
- `runtime.getContexts(filter)` -- Query active extension contexts (new in MV3)
- `runtime.onUserScriptConnect` / `runtime.onUserScriptMessage` -- User script events (new in MV3)
- No `runtime.getBackgroundPage()` (no background page in MV3)

### Storage
- `storage.session` area available (in-memory, cleared on extension restart)

### Tabs
- No `tabs.executeScript()`, `tabs.insertCSS()`, `tabs.removeCSS()` (use `chrome.scripting`)
- No `tabs.getAllInWindow()`, `tabs.getSelected()`, `tabs.sendRequest()` (deprecated methods removed)

## Generated From

All API stubs are auto-generated from `JSON Objects/MV3.json`, which is a real dump of Chrome's `chrome.*` object from an MV3 extension with all permissions enabled. The code generator is at `tools/generate.js`.
