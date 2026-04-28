# @anthropic/chrome-api-shared

Shared base classes used by both the MV2 and MV3 Chrome API packages.

## Classes

### ChromeEvent

**File**: `src/ChromeEvent.ts`

Mirrors the `chrome.events.Event` interface. Uses a `Set<EventListener>` for O(1) add/remove/has operations.

```typescript
const event = new ChromeEvent();
event.addListener((data) => console.log(data));
event.dispatch({ key: "value" });   // logs: { key: "value" }
event.hasListeners();                // true
```

**Methods**:
| Method | Description |
|--------|-------------|
| `addListener(callback)` | Register a listener |
| `removeListener(callback)` | Remove a listener |
| `hasListener(callback)` | Check if a specific listener is registered |
| `hasListeners()` | Check if any listeners exist |
| `dispatch(...args)` | Fire event to all listeners (catches errors per-listener) |

**Used by**: Every namespace that has events (tabs.onCreated, runtime.onMessage, etc.)

### DeclarativeEvent

**File**: `src/DeclarativeEvent.ts`

For rule-based events like `chrome.declarativeContent.onPageChanged`. Instead of callbacks, consumers add/remove rules with conditions and actions.

```typescript
const event = new DeclarativeEvent();
event.addRules([{
  conditions: [{ pageUrl: { hostEquals: "example.com" } }],
  actions: [{ type: "ShowAction" }],
}]);
```

**Methods**:
| Method | Description |
|--------|-------------|
| `addRules(rules, callback?)` | Register rules |
| `removeRules(ruleIdentifiers?, callback?)` | Remove rules by ID (or all) |
| `getRules(ruleIdentifiers?, callback?)` | Get registered rules |

**Used by**: `declarativeContent.onPageChanged`, `declarativeWebRequest` events

### ChromeSetting

**File**: `src/ChromeSetting.ts`

For browser settings like `chrome.privacy.network.webRTCIPHandlingPolicy`. Provides get/set/clear with an `onChange` event.

```typescript
const setting = new ChromeSetting();
setting.set({ value: "disable_non_proxied_udp" });
setting.get({}, (result) => {
  console.log(result.value);             // "disable_non_proxied_udp"
  console.log(result.levelOfControl);    // "controlled_by_this_extension"
});
```

**Methods**:
| Method | Description |
|--------|-------------|
| `get(details, callback?)` | Get current value and level of control |
| `set(details, callback?)` | Set value (fires onChange) |
| `clear(details, callback?)` | Reset to default (fires onChange) |
| `onChange` | ChromeEvent fired on value changes |

**Used by**: `privacy.*`, `proxy.settings`

### ContentSetting

**File**: `src/ContentSetting.ts`

For per-site content settings like `chrome.contentSettings.cookies`. Manages pattern-based rules.

```typescript
const setting = new ContentSetting();
setting.set({
  primaryPattern: "https://example.com/*",
  setting: "block",
});
```

**Methods**:
| Method | Description |
|--------|-------------|
| `get(details, callback?)` | Get effective setting for a URL pair |
| `set(details, callback?)` | Add a setting rule |
| `clear(details, callback?)` | Remove all rules |
| `getResourceIdentifiers(callback?)` | Get resource identifiers for this type |

**Used by**: `contentSettings.cookies`, `contentSettings.javascript`, etc.

### StorageArea

**File**: `src/StorageArea.ts`

Full implementation of `chrome.storage.StorageArea`. Currently uses an in-memory `Record<string, any>` store (will be backed by IndexedDB in production).

Supports all overloads of `get()`: string key, string array, object with defaults, or null (get all).

```typescript
const area = new StorageArea();
area.set({ name: "Alice", age: 30 });
area.get("name", (result) => console.log(result));  // { name: "Alice" }
area.get(null, (result) => console.log(result));     // { name: "Alice", age: 30 }
area.get({ name: "default", missing: "fallback" }, (result) => {
  console.log(result);  // { name: "Alice", missing: "fallback" }
});
```

**Methods**:
| Method | Description |
|--------|-------------|
| `get(keys?, callback?)` | Get items (supports string, array, object w/ defaults, null) |
| `getKeys(callback?)` | Get all storage keys |
| `set(items, callback?)` | Set items (fires onChanged) |
| `remove(keys, callback?)` | Remove items (fires onChanged) |
| `clear(callback?)` | Remove all items (fires onChanged) |
| `getBytesInUse(keys?, callback?)` | Calculate storage usage |
| `setAccessLevel(options, callback?)` | Set access level (stub) |
| `onChanged` | ChromeEvent fired on any storage change |

**Change tracking**: `set()`, `remove()`, and `clear()` all compute `changes` objects with `{ oldValue, newValue }` and dispatch them to `onChanged`.

**Used by**: `storage.local`, `storage.sync`, `storage.managed`, `storage.session`

## Future Changes

When the binding system and extension runtime are implemented:
1. `StorageArea` will get an IndexedDB backend option
2. `ChromeEvent` will integrate with the SharedWorker message router for cross-context event propagation
3. All classes will support Promise return values in addition to callbacks
