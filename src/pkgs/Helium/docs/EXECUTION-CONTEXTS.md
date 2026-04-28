# Execution Contexts

This document describes how Helium creates, manages, and isolates the JavaScript environments where extension code runs.

## Overview

Chrome extensions run code in multiple isolated contexts. Helium must emulate each one:

| Context Type | Real Chrome | Helium Emulation | chrome.* Access |
|-------------|-------------|------------------|-----------------|
| MV2 Background Page | Hidden browser page | Hidden `<iframe>` | Full |
| MV3 Service Worker | ServiceWorker | Dedicated `Worker` | Full (no DOM) |
| Content Script | Isolated world in tab | Injected script in proxied page | Limited (`runtime`, `storage`, `i18n`, `extension`) |
| Extension Page (popup) | Browser-managed popup | `<iframe>` in host UI | Full |
| Extension Page (options) | Tab with extension URL | `<iframe>` in host UI | Full |
| Extension Page (sidepanel) | Browser sidebar | `<iframe>` in host UI | Full |
| Extension Page (newtab) | Overridden new tab page | `<iframe>` served from virtual FS | Full |
| Extension Page (devtools) | DevTools panel | `<iframe>` in host UI | Full + `devtools.*` |
| Offscreen Document (MV3) | Hidden document | Hidden `<iframe>` | Limited |

## Context Manager

The `ExecutionContextManager` is responsible for creating and destroying all execution contexts:

```typescript
interface ExecutionContext {
  id: string;                          // Unique context ID
  type: ContextType;
  extensionId: string;
  tabId?: number;                      // For content scripts and tab-based pages
  frameId?: number;                    // For content scripts
  windowId?: number;
  messagePort: MessagePort;            // Connection to SharedWorker
  chromeInstance: Chrome;              // The chrome.* object for this context
  destroy(): void;
}

enum ContextType {
  BACKGROUND = 'BACKGROUND',
  CONTENT_SCRIPT = 'CONTENT_SCRIPT',
  POPUP = 'POPUP',
  OPTIONS = 'OPTIONS',
  SIDE_PANEL = 'SIDE_PANEL',
  NEW_TAB = 'NEW_TAB',
  DEVTOOLS = 'DEVTOOLS',
  OFFSCREEN = 'OFFSCREEN',
  TAB = 'TAB',                         // Extension page loaded in a tab
}
```

## MV2 Background Pages

### How Chrome Does It

Chrome creates a hidden browser page (with full DOM) that runs the extension's background scripts. In MV2 with `"persistent": true`, this page stays alive indefinitely. With `"persistent": false` (event pages), Chrome suspends the page after ~5 seconds of inactivity.

### How Helium Does It

Helium creates a hidden `<iframe>` appended to a management container in the host page:

```typescript
class MV2BackgroundContext {
  private iframe: HTMLIFrameElement;
  private chromeInstance: Chrome;  // from @anthropic/chrome-api-mv2

  async create(extensionId: string, manifest: ParsedManifest): Promise<void> {
    // 1. Create hidden iframe
    this.iframe = document.createElement('iframe');
    this.iframe.style.display = 'none';
    this.iframe.sandbox = 'allow-scripts allow-same-origin';
    this.iframe.setAttribute('data-helium-ext', extensionId);
    this.iframe.setAttribute('data-helium-context', 'background');

    // 2. Determine what to load
    if (manifest.background?.page) {
      // Background page mode: load the HTML file
      this.iframe.src = this.resolveExtensionURL(extensionId, manifest.background.page);
    } else if (manifest.background?.scripts) {
      // Background scripts mode: create a minimal HTML page that loads each script
      const html = this.buildBackgroundHTML(extensionId, manifest.background.scripts);
      this.iframe.srcdoc = html;
    }

    // 3. Inject chrome.* before scripts execute
    //    We use the iframe's onload to inject, but for document_start
    //    we need to inject via a MutationObserver or by controlling the HTML
    this.iframe.addEventListener('load', () => {
      this.injectChromeAPI(extensionId);
    });

    // 4. Append to management container
    document.getElementById('helium-contexts')!.appendChild(this.iframe);

    // 5. Connect to SharedWorker
    this.connectToMessageRouter(extensionId, ContextType.BACKGROUND);
  }

  private buildBackgroundHTML(extensionId: string, scripts: string[]): string {
    const scriptTags = scripts
      .map(s => `<script src="${this.resolveExtensionURL(extensionId, s)}"></script>`)
      .join('\n');

    return `<!DOCTYPE html>
<html>
<head>
  <script>/* Helium runtime bootstrap */</script>
  ${scriptTags}
</head>
<body></body>
</html>`;
  }

  private injectChromeAPI(extensionId: string): void {
    const win = this.iframe.contentWindow!;

    // Create and configure the MV2 Chrome instance
    this.chromeInstance = new Chrome();
    this.configureChromeInstance(this.chromeInstance, extensionId);

    // Inject as window.chrome
    Object.defineProperty(win, 'chrome', {
      value: this.chromeInstance,
      writable: false,
      configurable: false,
    });
  }

  destroy(): void {
    this.iframe.remove();
    this.disconnectFromMessageRouter();
  }
}
```

### Lifecycle (persistent vs event pages)

**Persistent background page** (`"persistent": true`, the default in MV2):
- Created when the extension is loaded
- Never destroyed until the extension is unloaded/disabled
- Always available for message routing

**Event page** (`"persistent": false`):
- Created on first event that requires it
- Idle timer starts when no pending callbacks, ports, or message channels remain
- Destroyed after 5 seconds of inactivity (matching Chrome)
- Recreated when a new event fires

```typescript
class EventPageLifecycle {
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private activePorts: Set<string> = new Set();
  private pendingCallbacks: number = 0;

  onActivity(): void {
    // Reset idle timer
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  onIdle(): void {
    if (this.activePorts.size > 0 || this.pendingCallbacks > 0) {
      return; // Still active
    }

    this.idleTimer = setTimeout(() => {
      this.suspend();
    }, 5000);
  }

  private suspend(): void {
    // Fire chrome.runtime.onSuspend
    this.chromeInstance.runtime.onSuspend.dispatch();

    // Wait briefly for any cancellation
    setTimeout(() => {
      if (this.activePorts.size === 0 && this.pendingCallbacks === 0) {
        this.destroy();
      } else {
        // Activity resumed during onSuspend, fire onSuspendCanceled
        this.chromeInstance.runtime.onSuspendCanceled.dispatch();
      }
    }, 100);
  }
}
```

## MV3 Background Workers

### How Chrome Does It

Chrome runs the extension's background as a ServiceWorker with an event-driven lifecycle. The worker terminates after 30 seconds of inactivity (or 5 minutes for active work). It restarts on the next event.

### How Helium Does It

Helium uses a **Dedicated Worker** (not a ServiceWorker, since only one SW can control a scope). The event-driven lifecycle is emulated with keepalive tracking:

```typescript
class MV3BackgroundContext {
  private worker: Worker | null = null;
  private extensionId: string;
  private keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
  private activeKeepAlives: Set<string> = new Set();

  async create(extensionId: string, manifest: ParsedManifest): Promise<void> {
    this.extensionId = extensionId;
    await this.spawnWorker(manifest);
  }

  private async spawnWorker(manifest: ParsedManifest): Promise<void> {
    // 1. Build the worker script
    //    We need to prepend the Helium runtime + chrome.* API before
    //    the extension's service_worker code
    const runtimeScript = await this.buildRuntimeScript(this.extensionId);
    const extensionScript = await this.readExtensionFile(
      this.extensionId,
      manifest.background!.service_worker!
    );

    // 2. Combine into a single blob
    const isModule = manifest.background?.type === 'module';
    const combined = `${runtimeScript}\n\n${extensionScript}`;
    const blob = new Blob([combined], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);

    // 3. Create the worker
    this.worker = new Worker(blobUrl, {
      type: isModule ? 'module' : 'classic',
      name: `helium-bg-${this.extensionId}`,
    });

    // 4. Set up message handling (bridge to SharedWorker)
    this.worker.onmessage = (e) => this.handleWorkerMessage(e);
    this.worker.onerror = (e) => this.handleWorkerError(e);

    // 5. Connect worker to SharedWorker backbone
    this.connectToMessageRouter();

    // 6. Start idle tracking
    this.resetIdleTimer();

    // 7. Clean up blob URL
    URL.revokeObjectURL(blobUrl);
  }

  private buildRuntimeScript(extensionId: string): string {
    // This injects:
    // - The MV3 Chrome class and all API stubs
    // - A self.chrome global
    // - MessagePort setup for SharedWorker communication
    // - Keepalive tracking hooks
    return `
      // ... Helium MV3 runtime code ...
      // Sets up self.chrome with full MV3 API surface
      // Connects to SharedWorker via BroadcastChannel fallback
      //   (Workers can't directly connect to SharedWorkers
      //    in all browsers, so we use a main-thread relay)
    `;
  }

  // --- Lifecycle Management ---

  private resetIdleTimer(): void {
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer);
    }

    if (this.activeKeepAlives.size > 0) {
      return; // Active work, don't start timer
    }

    this.keepaliveTimer = setTimeout(() => {
      this.terminateWorker();
    }, 30_000); // 30 second idle timeout (Chrome's default)
  }

  addKeepAlive(id: string): void {
    this.activeKeepAlives.add(id);
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  removeKeepAlive(id: string): void {
    this.activeKeepAlives.delete(id);
    if (this.activeKeepAlives.size === 0) {
      this.resetIdleTimer();
    }
  }

  private terminateWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  /**
   * Ensure the worker is alive, respawning if needed.
   * Called before dispatching any event to this extension.
   */
  async ensureAlive(manifest: ParsedManifest): Promise<void> {
    if (!this.worker) {
      await this.spawnWorker(manifest);
    }
  }

  destroy(): void {
    this.terminateWorker();
    this.disconnectFromMessageRouter();
  }
}
```

### Worker Communication Challenge

Dedicated Workers cannot directly connect to SharedWorkers in all browser environments. To bridge this:

**Option A: Main-thread relay**
```
Worker ←(postMessage)→ Main Thread ←(MessagePort)→ SharedWorker
```
The main thread acts as a transparent relay, forwarding messages between the Worker and the SharedWorker.

**Option B: BroadcastChannel**
```
Worker ←(BroadcastChannel)→ SharedWorker
```
Both the Worker and SharedWorker listen on the same BroadcastChannel. Less efficient (broadcast to all) but simpler. Messages include target context IDs for filtering.

**Recommended**: Option A for production (direct MessagePort gives reliable delivery). Option B as a fallback.

## Content Scripts

### Injection Mechanism

Content scripts are injected into proxied web pages via Reflux's `@browser` injection mechanism. When a proxied page's HTML response passes through the Reflux middleware transport, Helium's injection plugin evaluates the URL against all registered content script match patterns and injects matching scripts.

```
Response passes through Reflux middleware transport
  → Helium injection plugin evaluates URL against content script patterns
  → For each matching extension:
    → Determine run_at timing
    → Inject Helium content script bootstrap via @browser
    → Inject extension's content script files via @browser
  → Response returns to proxy SW for rewriting
```

This approach requires no UV/Scramjet-specific hooks or `config.inject` configuration -- Reflux handles all injection at the transport level.

### Injection HTML

Injection is handled by Reflux's `@browser` mechanism. The injected code follows these patterns depending on `run_at`:

For `run_at: "document_start"` (inject before any page scripts):
```html
<!-- Injected via @browser at the very top of <head> -->
<script data-helium-cs="ext-abc123" data-helium-world="ISOLATED">
  // Helium content script bootstrap
  (function() {
    // Set up limited chrome.* API
    const chrome = {
      runtime: { /* messaging only */ },
      storage: { /* full access */ },
      i18n: { /* message lookup */ },
      extension: { /* getURL only */ },
    };

    // Connect to SharedWorker for messaging
    // ...

    // Execute content script in isolated scope
    // ...
  })();
</script>
```

For `run_at: "document_end"`:
```html
<!-- Injected via @browser, wrapped in DOMContentLoaded listener -->
<script data-helium-cs="ext-abc123">
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { /* execute */ }, {once: true});
  } else {
    /* execute immediately */
  }
</script>
```

For `run_at: "document_idle"`:
```html
<script data-helium-cs="ext-abc123">
  if (document.readyState === 'complete') {
    // Execute immediately
  } else {
    window.addEventListener('load', () => { /* execute */ }, {once: true});
  }
</script>
```

### Isolated World Emulation

Chrome runs content scripts in an "isolated world" -- they share the page's DOM but have a separate JavaScript scope. Page scripts cannot access content script variables and vice versa.

Helium emulates this by:

1. **Wrapping content scripts in an IIFE** that creates a closed scope
2. **The `chrome` object is only available inside this scope**
3. **DOM access is direct** (no proxy needed -- they share the real DOM)
4. **Page-level `window` properties set by page scripts are visible** (this matches Chrome's behavior for DOM, but not for JS variables)

```javascript
// Content script isolation wrapper
(function(chrome, undefined) {
  'use strict';

  // Content script code runs here
  // It can access the DOM normally
  // It has its own `chrome` object
  // Page scripts cannot see `chrome` or any variables defined here

  ${extensionContentScript}

})(heliumCreateContentScriptChrome('${extensionId}', ${tabId}, ${frameId}));
```

For `world: "MAIN"` content scripts (MV3), the script runs in the page's actual JavaScript context with no isolation. The `chrome` object is still injected but is accessible to the page.

### CSS Injection

Content script CSS files are injected as `<style>` tags:

```html
<style data-helium-css="ext-abc123">
  /* Extension's CSS content */
</style>
```

These are injected at `document_start` regardless of `run_at` (matching Chrome's behavior).

## Extension Pages

### Popup

```typescript
class PopupContext {
  private iframe: HTMLIFrameElement;

  open(extensionId: string, popupPath: string, anchorElement: HTMLElement): void {
    this.iframe = document.createElement('iframe');
    this.iframe.src = this.resolveExtensionURL(extensionId, popupPath);
    this.iframe.className = 'helium-popup';
    this.iframe.setAttribute('data-helium-ext', extensionId);
    this.iframe.setAttribute('data-helium-context', 'popup');

    // Position near the anchor (extension icon in toolbar)
    this.positionPopup(anchorElement);

    // Inject chrome.* after load
    this.iframe.addEventListener('load', () => {
      this.injectChromeAPI(extensionId, ContextType.POPUP);
    });

    document.body.appendChild(this.iframe);

    // Close on click outside
    document.addEventListener('click', this.handleOutsideClick);
  }

  close(): void {
    if (this.iframe) {
      this.iframe.remove();
      this.disconnectFromMessageRouter();
    }
    document.removeEventListener('click', this.handleOutsideClick);
  }
}
```

### Options Page

Options pages open as tabs in the host application (or as embedded iframes depending on `options_ui.open_in_tab`):

```typescript
class OptionsPageContext {
  open(extensionId: string, manifest: ParsedManifest): void {
    const optionsPath = manifest.options_ui?.page || manifest.options_page;
    if (!optionsPath) {
      throw new Error('Extension has no options page');
    }

    if (manifest.options_ui?.open_in_tab !== false) {
      // Open in a new tab (default)
      helium.emit('tabs.create', {
        url: this.resolveExtensionURL(extensionId, optionsPath),
      });
    } else {
      // Open as embedded iframe in extensions management page
      this.openEmbedded(extensionId, optionsPath);
    }
  }
}
```

### New Tab Override

When an extension declares `chrome_url_overrides.newtab`, the host application should load the extension's new tab page instead of its default:

```typescript
// In DaydreamX's tab creation logic:
function getNewTabURL(): string {
  const override = helium.getNewTabOverride();
  if (override) {
    return resolveExtensionURL(override.extensionId, override.path);
  }
  return 'about:blank'; // or default new tab
}
```

## Context Registry

The SharedWorker maintains a registry of all active contexts:

```typescript
interface ContextRegistryEntry {
  contextId: string;
  type: ContextType;
  extensionId: string;
  tabId?: number;
  frameId?: number;
  windowId?: number;
  url?: string;
  port: MessagePort;
  createdAt: number;
}

class ContextRegistry {
  private contexts: Map<string, ContextRegistryEntry> = new Map();

  register(entry: ContextRegistryEntry): void { /* ... */ }
  unregister(contextId: string): void { /* ... */ }

  // Queries
  getByExtension(extensionId: string): ContextRegistryEntry[] { /* ... */ }
  getByTab(tabId: number): ContextRegistryEntry[] { /* ... */ }
  getBackground(extensionId: string): ContextRegistryEntry | undefined { /* ... */ }
  getContentScripts(extensionId: string, tabId: number): ContextRegistryEntry[] { /* ... */ }
  getAllContexts(): ContextRegistryEntry[] { /* ... */ }
}
```

## Cleanup and Error Handling

### Context Destruction Order

When an extension is unloaded:

```
1. Fire chrome.runtime.onSuspend to background context
2. Wait 100ms for cleanup
3. Disconnect all MessagePorts
4. Terminate background worker/remove background iframe
5. Remove all content scripts from active tabs (remove injected <script> and <style> tags)
6. Close all open extension pages (popup, options, sidepanel)
7. Unregister all contexts from ContextRegistry
8. Remove alarms
9. Remove context menu items
10. Unregister content scripts from Reflux injection plugin
11. Fire chrome.management.onUninstalled to other extensions
```

### Error Isolation

Errors in one extension context must not affect others:

- Each Worker has its own `onerror` handler that logs but doesn't propagate
- Each iframe's scripts run in an isolated scope
- The SharedWorker catches errors in message handling and drops malformed messages
- If a background worker crashes, Helium can auto-restart it (matching Chrome's behavior for MV3 workers)

### Memory Management

- Terminated workers are fully garbage-collected (Worker.terminate() + null reference)
- Removed iframes are garbage-collected (iframe.remove() + null reference)
- MessagePorts are explicitly closed on context destruction
- Blob URLs created for workers are revoked after worker creation
