# Message Passing

This document describes Helium's inter-context communication system: how extension backgrounds, content scripts, popups, and extension pages send messages to each other.

## Architecture Overview

All Helium execution contexts communicate through a central **SharedWorker** that acts as a message router. This mirrors how Chrome's internal IPC works, but using web APIs.

```
┌─────────────────────────────────────────────────────────────────┐
│                        SharedWorker                             │
│                    (helium-message-router)                       │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ Tab Registry  │  │ Port Manager │  │ Extension Registry │   │
│  │              │  │              │  │                    │   │
│  │ tabId → {    │  │ portId → {   │  │ extId → {         │   │
│  │   contexts,  │  │   sender,    │  │   manifest,       │   │
│  │   url,       │  │   receiver,  │  │   permissions,    │   │
│  │   title,     │  │   name,      │  │   contexts[],     │   │
│  │   windowId   │  │   extId      │  │ }                 │   │
│  │ }            │  │ }            │  │                    │   │
│  └──────────────┘  └──────────────┘  └────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Message Router                         │  │
│  │                                                          │  │
│  │  Receives messages from any context via MessagePort      │  │
│  │  Routes to target context(s) based on message type       │  │
│  │  Handles sendMessage, connect, port.postMessage          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Ports:                                                         │
│  ├── [context-bg-ext1]   ← Background Worker for ext1          │
│  ├── [context-cs-tab42]  ← Content Script in tab 42            │
│  ├── [context-popup-ext1] ← Popup for ext1                     │
│  ├── [context-bg-ext2]   ← Background Worker for ext2          │
│  └── ...                                                        │
└─────────────────────────────────────────────────────────────────┘
```

## SharedWorker Implementation

### Initialization

```typescript
// helium-router.worker.ts (SharedWorker script)

const connections: Map<string, MessagePort> = new Map();
const tabRegistry: TabRegistry = new TabRegistry();
const portManager: PortManager = new PortManager();
const extensionRegistry: ExtensionRegistryWorker = new ExtensionRegistryWorker();

self.addEventListener('connect', (event: MessageEvent) => {
  const port = (event as any).ports[0] as MessagePort;

  port.addEventListener('message', (msg: MessageEvent) => {
    handleMessage(port, msg.data);
  });

  port.start();
});
```

### Context Registration Protocol

When a new execution context is created, it connects to the SharedWorker and sends a registration message:

```typescript
// From the context side:
const sharedWorker = new SharedWorker('/helium/router.worker.js');
const port = sharedWorker.port;

port.postMessage({
  type: '__helium_register',
  contextId: 'ctx-abc123',
  contextType: 'BACKGROUND',  // or CONTENT_SCRIPT, POPUP, etc.
  extensionId: 'ext-abc123',
  tabId: undefined,            // set for content scripts and tab-based pages
  frameId: undefined,          // set for content scripts
  windowId: 1,
});
```

```typescript
// SharedWorker handles registration:
function handleRegister(port: MessagePort, data: RegisterMessage): void {
  connections.set(data.contextId, port);

  extensionRegistry.addContext(data.extensionId, {
    contextId: data.contextId,
    type: data.contextType,
    tabId: data.tabId,
    frameId: data.frameId,
    windowId: data.windowId,
    port,
  });

  if (data.tabId !== undefined) {
    tabRegistry.addContext(data.tabId, data);
  }

  // Acknowledge registration
  port.postMessage({
    type: '__helium_registered',
    contextId: data.contextId,
  });
}
```

## Message Types and Routing

### chrome.runtime.sendMessage (one-shot, within extension)

Extension code:
```javascript
chrome.runtime.sendMessage({ action: "getData" }, function(response) {
  console.log(response);
});
```

Wire protocol:
```typescript
// Content script → SharedWorker
{
  type: 'runtime.sendMessage',
  messageId: 'msg-uuid-1234',       // For correlating response
  senderContextId: 'ctx-cs-tab42',
  extensionId: 'ext-abc123',        // Target extension (own extension)
  payload: { action: "getData" },
}

// SharedWorker routes to background context of ext-abc123:
//   1. Look up extensionRegistry.getBackground('ext-abc123')
//   2. Forward message to that context's port

// SharedWorker → Background context
{
  type: 'runtime.onMessage',
  messageId: 'msg-uuid-1234',
  sender: {
    id: 'ext-abc123',
    url: 'https://example.com/page',
    tab: { id: 42, url: 'https://example.com/page', ... },
    frameId: 0,
  },
  payload: { action: "getData" },
}

// Background calls sendResponse (or returns a value):
// Background → SharedWorker
{
  type: 'runtime.sendMessage.response',
  messageId: 'msg-uuid-1234',
  targetContextId: 'ctx-cs-tab42',
  payload: { data: [1, 2, 3] },
  error: null,
}

// SharedWorker → Content script (original sender)
{
  type: 'runtime.sendMessage.response',
  messageId: 'msg-uuid-1234',
  payload: { data: [1, 2, 3] },
}
```

### chrome.runtime.sendMessage (external, cross-extension)

Same flow but the `extensionId` field targets a different extension. The SharedWorker verifies:
1. Target extension exists and is enabled
2. Target extension's `externally_connectable.ids` includes the sender's extension ID (or is `["*"]`)

### chrome.tabs.sendMessage (background → content script)

Extension code:
```javascript
chrome.tabs.sendMessage(42, { action: "highlight" }, function(response) {
  console.log(response);
});
```

Wire protocol:
```typescript
// Background → SharedWorker
{
  type: 'tabs.sendMessage',
  messageId: 'msg-uuid-5678',
  senderContextId: 'ctx-bg-ext1',
  extensionId: 'ext-abc123',       // Sender's extension
  tabId: 42,
  frameId: 0,                      // Optional, defaults to 0 (main frame)
  payload: { action: "highlight" },
}

// SharedWorker routes:
//   1. Look up tabRegistry.getContentScripts('ext-abc123', tabId: 42)
//   2. If frameId specified, filter to that frame
//   3. Forward to matching content script context(s)
```

### chrome.runtime.connect / chrome.tabs.connect (long-lived ports)

Extension code:
```javascript
// Background opens a port to content script
const port = chrome.tabs.connect(42, { name: "myChannel" });
port.onMessage.addListener((msg) => { console.log(msg); });
port.postMessage({ hello: "world" });
```

Wire protocol:
```typescript
// 1. Background → SharedWorker: Port creation request
{
  type: 'port.create',
  portId: 'port-uuid-1234',
  senderContextId: 'ctx-bg-ext1',
  extensionId: 'ext-abc123',
  target: { tabId: 42 },           // or { extensionId: '...' } for runtime.connect
  name: 'myChannel',
}

// 2. SharedWorker creates port entry and forwards to target
//    SharedWorker → Content script in tab 42:
{
  type: 'port.connected',
  portId: 'port-uuid-1234',
  name: 'myChannel',
  sender: {
    id: 'ext-abc123',
    url: 'chrome-extension://ext-abc123/background.js',
  },
}

// 3. Content script's chrome.runtime.onConnect fires
//    Content script gets a Port object backed by this portId

// 4. Messages flow through SharedWorker:
//    Background → SharedWorker → Content script (and vice versa)
{
  type: 'port.message',
  portId: 'port-uuid-1234',
  senderContextId: 'ctx-bg-ext1',
  payload: { hello: "world" },
}

// 5. Port disconnection:
{
  type: 'port.disconnect',
  portId: 'port-uuid-1234',
  senderContextId: 'ctx-bg-ext1',
}
// SharedWorker notifies the other end → onDisconnect fires
```

## Port Manager

The SharedWorker's Port Manager tracks all active long-lived ports:

```typescript
interface PortEntry {
  portId: string;
  name: string;
  extensionId: string;
  senderContextId: string;
  receiverContextId: string;
  createdAt: number;
}

class PortManager {
  private ports: Map<string, PortEntry> = new Map();

  createPort(request: PortCreateRequest): PortEntry {
    const entry: PortEntry = {
      portId: request.portId,
      name: request.name,
      extensionId: request.extensionId,
      senderContextId: request.senderContextId,
      receiverContextId: '', // set when target accepts
      createdAt: Date.now(),
    };
    this.ports.set(request.portId, entry);
    return entry;
  }

  routeMessage(portId: string, senderContextId: string, payload: any): void {
    const entry = this.ports.get(portId);
    if (!entry) {
      throw new Error(`Port ${portId} not found`);
    }

    // Route to the OTHER end of the port
    const targetContextId = senderContextId === entry.senderContextId
      ? entry.receiverContextId
      : entry.senderContextId;

    const targetPort = connections.get(targetContextId);
    if (targetPort) {
      targetPort.postMessage({
        type: 'port.message',
        portId,
        payload,
      });
    }
  }

  disconnectPort(portId: string, initiatorContextId: string): void {
    const entry = this.ports.get(portId);
    if (!entry) return;

    // Notify the other end
    const otherContextId = initiatorContextId === entry.senderContextId
      ? entry.receiverContextId
      : entry.senderContextId;

    const otherPort = connections.get(otherContextId);
    if (otherPort) {
      otherPort.postMessage({
        type: 'port.disconnected',
        portId,
      });
    }

    this.ports.delete(portId);
  }

  // Clean up all ports for a context that is being destroyed
  cleanupContext(contextId: string): void {
    for (const [portId, entry] of this.ports) {
      if (entry.senderContextId === contextId || entry.receiverContextId === contextId) {
        this.disconnectPort(portId, contextId);
      }
    }
  }
}
```

## Tab Registry

The Tab Registry maps tab IDs to metadata and associated contexts:

```typescript
interface TabRegistryEntry {
  tabId: number;
  windowId: number;
  url: string;
  title: string;
  active: boolean;
  contexts: Map<string, ContextRegistryEntry>;  // contextId → context
}

class TabRegistry {
  private tabs: Map<number, TabRegistryEntry> = new Map();
  private nextTabId: number = 1;

  // Called by host application when a tab is created
  registerTab(info: { windowId: number; url: string; title: string; active: boolean }): number {
    const tabId = this.nextTabId++;
    this.tabs.set(tabId, {
      tabId,
      windowId: info.windowId,
      url: info.url,
      title: info.title,
      active: info.active,
      contexts: new Map(),
    });
    return tabId;
  }

  // Called when a content script registers itself
  addContext(tabId: number, context: ContextRegistryEntry): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.contexts.set(context.contextId, context);
    }
  }

  // Called by host application when tab URL changes
  updateTab(tabId: number, changes: Partial<TabRegistryEntry>): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      Object.assign(tab, changes);
    }
  }

  // Get all content scripts for a specific extension in a specific tab
  getContentScripts(extensionId: string, tabId: number, frameId?: number): ContextRegistryEntry[] {
    const tab = this.tabs.get(tabId);
    if (!tab) return [];

    return Array.from(tab.contexts.values()).filter(ctx =>
      ctx.extensionId === extensionId &&
      ctx.type === ContextType.CONTENT_SCRIPT &&
      (frameId === undefined || ctx.frameId === frameId)
    );
  }

  // Get tab info for populating chrome.runtime.MessageSender.tab
  getTabInfo(tabId: number): TabInfo | undefined {
    const tab = this.tabs.get(tabId);
    if (!tab) return undefined;

    return {
      id: tab.tabId,
      windowId: tab.windowId,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      // Additional fields populated by host bindings
    };
  }

  removeTab(tabId: number): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      // Clean up all contexts for this tab
      for (const ctx of tab.contexts.values()) {
        portManager.cleanupContext(ctx.contextId);
        connections.delete(ctx.contextId);
      }
      this.tabs.delete(tabId);
    }
  }
}
```

## Sender Object Construction

The `chrome.runtime.MessageSender` object that listeners receive includes information about who sent the message:

```typescript
interface MessageSender {
  id?: string;           // Extension ID of the sender
  url?: string;          // URL of the sending context
  tab?: TabInfo;         // Tab info (if sent from a content script or tab page)
  frameId?: number;      // Frame ID (if sent from a content script)
  tlsChannelId?: string; // Not supported in Helium
}

function buildSender(contextEntry: ContextRegistryEntry): MessageSender {
  const sender: MessageSender = {
    id: contextEntry.extensionId,
  };

  if (contextEntry.tabId !== undefined) {
    sender.tab = tabRegistry.getTabInfo(contextEntry.tabId);
  }

  if (contextEntry.frameId !== undefined) {
    sender.frameId = contextEntry.frameId;
  }

  // URL depends on context type
  switch (contextEntry.type) {
    case ContextType.BACKGROUND:
      sender.url = `chrome-extension://${contextEntry.extensionId}/_generated_background_page.html`;
      break;
    case ContextType.CONTENT_SCRIPT:
      sender.url = contextEntry.url;  // The page URL where the content script is running
      break;
    case ContextType.POPUP:
      sender.url = `chrome-extension://${contextEntry.extensionId}/popup.html`;
      break;
    default:
      sender.url = contextEntry.url;
  }

  return sender;
}
```

## Client-Side Port Implementation

This is the `Port` object that extension code interacts with:

```typescript
class HeliumPort {
  readonly name: string;
  readonly sender?: MessageSender;
  readonly onMessage: ChromeEvent = new ChromeEvent();
  readonly onDisconnect: ChromeEvent = new ChromeEvent();

  private portId: string;
  private routerPort: MessagePort;  // Connection to SharedWorker
  private disconnected: boolean = false;

  constructor(portId: string, name: string, routerPort: MessagePort, sender?: MessageSender) {
    this.portId = portId;
    this.name = name;
    this.routerPort = routerPort;
    this.sender = sender;
  }

  postMessage(message: any): void {
    if (this.disconnected) {
      throw new Error('Attempting to use a disconnected port object');
    }

    this.routerPort.postMessage({
      type: 'port.message',
      portId: this.portId,
      payload: message,
    });
  }

  disconnect(): void {
    if (this.disconnected) return;
    this.disconnected = true;

    this.routerPort.postMessage({
      type: 'port.disconnect',
      portId: this.portId,
    });

    this.onDisconnect.dispatch(this);
  }

  // Called by the runtime when a port.message arrives for this port
  _handleMessage(payload: any): void {
    this.onMessage.dispatch(payload, this);
  }

  // Called by the runtime when a port.disconnected arrives for this port
  _handleDisconnect(): void {
    this.disconnected = true;
    this.onDisconnect.dispatch(this);
  }
}
```

## sendMessage with sendResponse

The `chrome.runtime.onMessage` listener can respond asynchronously by returning `true` and calling `sendResponse` later:

```javascript
// In background:
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fetchData") {
    // Return true to indicate async response
    fetch("https://api.example.com/data")
      .then(res => res.json())
      .then(data => sendResponse({ data }));
    return true;  // Keep the message channel open
  }
});
```

Helium handles this by:

1. The `onMessage` dispatch includes a `sendResponse` callback
2. If any listener returns `true`, the message channel stays open (the SharedWorker holds the response route)
3. When `sendResponse` is called, the response is sent back through the SharedWorker
4. If no listener returns `true` and no listener calls `sendResponse` synchronously, the channel closes

```typescript
// In the receiving context's chrome.runtime.onMessage dispatch:
function dispatchOnMessage(
  payload: any,
  sender: MessageSender,
  messageId: string,
  routerPort: MessagePort
): void {
  let responseSent = false;
  let keepOpen = false;

  const sendResponse = (response: any) => {
    if (responseSent) return;
    responseSent = true;

    routerPort.postMessage({
      type: 'runtime.sendMessage.response',
      messageId,
      payload: response,
    });
  };

  // Dispatch to all listeners
  for (const listener of chrome.runtime.onMessage._listeners) {
    try {
      const result = listener(payload, sender, sendResponse);
      if (result === true) {
        keepOpen = true;
      }
      // If result is a Promise (MV3), treat it as async response
      if (result && typeof result.then === 'function') {
        keepOpen = true;
        result.then(
          (response: any) => {
            if (response !== undefined) sendResponse(response);
          },
          (error: any) => {
            routerPort.postMessage({
              type: 'runtime.sendMessage.response',
              messageId,
              error: error.message,
            });
          }
        );
      }
    } catch (e) {
      console.error('Error in onMessage listener:', e);
    }
  }

  // If no listener kept the channel open, close it
  if (!keepOpen && !responseSent) {
    sendResponse(undefined);
  }
}
```

## BroadcastChannel Fallback

If SharedWorker is unavailable (some browser configurations), Helium falls back to BroadcastChannel:

```typescript
const channel = new BroadcastChannel('helium-messages');

channel.onmessage = (event) => {
  const msg = event.data;
  // Filter: only process messages targeted at this context
  if (msg.targetContextId && msg.targetContextId !== myContextId) return;
  if (msg.targetExtensionId && msg.targetExtensionId !== myExtensionId) return;

  handleIncomingMessage(msg);
};
```

**Limitations of BroadcastChannel fallback**:
- All messages are broadcast to all contexts (less efficient)
- No guaranteed delivery (contexts must filter by ID)
- No backpressure
- Tab registry must be duplicated in each context (or use a leader election pattern)

The SharedWorker approach is strongly preferred.

## Message Flow Diagrams

### runtime.sendMessage (Content Script → Background → Response)

```
Content Script              SharedWorker                Background
     │                          │                          │
     │─── runtime.sendMessage ──→                          │
     │    {msgId, payload}      │                          │
     │                          │─── runtime.onMessage ────→
     │                          │    {msgId, sender,       │
     │                          │     payload}             │
     │                          │                          │
     │                          │     ← sendResponse ──────│
     │                          │       {msgId, response}  │
     │                          │                          │
     │← runtime.sendMessage.    │                          │
     │   response ──────────────│                          │
     │   {msgId, response}      │                          │
```

### runtime.connect (Background → Content Script, bidirectional)

```
Background                  SharedWorker                Content Script
     │                          │                          │
     │─── port.create ─────────→                          │
     │    {portId, name,        │                          │
     │     target: {tabId}}     │                          │
     │                          │─── port.connected ──────→
     │                          │    {portId, name,        │
     │                          │     sender}              │
     │                          │                          │
     │                          │     (onConnect fires,    │
     │                          │      returns Port)       │
     │                          │                          │
     │─── port.message ────────→                          │
     │    {portId, payload}     │─── port.message ────────→
     │                          │    {portId, payload}     │
     │                          │                          │
     │                          │← port.message ───────────│
     │← port.message ──────────│    {portId, payload}     │
     │    {portId, payload}     │                          │
     │                          │                          │
     │─── port.disconnect ─────→                          │
     │    {portId}              │─── port.disconnected ───→
     │                          │    {portId}              │
```

## Host Application Event Emission

The host application (DaydreamX) emits events through the SharedWorker to notify extensions of browser state changes:

```typescript
// DaydreamX → SharedWorker
{
  type: '__helium_host_event',
  event: 'tabs.onCreated',
  data: { id: 5, url: 'about:blank', windowId: 1, active: true, ... },
}

// SharedWorker processes:
//   1. Update tab registry
//   2. For each extension with 'tabs' permission:
//      Forward event to all contexts that have onCreated listeners
```

Events that the host must emit:

| Event | Required Data |
|-------|---------------|
| `tabs.onCreated` | Full TabInfo object |
| `tabs.onRemoved` | `tabId`, `{windowId, isWindowClosing}` |
| `tabs.onUpdated` | `tabId`, `changeInfo`, full TabInfo |
| `tabs.onActivated` | `{tabId, windowId}` |
| `tabs.onMoved` | `tabId`, `{windowId, fromIndex, toIndex}` |
| `tabs.onAttached` | `tabId`, `{newWindowId, newPosition}` |
| `tabs.onDetached` | `tabId`, `{oldWindowId, oldPosition}` |
| `windows.onCreated` | Full WindowInfo object |
| `windows.onRemoved` | `windowId` |
| `windows.onFocusChanged` | `windowId` |
| `bookmarks.onCreated` | `id`, BookmarkTreeNode |
| `bookmarks.onRemoved` | `id`, `{parentId, index, node}` |
| `bookmarks.onChanged` | `id`, `{title, url}` |
| `history.onVisited` | HistoryItem |
| `history.onVisitRemoved` | `{allHistory, urls}` |
