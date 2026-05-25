# Omnibox Rework + Command Palette + Engine Prefix + AI Mode

**Status:** Design — pending approval
**Date:** 2026-05-25
**Builds on:** `2026-05-23-protocols-search-registers-design.md` (already implemented; provides `SearchEngineRegistry`, `parseBang`, `searchImpl`, `BUILTIN_PROTOCOL_ROUTES`).

## Goal

Replace the disabled floating search overlay with an anchored, multi-mode address-bar dropdown that supports live suggestions, history/bookmarks/tabs/internal-pages search, a `>` command palette, an `@engine` prefix system, and a `?` AI prompt mode. All modes share one dispatch chain, one dropdown container, and consistent keyboard navigation.

## Non-goals

- Custom user-defined commands in the `>` palette (extensions territory; v1 surfaces only built-in commands).
- Per-tab default search engine.
- Voice input, image search, OCR.
- Cloud sync of registry mutations across devices.
- AI conversation history or multi-turn dialog (one-shot prompts only in v1).
- Browser-side AI provider hosting; the AI client is a thin OpenAI-compatible client. The actual NyxAI backend is out of scope and not yet released.
- Implementing the AI provider's authentication / billing / rate-limiting concerns. The user supplies a URL + API key; we send requests.

## Current state (from codebase exploration)

- **Existing search code:** `src/browser/search/` (6 files, 700 lines) plus a 944-line legacy `src/browser/search.ts`. Both are dead code — the consumer in `src/index.tsx:310-316` is commented out.
- **Address bar today** has no dropdown, no live suggestions, no command palette. Enter routes through `proto.processUrl` for registered protocols, otherwise `proxy.redirect` → `proxy.search` (which now uses the `searchImpl` + `parseBang` path shipped in the prior protocols-search-registers branch).
- **Available data sources** (already implemented in the codebase, ready to consume):
  - `SearchEngineRegistry` (`src/apis/searchEngines.ts`) — search engines with `bang` field; this design adds `at`.
  - `Protocols` (`src/browser/protocols/index.ts`) — registered routes; needs a new `listRoutes()` accessor.
  - `KeybindManager` (`src/browser/functions/keybinds.ts`) — keybind actions, queryable by category.
  - `BookmarkManager` (`src/apis/bookmarks.ts`) — `searchBookmarks(query)` method exists.
  - `HistoryManager` (`src/apis/history.ts`) — `searchEntries(query)` method exists.
  - `Tabs` (`src/browser/tabs/index.ts`) — open-tab state; needs a small `searchOpen(query)` method.
  - Live search-suggestions endpoint at `api/results/<query>` — already used by the dead search code.

## Architecture

A single new module `src/browser/omnibox/` owns the dropdown DOM and a **dispatch chain** keyed off the first non-whitespace character of the input:

```
Input
  ├── starts with `>`  → CommandPalette mode
  ├── starts with `@`  → EnginePrefix mode
  ├── starts with `!`  → BangPreview mode (existing routing, new preview)
  ├── starts with `?`  → AI mode
  └── otherwise        → Default mode (mixed-section omnibox)
```

The dropdown is **anchored under the address bar** — full address-bar width, opens on focus when there's input, closes on blur (with a 150ms delay so clicks register), Esc, or selection. Height clamped to `min-height: 25vh; max-height: 35vh` with internal scroll.

### New modules

- `src/browser/omnibox/index.ts` — `Omnibox` class (dispatcher, lifecycle, DOM ownership, keyboard nav).
- `src/browser/omnibox/dispatch.ts` — pure dispatcher function: input → mode + payload. Unit-testable without DOM.
- `src/browser/omnibox/modes/default.ts` — Default-mode handler (5 sections, parallel fan-out).
- `src/browser/omnibox/modes/commands.ts` — `>` palette renderer.
- `src/browser/omnibox/modes/engine.ts` — `@` engine prefix renderer.
- `src/browser/omnibox/modes/bang.ts` — `!` preview renderer (uses existing `parseBang`).
- `src/browser/omnibox/modes/ai.ts` — `?` AI mode + response panel.
- `src/browser/omnibox/ui.ts` — DOM helpers (row builders, section builders, escape).
- `src/browser/omnibox/types.ts` — shared types (`OmniboxRow`, `OmniboxSection`, etc.).
- `src/apis/commands.ts` — `CommandRegistry` class + built-in seed.
- `src/apis/ai.ts` — `AIClient` class (OpenAI-compatible streaming).

### Modified modules

- `src/apis/searchEngines.ts` — `SearchEngine` gains optional `at?: string` field. New `parseAtPrefix(input, registry)` function. `validateBangUnique` extended to also enforce `at` uniqueness in the at-namespace (independent from bang-namespace). Migration: existing engines load with `at: undefined`; user can fill it in via settings.
- `src/browser/protocols/index.ts` — add `listRoutes()` returning `Array<{ proto: string; path: string; url: string; proxy: boolean }>`. Read-only snapshot of the internal `routes` Map.
- `src/browser/tabs/index.ts` — add `searchOpen(query: string): TabSearchResult[]` returning `{ tabId, title, url, faviconUrl? }[]`. Pure filter over current tab state.
- `src/pages/settings/index.html` — add `@` column to the search-engines table; add AI panel card; add Commands panel card.
- `src/pages/settings/index.tsx` — extend search-engines wiring for `at` field; add AI panel wiring; add Commands panel wiring; add postMessage broadcast for `ai-config-updated`.
- `src/index.tsx` — extend boot block: instantiate `CommandRegistry`, `AIClient`; wire to globals; add message listeners for `ai-config-updated` and `commands-updated`. Replace the commented-out `Search` block with `Omnibox` instantiation in `initializeSystem`.
- `src/globals.d.ts` — add `commands: CommandRegistry` and `aiClient: AIClient` to `Window`.

### Removed modules

- `src/browser/search/` (entire directory, 6 files) — replaced by `src/browser/omnibox/`.
- `src/browser/search.ts` (legacy 944-line file) — already dead, removed in this iteration.

## Routing precedence

The dispatcher resolves modes by **first non-whitespace character** of the trimmed input:

| First char | Mode | Notes |
|---|---|---|
| `>` | Command palette | Strip `>`, fuzzy-match against `CommandRegistry`. |
| `@` | Engine prefix | Strip `@`, parse `^@([A-Za-z0-9._-]+)(?:\s+(.*))?$`. |
| `!` | Bang preview | Strip `!`, parse with existing `parseBang`. |
| `?` | AI prompt | Strip `?`, treat remainder as prompt. |
| (anything else) | Default | Mixed-section omnibox. |

Empty input → dropdown closed. Single prefix character with no remainder (e.g. just `>`) → mode-specific empty state (e.g. command palette shows all commands).

A second `!`, `>`, `@`, or `?` inside the query is treated literally. Modes never compose (no `>!yt` chain).

URL-prefixed inputs (`http://`, `https://`, `data:`, `javascript:`) skip mode dispatch entirely and route to default URL handling, matching how `parseBang` already behaves.

## Default-mode dropdown layout

When in default mode, the dropdown renders these elements in this order:

1. **Primary action row** (always present, default-highlighted):
   - If input parses as a URL → "Go to: `<url>`" with a globe icon.
   - Otherwise → "Search `<default engine name>` for: `<query>`" with the engine's favicon (or fallback search icon).
   - Pressing Enter without arrow-keying down fires this row.

2. **Open tabs** section (header + up to 3 rows). Each row: tab favicon, title, URL hostname. Click → switch to that tab via `tabs.activateTab(tabId)`.

3. **History** section (header + up to 4 rows). Each row: site favicon, page title, URL. Click → navigate active tab.

4. **Bookmarks** section (header + up to 4 rows). Each row: site favicon, bookmark title, URL. Click → navigate active tab.

5. **Internal pages** section (header + up to 4 rows). Each row: lucide icon for the page, "ddx://`<path>`" label. Click → `protocols.navigate(...)`.

6. **Search suggestions** section (header + up to 6 rows). Each row: search icon, suggestion text. Click → search via the default engine's template.

Each section is hidden entirely if empty. The "primary action row" never hides.

A "Show all → N" affordance appears at the bottom of any section that has more matches than its cap; clicking expands that section to show all matches (other sections collapse to make room within the 35vh ceiling, becoming scrollable).

## Mode behaviors

### `>` Command palette

- **`>` alone:** show all commands grouped by category, sorted alphabetically within each category.
- **`> <query>`:** fuzzy-match label + keywords, sorted by match score (best first). Categories are flattened in this state.
- **Row contents:** category icon · label (left) · shortcut hint (right, if any).
- **Selection:** Enter / click runs the command's `action()`. Most commands close the dropdown automatically; commands that opened a confirmation dialog or async flow may keep it closed but reopen on next focus.
- **Sources** (registered at boot, in this order):
  1. **Keybind actions** — every entry from `KEYBIND_CATEGORIES` in `keybinds.ts` becomes a command. The `action` field looks up the keybind action ID and dispatches through `KeyboardManager`'s existing handler (or via a direct `Functions` method call).
  2. **Protocol routes** — every registered route from `protocols.listRoutes()`. Wildcard `*` routes are excluded. Action navigates the active tab to `<proto>://<path>`.
  3. **Hardcoded built-ins** — `src/apis/commands.ts` exports a `BUILTIN_COMMANDS` array. Initial seed:
     - "Open Settings" → `protocols.navigate('ddx://settings')`
     - "Open Bookmarks" → `protocols.navigate('ddx://bookmarks')`
     - "Open Extensions" → `protocols.navigate('ddx://extensions')`
     - "Reload current tab" → `tabs.reloadActive()`
     - "Close current tab" → `tabs.closeActive()`
     - "New tab" → `tabs.createTab('ddx://newtab/')`
     - "New window" → `windowing.spawn()` (if available; otherwise omitted)
     - "Toggle DevTools" → `globals.toggleDevtools()` (if available)
     - "Clear browsing data" → `protocols.navigate('ddx://settings#privacy')`

### `@` Engine prefix

- **`@` alone or partial key (`@y`):** show all engines whose `at` field matches the typed prefix (case-insensitive). Each row: engine icon · "@`<at>` — `<name>`" · template snippet. Tab/Enter on a row inserts `@<at> ` into the input and waits for the query.
- **`@<key> <query>`:** parse `^@([A-Za-z0-9._-]+)\s+(.*)$`. If `<key>` matches a registered `at`, render single "Search `<engine name>` for: `<query>`" row. Enter → navigate.
- **Unknown key:** dispatcher recognizes the input doesn't resolve, falls through to **default-mode rendering** with the literal text as the query. No error.
- **Resolution helper:** `parseAtPrefix(input, registry)` in `searchEngines.ts`, sibling to `parseBang`. Same regex shape: `^\s*@([A-Za-z0-9._-]+)(?:\s+(.*))?$`. Same case-insensitivity. Same URL-prefix skip.

### `!` Bang preview

- Input dispatch unchanged from the shipped `parseBang` flow.
- New: dropdown shows a single preview row "Search `<engine name>` for: `<query>`" while the user types `!yt cats`. Enter executes (already worked); the preview just makes the binding visible.
- Unknown `!key` → fall-through to default mode (matches existing behavior).

### `?` AI prompt

- **`?` alone:** dropdown shows a single hint row: "Type your question after `?` and press Enter to ask the AI."
- **`?<prompt>` before Enter:**
  - Primary row: "Ask AI: `<prompt>`" with a sparkles icon. Default-highlighted.
  - Footer: "Press Enter to ask · `<provider name>`" (provider name read from `aiProviderUrl` setting, displayed as the URL's hostname).
- **After Enter:**
  - Dropdown switches to **response panel** layout.
  - Top: faded "you" bubble with the prompt.
  - Below: live "AI" bubble. Streamed content appended as deltas arrive.
  - While streaming: Esc aborts; a tiny "Stop" chip appears at the bottom-right of the bubble.
  - On stream complete: chips at the bottom — "Copy" (copies response text) and "New question" (clears panel, refocuses input).
- **Errors:**
  - Empty `aiProviderUrl` → "AI provider not configured. Open Settings to add one." with a clickable "Settings" chip that opens `ddx://settings#search-ai`.
  - HTTP 401/403 → "Provider rejected the API key. Check Settings."
  - HTTP non-2xx → "Couldn't reach AI provider (HTTP `<code>`). Retry?"
  - Network error / timeout → "Couldn't reach AI provider. Retry?"
  - Malformed SSE → keep partial response; append error row "Stream interrupted."
- **Abort scenarios:**
  - User presses Esc → stream aborted, panel stays visible with partial response.
  - User edits the address bar input → previous stream aborted, dropdown returns to prefix-driven render.
  - User clicks outside (blur) → 150ms delay; if not refocused, stream aborted, dropdown closes, panel discarded.

## Data flow

```
[Address bar input event]
  │
  ├── Omnibox.onInput(value, event)
  │     ├── 150ms debounce
  │     └── dispatch(value):
  │           switch first non-whitespace char:
  │             '>' → CommandPaletteMode.render(query)
  │             '@' → EnginePrefixMode.render(query)
  │             '!' → BangPreviewMode.render(query)
  │             '?' → AIMode.render(prompt)  // does NOT fetch yet
  │             else → DefaultMode.render(query)
  │
  │           DefaultMode.render(query) parallel fan-out:
  │             tabs.searchOpen(query)               → up to 3
  │             historyManager.searchEntries(query)  → up to 4
  │             bookmarkManager.searchBookmarks(q)   → up to 4
  │             protocols.listRoutes() filter(q)     → up to 4
  │             fetch(`api/results/${q}`, {signal})  → up to 6
  │           Each source gets its own AbortController.
  │           When a new query supersedes, all old controllers abort.
  │           Sections render as data arrives (independent re-renders).
  │
[Enter key]
  └── Omnibox.onSubmit()
        ├── If a dropdown row is highlighted → execute its handler
        ├── Else if mode has primary action → execute that
        │       Default mode: primary row (URL or default-engine search)
        │       '@' + valid → navigate to template
        │       '!' + valid → searchImpl (existing flow)
        │       '?' + prompt → AIMode.startStream()
        │       '>' alone → no-op (must select a command)
        └── Else → fallback to existing legacy Enter handler in src/index.tsx

[AIMode.startStream(prompt)]
  AIClient.stream(prompt, abortSignal):
    // Read aiProviderUrl, aiApiKey, aiModel, aiStreaming from settings
    POST `${aiProviderUrl}/chat/completions`
      Authorization: `Bearer ${aiApiKey}`
      Content-Type: application/json
      Body: {
        model: aiModel || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        stream: aiStreaming  // true → SSE; false → single JSON response
      }
    If streaming:
      Parse SSE: each `data: {json}` chunk → extract delta.choices[0].delta.content
      yield each non-empty delta
      Stop on `data: [DONE]` or signal.aborted
    Else:
      Parse single JSON response → yield response.choices[0].message.content (one chunk)
    On signal.abort: close response body, exit the iterator cleanly.

[Cross-frame sync]
  Settings popup mutates engine row → registry.update() → setItem → postMessage(opener, {type: 'searchEngines-updated'})
  Settings popup saves AI panel → setItem(aiProvider*) → postMessage(opener, {type: 'ai-config-updated'})
  Top-level main window listener:
    'searchEngines-updated' → window.searchEngines.load()
    'ai-config-updated' → window.aiClient.reloadConfig()
    'commands-updated' → window.commands.reload() (stub for v1; reserved for future custom-commands)
```

## Error handling

| Scenario | Behavior |
|---|---|
| Search-suggestions endpoint fails / 5xx / timeout | Section silently hidden. Other sections render. `Logger.createLog` warning. No user-visible error. |
| `historyManager.searchEntries` throws | Section hidden. Logger warning. |
| `bookmarkManager.searchBookmarks` throws | Section hidden. Logger warning. |
| `tabs.searchOpen` throws | Section hidden. Logger warning. |
| `protocols.listRoutes()` returns empty | Section hidden. (Should never happen at runtime since built-ins are always present.) |
| Unknown `@key` | Falls through to default-mode rendering. |
| Unknown `!bang` | Falls through to default-mode rendering. (Existing behavior.) |
| `>` command's `action()` throws | Caught at `CommandRegistry.execute(id)` level. Logger error. Optional toast "Command failed: `<label>`". Dropdown closes anyway. |
| `>` command's `action()` returns a rejected Promise | Same as above. Async error caught. |
| AI: `aiProviderUrl` empty | `?` mode shows "AI provider not configured" message + Settings chip. No fetch attempted. |
| AI: `aiApiKey` empty but URL present | Request still sent (some providers don't require auth, e.g., local Ollama). 401 from server is handled normally. |
| AI: HTTP 401/403 | Inline error: "Provider rejected the API key. Check Settings." Retry chip + Settings chip. |
| AI: HTTP 429 | Inline error: "Rate limited. Try again shortly." Retry chip. |
| AI: HTTP non-2xx | Inline error: "Couldn't reach AI provider (HTTP `<code>`)." Retry chip. |
| AI: network failure / DNS / TLS | Inline error: "Couldn't reach AI provider." Retry chip. |
| AI: stream aborted via Esc / new query | Stream cleanly closed. Partial response stays visible if user pressed Esc; discarded if user typed a new query. |
| AI: malformed SSE chunk | Partial response preserved up to that point. Append "Stream interrupted." row. Stop iterating. |
| AI: stream returns no content | Empty bubble + "AI returned no response." row. |
| Cross-frame `ai-config-updated` arrives mid-stream | Stream is NOT aborted. New config applies to the NEXT request. (Avoid surprising the user.) |
| Dropdown clicked while losing focus (blur race) | 150ms blur-delay so click event registers. Standard combobox pattern. |
| Settings popup closed while AI request in flight | Main-window AI request is independent of popup lifecycle; continues normally. |
| User opens settings popup, mutates registry, returns to main window before postMessage roundtrip | Brief stale-read window (~50ms). Acceptable — popups are modal-blocking on the main window in practice. |

## Settings UI changes

### Search engines panel — add `@` column

The existing `<section id="Search">` engines panel grows from 4 visible fields to 5: Name, Bang, **At**, URL, Default-radio.

- Both the inline add-form and the inline edit-row gain an "At (without @)" input.
- Validation in `validateEngineForm`:
  - Either `bang` or `at` must be non-empty (or both). Both empty → reject.
  - `at`: same regex as bang (`^[A-Za-z0-9._-]+$`), same length limit (≤16 chars).
  - `at` uniqueness: case-insensitive, scoped to the at-namespace independently from bang-namespace. Engine A's `at: 'yt'` doesn't conflict with engine B's `bang: 'yt'`.
- Validation in `SearchEngineRegistry.validateBangUnique`: split into `validateBangUnique` and `validateAtUnique` private methods, both case-insensitive, both excluding the row being edited.
- The add row's "At" input is optional (placeholder: "Optional"); the bang input has same UX (placeholder: "Optional"). Empty either is fine; empty both is a validation error.
- `BUILTIN_SEARCH_ENGINES` seed list updated to populate `at` for all 8 entries (typically the same value as `bang`):

| Name | Bang | At |
|---|---|---|
| DuckDuckGo | ddg | ddg |
| Google | g | google |
| Brave | br | brave |
| Bing | b | bing |
| Yahoo | y | yahoo |
| YouTube | yt | yt |
| Wikipedia | w | wiki |
| GitHub | gh | gh |

- `at` is included in the persisted engine record. Migration safe: when reading existing settings, missing `at` field is `undefined` and the engine works fine — user can fill it in later via settings.
- Note on existing installs: the `BUILTIN_SEARCH_ENGINES` table above only seeds the `at` field for **fresh profiles**. Profiles that already migrated under the prior protocols-search-registers branch will have engines persisted without `at`; those engines keep working (only the `bang` prefix resolves) until the user opens settings and fills in `at`. A future migration could backfill `at` from `bang` defaults, but that's deferred — too aggressive a default-write for an installed user base.

### New AI panel

Sits inside `<section id="Search">`, after the engines panel, as its own card:

- Header: "AI assistant"
- Subtitle: "Configure an OpenAI-compatible chat completions endpoint to use the `?` prefix in the address bar."
- Inputs:
  - Provider URL — `<input type="url">`, placeholder `https://api.openai.com/v1`. Stored as `aiProviderUrl`. The client appends `/chat/completions` itself.
  - API key — `<input type="password">` with show/hide eye toggle. Stored as `aiApiKey`. Empty allowed (some providers don't need it).
  - Model — `<input type="text">`, placeholder `gpt-3.5-turbo`. Stored as `aiModel`.
  - Streaming — toggle switch. On by default. Stored as `aiStreaming` (boolean).
- "Test connection" button: sends a one-token "ping" prompt and shows ✓ or inline error. Same network path as a real prompt; just lets the user verify config without using the address bar.
- Save: each input change persists immediately (no save button), and posts `ai-config-updated` to opener.

### New Commands panel (read-only in v1)

Sits inside `<section id="Keybinds">`, after the existing keybinds list, as its own card:

- Header: "Available commands"
- Subtitle: "Type `>` in the address bar to search and run any of these. Custom commands coming later."
- A search input at the top (placeholder "Filter commands…").
- Below: a flat list grouped by category. Each row: category icon · label · keybind hint · "From: `<source>`" tag.
- The list is built by reading from `searchEngineRegistry`'s sibling: a snapshot of `window.commands.list()` rendered once on `DOMContentLoaded`. No live updates needed (registry is fixed at boot in v1).

### Cross-frame sync

Three event types handled:
- `searchEngines-updated` — already shipped. Behavior unchanged. The `at` field roundtrips through this same event.
- `ai-config-updated` — new. Main window listener calls `window.aiClient.reloadConfig()`.
- `commands-updated` — wired but never fires in v1. Reserved for future custom commands UI.

Same trust model as existing sync events: `*` target origin, `event.data?.type` discrimination on receive, fire-and-forget.

## Boot sequence

`src/index.tsx` `DOMContentLoaded` callback gains four lines (after the existing `searchEngines` block) and replaces the dead `Search` block:

```ts
// Existing block:
const settingsAPI = new SettingsAPI();
const searchEngines = new SearchEngineRegistry(settingsAPI);
await searchEngines.load();
window.searchEngines = searchEngines;

// New additions immediately after:
const commands = new CommandRegistry();
window.commands = commands;
const aiClient = new AIClient(settingsAPI);
window.aiClient = aiClient;

// Existing message listener gets two more clauses:
window.addEventListener('message', (event) => {
  if (event.data?.type === 'searchEngines-updated') {
    void window.searchEngines.load();
  }
  if (event.data?.type === 'ai-config-updated') {
    void window.aiClient.reloadConfig();
  }
  if (event.data?.type === 'commands-updated') {
    void window.commands.reload();
  }
});
```

Inside `initializeSystem`, AFTER `tabs`/`functions`/`proto` are created (so the `CommandRegistry` can seed from them):

```ts
commands.seedFromKeybinds(functions.keyboardManager.keybindManager);
commands.seedFromProtocols(proto);
commands.seedBuiltins({ tabs, protocols: proto, windowing, globals: globalFunctions });

const omnibox = new Omnibox({
  input: items.addressBar!,
  proxy,
  protocols: proto,
  tabs,
  searchEngines,
  commands,
  aiClient,
  bookmarks: profilesAPI.bookmarkManager,
  history: historyManager, // wherever the singleton lives
});
omnibox.attach();
window.omnibox = omnibox;
```

The legacy commented-out `Search` block in `src/index.tsx:310-316` is removed entirely.

## CommandRegistry interface

```ts
interface Command {
  id: string;                       // stable, e.g. "tab.close" or "protocol.ddx-settings"
  label: string;                    // display name, e.g. "Close current tab"
  category: string;                 // e.g. "tabs", "navigation", "internal"
  source: 'keybind' | 'protocol' | 'builtin';
  icon?: string;                    // lucide icon name
  shortcut?: string;                // pre-formatted, e.g. "Ctrl+W"
  keywords?: string[];              // extra fuzzy-match terms
  action: () => void | Promise<void>;
}

class CommandRegistry {
  list(): Command[];                                            // immutable snapshot
  listByCategory(): Record<string, Command[]>;
  find(query: string, limit?: number): Command[];               // fuzzy match
  execute(id: string): Promise<void>;                           // catches errors, logs, optional toast
  register(command: Command): () => void;                       // returns unregister fn
  seedFromKeybinds(km: KeybindManager): void;
  seedFromProtocols(p: Protocols): void;
  seedBuiltins(deps: BuiltinDeps): void;
  reload(): Promise<void>;                                      // re-seeds (stub for v1, no persisted custom commands)
  onChange(handler: () => void): () => void;
}
```

Fuzzy matching uses a small built-in scorer (no new dependency). Score = sum of: substring-of-label hit, prefix-of-label hit, keyword hit, category match. Sort descending by score.

## AIClient interface

```ts
interface AIConfig {
  url: string;       // e.g. "https://api.openai.com/v1"
  apiKey: string;    // empty allowed
  model: string;     // e.g. "gpt-3.5-turbo"
  streaming: boolean;
}

class AIClient {
  constructor(settings: SettingsAPI);
  isConfigured(): boolean;                                      // url is non-empty
  getConfig(): AIConfig;                                        // last-loaded snapshot
  reloadConfig(): Promise<void>;                                // re-reads from settings
  stream(prompt: string, signal: AbortSignal): AsyncIterable<string>;
  test(): Promise<{ ok: true } | { ok: false; error: string }>; // for the Test button
}
```

`stream` is implemented as an `async function*`. SSE parsing is handled inline (no new dependency); the implementation reads the response body as a `ReadableStream`, decodes UTF-8 chunks, splits on `\n\n`, parses each `data: <json>` line, extracts `choices[0].delta.content`, and yields non-empty content. Stops on `data: [DONE]` or `signal.aborted`.

Non-streaming mode: single `await response.json()`, yield `choices[0].message.content` once.

Auth: `Authorization: Bearer ${apiKey}` header is only set if `apiKey` is non-empty. Some providers (local Ollama, etc.) reject the header if it's present and empty.

## Testing

### Unit tests (vitest)

New test files in `tests/`:

- `tests/parseAtPrefix.test.ts` — mirrors `parseBang` cases. ~13 cases:
  - Basic match (`@yt cats` → engine + query)
  - Empty query (`@yt`)
  - Case-insensitivity (`@YT`)
  - Unknown key → null
  - Mid-string `@` rejection (`hello @yt` → null)
  - URL prefix skip (4 prefixes)
  - Empty input → null
  - Leading whitespace allowed
  - Trailing whitespace preserved
  - Charset `[A-Za-z0-9._-]`
  - Empty input early exit
- `tests/searchEngines-at.test.ts` — extends existing tests:
  - Migration: existing engine with no `at` field loads cleanly
  - `add()` with both `bang` and `at` works
  - `add()` with neither rejects
  - `at` uniqueness enforced (case-insensitive)
  - `at` namespace independent from bang namespace
  - `update()` allows changing `at` to its current value
- `tests/commandRegistry.test.ts` — ~10 cases:
  - `register`/`list`/`unregister`
  - `find` exact match
  - `find` fuzzy ordering (substring vs. prefix vs. keyword)
  - `find` returns empty for no match
  - `find` respects `limit`
  - `execute` runs the action
  - `execute` catches sync throw → logs, returns
  - `execute` catches async rejection → logs, returns
  - `seedFromKeybinds` produces commands for every keybind
  - `seedFromProtocols` excludes wildcard routes
- `tests/aiClient.test.ts` — ~8 cases (mock `fetch` and `ReadableStream`):
  - Streaming happy path: 3 SSE chunks → 3 yielded strings
  - Non-stream mode: single JSON → single yield
  - Abort signal mid-stream → iterator exits cleanly, no error thrown
  - HTTP 401 → throws typed error
  - HTTP 429 → throws typed error
  - Network error → throws typed error
  - Malformed SSE (mid-stream) → partial yields preserved, then throws
  - Empty config (no URL) → `isConfigured()` returns false; `stream` throws "AI provider not configured"
- `tests/omniboxDispatch.test.ts` — pure-logic, ~12 cases:
  - Each prefix routes to its mode (`>`, `@`, `!`, `?`)
  - No prefix → default
  - Whitespace + prefix (`  >foo`) → command palette
  - Empty input → null mode (dropdown closed)
  - URL-prefixed input (4 schemes) → default mode regardless of `?` `>` `@` `!` mid-string
  - Single-char inputs (`>`, `@`, `!`, `?`) → respective mode with empty payload
- `tests/omniboxDefault-fanout.test.ts` — abort/race semantics, ~5 cases:
  - Two rapid `render(query)` calls → first abort signal fires before second's network resolves
  - Failed source (rejected promise) → other sections still render
  - All sources empty → primary action row still renders, no other sections shown
  - Source returning >cap items → row count == cap; "Show all → N" affordance present
  - Abort during stream → no late renders after `signal.aborted` flips

### Manual smoke checklist (~20 steps for the implementation plan)

1. Boot fresh profile; address bar dropdown closed.
2. Click address bar; nothing changes (empty input, dropdown stays closed).
3. Type "hello" → dropdown opens anchored under bar, primary row "Search DuckDuckGo for: hello", search-suggestions section populates within ~300ms.
4. Type until history/bookmark match → those sections appear.
5. ↓ moves through all rows across sections, ↑ moves back, Enter on a row activates that row.
6. Type "ddx" → "Internal pages" section shows ddx://newtab, ddx://home, ddx://settings, etc.
7. Esc closes dropdown, focus stays in input.
8. Type "https://example.com" → primary row says "Go to: https://example.com"; Enter navigates.
9. Type "!yt cats" → preview row "Search YouTube for: cats"; Enter navigates to YouTube.
10. Type "@yt cats" → same preview row; Enter navigates.
11. Type "@yt " (with space) → query is empty → row shows "Search YouTube for: " (no preview crash).
12. Type "@" alone → engine picker shows all engines with `at` set.
13. Type ">" alone → command palette shows all commands grouped.
14. Type "> close" → fuzzy matches narrow to close-related commands.
15. Enter on "Close current tab" → active tab closes, dropdown closes.
16. Type "?" alone → hint row "Type your question after `?`...".
17. Set up AI config in settings, type "? what is 2+2" → primary row, then Enter → response panel streams.
18. Esc mid-stream → stops cleanly, partial response stays.
19. Click outside → dropdown closes after ~150ms.
20. Open settings, change DuckDuckGo's `at` field to "duck" → save → return to main window, type "@duck cats" → works.
21. Open settings → AI panel → click "Test connection" with valid config → ✓ inline.
22. Open settings → Commands panel → renders all commands grouped, search input filters.
23. Reload main window → all settings persist, all modes still work.
24. Existing protocol behavior unaffected: `ddx://newtab`, `ddx://home`, custom newtab/home settings still work end-to-end.

## Build / type safety

- `tsconfig.build.json` continues to exclude `tests/` (no change).
- New `Window` members: `commands: CommandRegistry`, `aiClient: AIClient`, `omnibox: Omnibox`. Added to `globals.d.ts` alongside `searchEngines`.
- All new modules pass `npx tsc -p tsconfig.build.json --noEmit` cleanly; integrated into the same lint-free baseline as the prior protocols-search-registers branch.

## Plan structure (one big commit)

The implementation plan will phase the work for review checkpoints, but the entire branch lands as **one commit** at the end (squash). Phases:

1. **Phase A — Foundations** (no UI yet): `at` field + `parseAtPrefix` + tests; `Protocols.listRoutes()`; `Tabs.searchOpen()`; `CommandRegistry` + tests; `AIClient` + tests.
2. **Phase B — Omnibox skeleton**: delete `src/browser/search/`; create `src/browser/omnibox/` with `Omnibox` class, dispatcher, anchor positioning, focus/blur lifecycle. Renders empty stubs per mode. Wire into `src/index.tsx`.
3. **Phase C — Modes**: default mode, `>` palette, `@` engine, `!` preview, `?` AI (each as its own internal milestone).
4. **Phase D — Settings UI**: `@` column on engines panel; AI panel; Commands panel.
5. **Phase E — Wiring + sync + smoke**: cross-frame postMessages, globals, manual smoke checklist execution, final code review.

The plan document will track these phases as separate task groups but the squash commit at the end will combine all work into one logical changeset. Test suite green and `tsc` clean at the end of every phase regardless.

## Open questions for the planner

- The `?` AI mode references "open `ddx://settings#search-ai`" for the Settings link. The settings page is currently a single popup with section anchors (`#Search`, `#Keybinds`, etc.) but doesn't deep-link to specific cards within a section. Either (a) accept that the link just opens `#Search` and the user scrolls to the AI card, or (b) add fragment handling for sub-section anchors. Recommendation: (a) for v1.
- The keybind-to-command mapping requires `KeybindManager` to expose the keybind action ID -> handler resolver. Today the resolver lives inside `keyboardManager.handleKeyDown`. Either (a) `seedFromKeybinds` re-implements the dispatch by importing the same action map, or (b) `KeyboardManager` exposes a `dispatchAction(actionId: string)` method we can call. Recommendation: (b) — small refactor, cleaner boundary.
- The `historyManager` global: I haven't verified where the singleton instance is constructed. Implementation plan must locate it (or construct a new one) and pass it to `Omnibox`. Defer to plan.
- The "Test connection" button in the AI panel makes an actual HTTP request from the settings popup. The popup runs in a separate window; CORS / cookie / SW interception behavior may differ. Plan to verify during smoke testing; if blocked by SW, route the test through the main-window via postMessage instead.
