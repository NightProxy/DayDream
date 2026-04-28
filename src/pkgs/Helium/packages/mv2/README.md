# @anthropic/chrome-api-mv2

Auto-generated Manifest V2 Chrome API surface with 43 namespaces.

## Structure

```
src/
├── Chrome.ts          # Root class assembling all namespaces
└── api/
    ├── index.ts       # Barrel export
    ├── alarms.ts      # ChromeAlarms
    ├── app.ts         # ChromeApp (MV2-only)
    ├── bookmarks.ts   # ChromeBookmarks
    ├── browserAction.ts # ChromeBrowserAction (MV2-only, replaced by chrome.action in MV3)
    ├── browsingData.ts
    ├── clipboard.ts
    ├── contentSettings.ts
    ├── contextMenus.ts
    ├── cookies.ts
    ├── debugger.ts
    ├── declarativeContent.ts
    ├── desktopCapture.ts
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
    ├── pageCapture.ts
    ├── permissions.ts
    ├── power.ts
    ├── printerProvider.ts
    ├── privacy.ts
    ├── proxy.ts
    ├── runtime.ts
    ├── search.ts
    ├── sessions.ts
    ├── storage.ts
    ├── system.ts
    ├── tabCapture.ts
    ├── tabs.ts
    ├── topSites.ts
    ├── tts.ts
    ├── ttsEngine.ts
    ├── webNavigation.ts
    ├── webRequest.ts
    └── windows.ts
```

## Usage

```typescript
import { Chrome } from '@anthropic/chrome-api-mv2';

const chrome = new Chrome();

// Events are live ChromeEvent instances
chrome.tabs.onCreated.addListener((tab) => {
  console.log('Tab created:', tab);
});

// Methods are stubs (throw "not implemented" until bound)
chrome.tabs.create({ url: "https://example.com" }); // throws

// Enums and constants are correctly typed
console.log(ChromeTabs.TabStatus.COMPLETE);  // "complete"
console.log(ChromeTabs.TAB_ID_NONE);          // -1
```

## MV2-Specific APIs

These namespaces exist only in the MV2 package:

| Namespace | Notes |
|-----------|-------|
| `chrome.app` | Chrome App APIs (largely deprecated) |
| `chrome.browserAction` | Toolbar button (replaced by `chrome.action` in MV3) |

## MV2-Specific Methods

The MV2 `tabs` namespace includes deprecated methods not present in MV3:
- `tabs.executeScript()` -- Use `chrome.scripting.executeScript()` in MV3
- `tabs.insertCSS()` -- Use `chrome.scripting.insertCSS()` in MV3
- `tabs.removeCSS()` -- Use `chrome.scripting.removeCSS()` in MV3
- `tabs.getAllInWindow()` -- Deprecated, use `tabs.query()`
- `tabs.getSelected()` -- Deprecated, use `tabs.query({active: true})`
- `tabs.sendRequest()` -- Deprecated, use `tabs.sendMessage()`

The MV2 `runtime` namespace includes:
- `runtime.getBackgroundPage()` -- Not available in MV3 (no background page)
- `runtime.getVersion()` -- Removed in MV3
- `runtime.getPackageDirectoryEntry()` -- Removed in MV3

The MV2 `extension` namespace has more methods than MV3's stripped-down version.

## Generated From

All API stubs are auto-generated from `JSON Objects/MV2.json`, which is a real dump of Chrome's `chrome.*` object from an MV2 extension with all permissions enabled. The code generator is at `tools/generate.js`.
