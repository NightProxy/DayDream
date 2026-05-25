# Omnibox Rework + Command Palette + Engine Prefix + AI Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the disabled floating search overlay with an anchored, multi-mode address-bar dropdown supporting live suggestions (open tabs, history, bookmarks, internal pages, search), a `>` command palette, an `@engine` prefix system, and a `?` AI prompt mode against an OpenAI-compatible endpoint.

**Architecture:** New module `src/browser/omnibox/` owns dropdown DOM and dispatches on first non-whitespace char. New `CommandRegistry` (`src/apis/commands.ts`) seeds from keybinds + protocols + built-ins. New `AIClient` (`src/apis/ai.ts`) speaks OpenAI chat-completions with SSE streaming. Existing `SearchEngineRegistry` gains an `at?: string` field. Settings UI grows an `@` column, an AI panel, and a Commands panel.

**Tech Stack:** TypeScript, vite, vitest (already wired), NightFS-backed `SettingsAPI`, existing `KeybindManager` / `HistoryManager` / `BookmarkManager` / `Tabs` / `Protocols` modules.

**Source spec:** `docs/superpowers/specs/2026-05-25-omnibox-rework-design.md`

**Commit strategy:** Per user instruction, the entire branch lands as **one squash commit** at the end. Phases below produce green-test, green-tsc checkpoints suitable for code review between groups; individual task-level commits are optional internal markers that will be squashed away.

---

## Recon-derived facts (locked at plan-write time)

- `BookmarkManager.searchBookmarks(q)` returns `BookmarkItem[]` which includes folders. Caller must filter with `isBookmark(item)` from `src/apis/bookmarks.ts` to get only entries with a `url`. The data manager is at `window.tabs.bookmarkManager`.
- `HistoryManager` is a singleton via `HistoryManager.getInstance()`. Also reachable as `window.tabs.getHistoryManager()`.
- `Tabs` has NO `searchOpen` method. Open tabs are `tabs.tabs` (a `TabData[]`). Method names: `selectTab(id)`, `closeCurrentTab()`, `closeTabById(id)`, `refreshTab(tabId)`, `hardReloadTab(tabId)`, `createTab(url)`, `switchToNextTab()`, `switchToPreviousTab()`. Plan adds `searchOpen` (Task A3).
- `KeybindManager.getAllKeybinds()` returns `Record<string, KeybindConfig>` keyed by id (e.g. `"reloadAlt"`). Two ids can share an action.
- No central action-ID dispatcher exists. `KeyboardManager.handleKeyDown` has a switch at lines 57-142. `CommandRegistry.seedFromKeybinds` mirrors that table.
- `Functions.keyboardManager` is private. Plan does NOT touch it. `seedFromKeybinds(keybinds, km)` takes the data directly.
- `BUILTIN_PROTOCOL_ROUTES` includes a wildcard `*` route. `seedFromProtocols` skips wildcards.
- Address-bar input parent: `<div class="relative w-full flex-1 urlbar-ring">` at `src/components/Render.tsx:352`. Omnibox dropdown anchors via `position: absolute` inside this parent.
- Existing Enter handler at `src/index.tsx:252-308` stays as a fallback; Omnibox installs its own keydown listener that pre-empts when a row is highlighted or in non-default mode.
- `searchEngines` instantiated at `src/index.tsx:88-91`. Boot order for Omnibox deps: `searchEngines` pre-`initializeSystem`; `tabs`/`proto`/`items`/`functions` available after line 229 inside `initializeSystem`.
- `SearchEngineRegistryReader` is currently NOT exported. Plan exports it (Task A1).
- `tsconfig.build.json` excludes `tests/`. Stays.
- `tests/helpers/fakeSettings.ts` is reused for new tests.

---

## File structure

### New files

| File | Responsibility |
|------|---------------|
| `src/apis/commands.ts` | `CommandRegistry`, `Command` interface, `BUILTIN_COMMANDS` factory, fuzzy matcher. |
| `src/apis/ai.ts` | `AIClient`, `AIConfig`, SSE parser, OpenAI request builder. |
| `src/browser/omnibox/index.ts` | `Omnibox` class — DOM ownership, dispatcher, lifecycle, keyboard nav. |
| `src/browser/omnibox/dispatch.ts` | Pure `dispatch(input)` function. |
| `src/browser/omnibox/types.ts` | Shared types: `OmniboxMode`, `OmniboxRow`, `OmniboxSection`. |
| `src/browser/omnibox/ui.ts` | DOM helpers: `escapeHtml`, row/section builders, highlight management. |
| `src/browser/omnibox/modes/default.ts` | Default mode: 5-section parallel fan-out. |
| `src/browser/omnibox/modes/commands.ts` | `>` palette renderer. |
| `src/browser/omnibox/modes/engine.ts` | `@` engine: preview or picker. |
| `src/browser/omnibox/modes/bang.ts` | `!` preview row. |
| `src/browser/omnibox/modes/ai.ts` | `?` mode: hint, primary row, response panel, streaming. |
| `tests/parseAtPrefix.test.ts` | 13 cases. |
| `tests/searchEngines-at.test.ts` | At-field extension cases. |
| `tests/commandRegistry.test.ts` | 10 cases. |
| `tests/aiClient.test.ts` | 8 cases with mocked fetch + ReadableStream. |
| `tests/omniboxDispatch.test.ts` | 12 cases for the pure dispatcher. |
| `tests/omniboxDefault-fanout.test.ts` | 5 cases for abort/race semantics. |

### Modified files

| File | Change |
|------|--------|
| `src/apis/searchEngines.ts` | Add `at?: string` to `SearchEngine`. Export `SearchEngineRegistryReader`. Add `parseAtPrefix`. Split `validateBangUnique` into bang+at variants. Update `add`/`update` for `at` validation + both-empty rejection. Update `BUILTIN_SEARCH_ENGINES` with `at` values. |
| `src/browser/protocols/index.ts` | Add `listRoutes(): ProtocolRouteSnapshot[]`. |
| `src/browser/tabs/index.ts` | Add `searchOpen(query: string): TabSearchResult[]`. |
| `src/pages/settings/index.html` | Add "At" input to add-form. Add AI panel card. Add Commands panel card. |
| `src/pages/settings/index.tsx` | Extend `validateEngineForm` for `at`. Update render/edit row HTML. Add AI panel wiring. Add Commands panel wiring. Add `broadcastAIConfigUpdate`. |
| `src/index.tsx` | Instantiate `CommandRegistry`, `AIClient`. Add globals. Add message listeners. Seed `CommandRegistry` and instantiate `Omnibox` inside `initializeSystem`. Replace commented-out `Search` block. |
| `src/globals.d.ts` | Add `commands`, `aiClient`, `omnibox` to `Window` with type imports. |

### Removed files

- `src/browser/search/index.ts`
- `src/browser/search/navigation.ts`
- `src/browser/search/suggestions.ts`
- `src/browser/search/types.ts`
- `src/browser/search/ui.ts`
- `src/browser/search/utils.ts`
- `src/browser/search.ts`

---

## Phase A — Foundations (pure additions, no UI)

### Task A1: `SearchEngine.at` field + export `SearchEngineRegistryReader`

**Files:**
- Modify: `src/apis/searchEngines.ts`

- [ ] **Step A1.1: Add `at?` field to `SearchEngine` interface**

In `src/apis/searchEngines.ts` lines 5-11, change:

```ts
export interface SearchEngine {
	id: string;
	name: string;
	bang: string;
	urlTemplate: string;
	builtIn: boolean;
}
```

to:

```ts
export interface SearchEngine {
	id: string;
	name: string;
	bang: string;
	at?: string;
	urlTemplate: string;
	builtIn: boolean;
}
```

- [ ] **Step A1.2: Export `SearchEngineRegistryReader` and extend it with `findByAt`**

Find lines 13-15:

```ts
interface SearchEngineRegistryReader {
	findByBang(bang: string): SearchEngine | undefined;
}
```

Replace with:

```ts
export interface SearchEngineRegistryReader {
	findByBang(bang: string): SearchEngine | undefined;
	findByAt(at: string): SearchEngine | undefined;
}
```

- [ ] **Step A1.3: Update `BUILTIN_SEARCH_ENGINES` to include `at` values**

Replace the `BUILTIN_SEARCH_ENGINES` array (lines 18-27) with:

```ts
export const BUILTIN_SEARCH_ENGINES: Omit<SearchEngine, 'id'>[] = [
	{ name: 'DuckDuckGo', bang: 'ddg', at: 'ddg', urlTemplate: 'https://duckduckgo.com/?q=%s', builtIn: true },
	{ name: 'Google', bang: 'g', at: 'google', urlTemplate: 'https://www.google.com/search?q=%s', builtIn: true },
	{ name: 'Brave', bang: 'br', at: 'brave', urlTemplate: 'https://search.brave.com/search?q=%s', builtIn: true },
	{ name: 'Bing', bang: 'b', at: 'bing', urlTemplate: 'https://www.bing.com/search?q=%s', builtIn: true },
	{ name: 'Yahoo', bang: 'y', at: 'yahoo', urlTemplate: 'https://search.yahoo.com/search?p=%s', builtIn: true },
	{ name: 'YouTube', bang: 'yt', at: 'yt', urlTemplate: 'https://www.youtube.com/results?search_query=%s', builtIn: true },
	{ name: 'Wikipedia', bang: 'w', at: 'wiki', urlTemplate: 'https://en.wikipedia.org/w/index.php?search=%s', builtIn: true },
	{ name: 'GitHub', bang: 'gh', at: 'gh', urlTemplate: 'https://github.com/search?q=%s', builtIn: true },
];
```

- [ ] **Step A1.4: Add `AT_REGEX` constant**

Below `BANG_REGEX` (line 30), add:

```ts
const AT_REGEX = /^\s*@([A-Za-z0-9._-]+)(?:\s+(.*))?$/;
```

- [ ] **Step A1.5: Add `findByAt` method to `SearchEngineRegistry`**

In `src/apis/searchEngines.ts`, after the existing `findByBang` method (line 188), add:

```ts
findByAt(at: string): SearchEngine | undefined {
	const target = at.toLowerCase();
	const hit = this.engines.find((e) => e.at?.toLowerCase() === target);
	return hit ? { ...hit } : undefined;
}
```

- [ ] **Step A1.6: Split validation into `validateBangUnique` + `validateAtUnique`**

Find `validateBangUnique` (lines 252-260) and replace with:

```ts
private validateBangUnique(bang: string, excludeId: string | null): void {
	const target = bang.toLowerCase();
	const clash = this.engines.find(
		(e) => e.bang.toLowerCase() === target && e.id !== excludeId,
	);
	if (clash) {
		throw new Error(`A search engine with bang "!${bang}" already exists (duplicate).`);
	}
}

private validateAtUnique(at: string, excludeId: string | null): void {
	const target = at.toLowerCase();
	const clash = this.engines.find(
		(e) => e.at?.toLowerCase() === target && e.id !== excludeId,
	);
	if (clash) {
		throw new Error(`A search engine with at "@${at}" already exists (duplicate).`);
	}
}

private validateAtLeastOnePrefix(bang: string | undefined, at: string | undefined): void {
	const hasBang = !!(bang && bang.trim());
	const hasAt = !!(at && at.trim());
	if (!hasBang && !hasAt) {
		throw new Error('At least one of "bang" or "at" must be set.');
	}
}
```

- [ ] **Step A1.7: Update `add` to use new validation**

Find `add` (lines 194-202) and replace with:

```ts
async add(engine: Omit<SearchEngine, 'id' | 'builtIn'>): Promise<SearchEngine> {
	this.validateTemplate(engine.urlTemplate);
	this.validateAtLeastOnePrefix(engine.bang, engine.at);
	if (engine.bang) this.validateBangUnique(engine.bang, null);
	if (engine.at) this.validateAtUnique(engine.at, null);
	const created: SearchEngine = { ...engine, id: uuidv4(), builtIn: false };
	this.engines.push(created);
	await this.persist();
	this.notify();
	return { ...created };
}
```

- [ ] **Step A1.8: Update `update` to use new validation**

Find `update` (lines 204-212) and replace with:

```ts
async update(id: string, patch: Partial<Omit<SearchEngine, 'id' | 'builtIn'>>): Promise<void> {
	const idx = this.engines.findIndex((e) => e.id === id);
	if (idx === -1) throw new Error(`Unknown engine id: ${id}`);
	if (patch.urlTemplate !== undefined) this.validateTemplate(patch.urlTemplate);
	const merged = { ...this.engines[idx], ...patch };
	this.validateAtLeastOnePrefix(merged.bang, merged.at);
	if (patch.bang !== undefined && patch.bang) this.validateBangUnique(patch.bang, id);
	if (patch.at !== undefined && patch.at) this.validateAtUnique(patch.at, id);
	this.engines[idx] = merged;
	await this.persist();
	this.notify();
}
```

- [ ] **Step A1.9: Update `isValidEngineList` to allow optional `at`**

Find `isValidEngineList` (lines 117-130). The current implementation validates `id/name/bang/urlTemplate/builtIn`. The `at` field is optional, so the predicate only needs to accept records that may or may not have it (no schema change needed for existing engines). Replace the body with:

```ts
private isValidEngineList(value: unknown): value is SearchEngine[] {
	if (!Array.isArray(value)) return false;
	return value.every((e) => {
		if (!e || typeof e !== 'object') return false;
		const o = e as Record<string, unknown>;
		return (
			typeof o.id === 'string' &&
			typeof o.name === 'string' &&
			typeof o.bang === 'string' &&
			typeof o.urlTemplate === 'string' &&
			typeof o.builtIn === 'boolean' &&
			(o.at === undefined || typeof o.at === 'string')
		);
	});
}
```

- [ ] **Step A1.10: Run existing tests — confirm green**

Run: `npm test -- searchEngines.test.ts`
Expected: all 29 existing tests pass. (Migration-safety claim verified — existing tests don't reference `at` so they still pass with the field optional.)

- [ ] **Step A1.11: Typecheck**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: zero errors.

---

### Task A2: `parseAtPrefix` function + tests

**Files:**
- Modify: `src/apis/searchEngines.ts`
- Create: `tests/parseAtPrefix.test.ts`

- [ ] **Step A2.1: Write failing tests**

Create `tests/parseAtPrefix.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseAtPrefix, type SearchEngine, type SearchEngineRegistryReader } from '@apis/searchEngines';

function makeRegistryMock(engines: Pick<SearchEngine, 'bang' | 'at' | 'urlTemplate' | 'name'>[]): SearchEngineRegistryReader {
	const list = engines.map((e, i) => ({
		id: `id-${i}`,
		name: e.name,
		bang: e.bang,
		at: e.at,
		urlTemplate: e.urlTemplate,
		builtIn: true,
	})) as SearchEngine[];
	return {
		findByBang: (bang: string) =>
			list.find((e) => e.bang.toLowerCase() === bang.toLowerCase()),
		findByAt: (at: string) =>
			list.find((e) => e.at?.toLowerCase() === at.toLowerCase()),
	};
}

describe('parseAtPrefix', () => {
	const yt = { name: 'YouTube', bang: 'yt', at: 'yt', urlTemplate: 'https://www.youtube.com/results?search_query=%s' };

	it('matches "@yt cats" -> YouTube + "cats"', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('@yt cats', r)).toEqual({
			engine: expect.objectContaining({ at: 'yt' }),
			query: 'cats',
		});
	});

	it('matches "@yt" alone -> YouTube + empty query', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('@yt', r)).toEqual({
			engine: expect.objectContaining({ at: 'yt' }),
			query: '',
		});
	});

	it('is case-insensitive for the at key', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('@YT cats', r)?.engine.at).toBe('yt');
	});

	it('returns null for unknown at key', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('@UNKNOWN cats', r)).toBeNull();
	});

	it('returns null when @ is not at the start', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('cats @yt', r)).toBeNull();
	});

	it('treats a second `@` inside the query literally', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('@yt @hd cats', r)?.query).toBe('@hd cats');
	});

	it('returns null when input starts with http://', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('http://example.com/@yt', r)).toBeNull();
	});

	it('returns null when input starts with https://', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('https://example.com/@yt', r)).toBeNull();
	});

	it('returns null when input starts with data:', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('data:text/plain,@yt', r)).toBeNull();
	});

	it('returns null when input starts with javascript:', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('javascript:@yt', r)).toBeNull();
	});

	it('returns null for empty input', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('', r)).toBeNull();
	});

	it('allows leading whitespace before the @', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('  @yt cats', r)?.query).toBe('cats');
	});

	it('preserves trailing whitespace in the captured query (no trim)', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('@yt  cats  ', r)?.query).toBe('cats  ');
	});
});
```

- [ ] **Step A2.2: Run tests — verify failure**

Run: `npm test -- parseAtPrefix.test.ts`
Expected: FAIL — `parseAtPrefix` not exported from `@apis/searchEngines`.

- [ ] **Step A2.3: Implement `parseAtPrefix`**

In `src/apis/searchEngines.ts`, immediately AFTER the `parseBang` function (around line 50), add:

```ts
export function parseAtPrefix(
	input: string,
	registry: SearchEngineRegistryReader,
): { engine: SearchEngine; query: string } | null {
	if (!input) return null;
	for (const prefix of URL_PREFIXES_TO_SKIP) {
		if (input.startsWith(prefix)) return null;
	}
	const match = input.match(AT_REGEX);
	if (!match) return null;
	const engine = registry.findByAt(match[1]);
	if (!engine) return null;
	return { engine, query: match[2] ?? '' };
}
```

- [ ] **Step A2.4: Run tests — verify pass**

Run: `npm test -- parseAtPrefix.test.ts`
Expected: 13/13 pass.

- [ ] **Step A2.5: Run full test suite — confirm no regressions**

Run: `npm test`
Expected: all previously-green tests still pass; new parseAtPrefix suite passes.

---

### Task A3: `Tabs.searchOpen` method

**Files:**
- Modify: `src/browser/tabs/index.ts`

- [ ] **Step A3.1: Define `TabSearchResult` type and add method**

In `src/browser/tabs/index.ts`, find the `TabsInterface` declaration (search for `getTabsInOrder = () => this.tabs;` near line 190). Add this method to the `Tabs` class as a sibling of `getTabsInOrder`:

```ts
searchOpen(query: string): Array<{ tabId: string; title: string; url: string; favicon: string | null }> {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	return this.tabs
		.filter((t) => {
			const title = (t.title || '').toLowerCase();
			const url = (t.url || '').toLowerCase();
			return title.includes(q) || url.includes(q);
		})
		.map((t) => ({
			tabId: t.id,
			title: t.title || '(untitled)',
			url: t.url || '',
			favicon: t.favicon,
		}));
}
```

- [ ] **Step A3.2: Typecheck**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: zero errors.

- [ ] **Step A3.3: Run tests — confirm no regression**

Run: `npm test`
Expected: all tests still pass. (No new tests for `searchOpen` — covered by manual smoke; it's a 9-line pure filter and the TDD overhead exceeds the benefit for this scope.)

---

### Task A4: `Protocols.listRoutes` method

**Files:**
- Modify: `src/browser/protocols/index.ts`

- [ ] **Step A4.1: Add `ProtocolRouteSnapshot` type and `listRoutes` method**

In `src/browser/protocols/index.ts`, add the following BEFORE the `class Protocols` declaration (around line 28):

```ts
export interface ProtocolRouteSnapshot {
	proto: string;
	path: string;
	url: string;
	proxy: boolean;
}
```

Then add this method to the `Protocols` class, after `isRegisteredProtocol` (near line 311):

```ts
listRoutes(): ProtocolRouteSnapshot[] {
	const out: ProtocolRouteSnapshot[] = [];
	for (const [proto, pathMap] of this.routes.entries()) {
		for (const [path, entry] of pathMap.entries()) {
			out.push({ proto, path, url: entry.url, proxy: entry.proxy });
		}
	}
	return out;
}
```

- [ ] **Step A4.2: Typecheck**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: zero errors.

- [ ] **Step A4.3: Run tests**

Run: `npm test`
Expected: all green.

---

### Task A5: `CommandRegistry` + tests

**Files:**
- Create: `src/apis/commands.ts`
- Create: `tests/commandRegistry.test.ts`

- [ ] **Step A5.1: Write failing tests**

Create `tests/commandRegistry.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandRegistry, type Command } from '@apis/commands';

function makeCmd(partial: Partial<Command> & { id: string; label: string }): Command {
	return {
		category: 'misc',
		source: 'builtin',
		action: () => {},
		...partial,
	};
}

describe('CommandRegistry', () => {
	let reg: CommandRegistry;
	beforeEach(() => {
		reg = new CommandRegistry();
	});

	it('register adds a command and list returns it', () => {
		reg.register(makeCmd({ id: 'a', label: 'Alpha' }));
		expect(reg.list()).toHaveLength(1);
		expect(reg.list()[0].id).toBe('a');
	});

	it('register returns an unregister function', () => {
		const off = reg.register(makeCmd({ id: 'a', label: 'Alpha' }));
		off();
		expect(reg.list()).toHaveLength(0);
	});

	it('find returns matches with substring scoring', () => {
		reg.register(makeCmd({ id: 'a', label: 'Close current tab' }));
		reg.register(makeCmd({ id: 'b', label: 'Open new tab' }));
		const results = reg.find('tab');
		expect(results).toHaveLength(2);
	});

	it('find ranks prefix matches above mid-substring matches', () => {
		reg.register(makeCmd({ id: 'a', label: 'Close current tab' }));
		reg.register(makeCmd({ id: 'b', label: 'Tab management' }));
		const results = reg.find('tab');
		expect(results[0].id).toBe('b');
	});

	it('find matches keywords too', () => {
		reg.register(makeCmd({ id: 'a', label: 'Open Settings', keywords: ['preferences', 'config'] }));
		const results = reg.find('preferences');
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe('a');
	});

	it('find returns empty array for no matches', () => {
		reg.register(makeCmd({ id: 'a', label: 'Alpha' }));
		expect(reg.find('xyzzy')).toEqual([]);
	});

	it('find respects limit', () => {
		for (let i = 0; i < 10; i++) reg.register(makeCmd({ id: `c${i}`, label: `Item ${i}` }));
		expect(reg.find('item', 3)).toHaveLength(3);
	});

	it('execute runs the action', async () => {
		const fn = vi.fn();
		reg.register(makeCmd({ id: 'a', label: 'Alpha', action: fn }));
		await reg.execute('a');
		expect(fn).toHaveBeenCalledOnce();
	});

	it('execute catches synchronous throws', async () => {
		reg.register(makeCmd({ id: 'a', label: 'Alpha', action: () => { throw new Error('boom'); } }));
		await expect(reg.execute('a')).resolves.toBeUndefined();
	});

	it('execute catches async rejections', async () => {
		reg.register(makeCmd({ id: 'a', label: 'Alpha', action: async () => { throw new Error('boom'); } }));
		await expect(reg.execute('a')).resolves.toBeUndefined();
	});

	it('listByCategory groups commands by category', () => {
		reg.register(makeCmd({ id: 'a', label: 'A', category: 'tabs' }));
		reg.register(makeCmd({ id: 'b', label: 'B', category: 'navigation' }));
		reg.register(makeCmd({ id: 'c', label: 'C', category: 'tabs' }));
		const grouped = reg.listByCategory();
		expect(grouped.tabs).toHaveLength(2);
		expect(grouped.navigation).toHaveLength(1);
	});
});
```

- [ ] **Step A5.2: Run tests — verify failure**

Run: `npm test -- commandRegistry.test.ts`
Expected: FAIL — `@apis/commands` not resolvable.

- [ ] **Step A5.3: Create `src/apis/commands.ts`**

```ts
import { Logger } from '@apis/logging';

export type CommandSource = 'keybind' | 'protocol' | 'builtin';

export interface Command {
	id: string;
	label: string;
	category: string;
	source: CommandSource;
	icon?: string;
	shortcut?: string;
	keywords?: string[];
	action: () => void | Promise<void>;
}

export class CommandRegistry {
	private commands = new Map<string, Command>();
	private logger: Logger | null = null;
	private listeners = new Set<() => void>();

	private getLogger(): Logger {
		if (!this.logger) this.logger = new Logger();
		return this.logger;
	}

	register(command: Command): () => void {
		this.commands.set(command.id, command);
		this.notify();
		return () => {
			this.commands.delete(command.id);
			this.notify();
		};
	}

	list(): Command[] {
		return Array.from(this.commands.values());
	}

	listByCategory(): Record<string, Command[]> {
		const out: Record<string, Command[]> = {};
		for (const cmd of this.commands.values()) {
			if (!out[cmd.category]) out[cmd.category] = [];
			out[cmd.category].push(cmd);
		}
		return out;
	}

	find(query: string, limit = 50): Command[] {
		const q = query.trim().toLowerCase();
		if (!q) return this.list().slice(0, limit);
		const scored: Array<{ cmd: Command; score: number }> = [];
		for (const cmd of this.commands.values()) {
			const score = this.scoreMatch(cmd, q);
			if (score > 0) scored.push({ cmd, score });
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, limit).map((s) => s.cmd);
	}

	private scoreMatch(cmd: Command, q: string): number {
		const label = cmd.label.toLowerCase();
		let score = 0;
		if (label === q) score += 200;
		else if (label.startsWith(q)) score += 100;
		else if (label.includes(q)) score += 40;
		if (cmd.keywords) {
			for (const kw of cmd.keywords) {
				const lk = kw.toLowerCase();
				if (lk === q) score += 60;
				else if (lk.startsWith(q)) score += 30;
				else if (lk.includes(q)) score += 15;
			}
		}
		if (cmd.category.toLowerCase().includes(q)) score += 5;
		return score;
	}

	async execute(id: string): Promise<void> {
		const cmd = this.commands.get(id);
		if (!cmd) {
			try {
				this.getLogger().createLog(`[commands] unknown id "${id}"`);
			} catch {}
			return;
		}
		try {
			await cmd.action();
		} catch (err) {
			console.warn(`[commands] action "${id}" failed:`, err);
			try {
				this.getLogger().createLog(`[commands] action "${id}" failed: ${err}`);
			} catch {}
		}
	}

	onChange(handler: () => void): () => void {
		this.listeners.add(handler);
		return () => { this.listeners.delete(handler); };
	}

	clear(): void {
		this.commands.clear();
		this.notify();
	}

	private notify(): void {
		for (const fn of this.listeners) {
			try { fn(); } catch (err) { console.warn('[commands] onChange handler threw:', err); }
		}
	}
}
```

- [ ] **Step A5.4: Run tests — verify pass**

Run: `npm test -- commandRegistry.test.ts`
Expected: 11/11 pass.

- [ ] **Step A5.5: Typecheck**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: zero errors.

---

### Task A6: `AIClient` + tests

**Files:**
- Create: `src/apis/ai.ts`
- Create: `tests/aiClient.test.ts`

- [ ] **Step A6.1: Write failing tests**

Create `tests/aiClient.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIClient } from '@apis/ai';
import { FakeSettings } from './helpers/fakeSettings';
import type { SettingsAPI } from '@apis/settings';

function makeSSEResponse(chunks: string[]): Response {
	const enc = new TextEncoder();
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(enc.encode(chunk));
			controller.close();
		},
	});
	return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function deltaChunk(content: string): string {
	return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
	const out: string[] = [];
	for await (const x of iter) out.push(x);
	return out;
}

function newClient(seed?: Partial<{ aiProviderUrl: string; aiApiKey: string; aiModel: string; aiStreaming: boolean }>): AIClient {
	const s = new FakeSettings();
	if (seed?.aiProviderUrl !== undefined) s._set('aiProviderUrl', seed.aiProviderUrl);
	if (seed?.aiApiKey !== undefined) s._set('aiApiKey', seed.aiApiKey);
	if (seed?.aiModel !== undefined) s._set('aiModel', seed.aiModel);
	if (seed?.aiStreaming !== undefined) s._set('aiStreaming', seed.aiStreaming);
	return new AIClient(s as unknown as SettingsAPI);
}

describe('AIClient', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('isConfigured returns false when URL is empty', async () => {
		const c = newClient();
		await c.reloadConfig();
		expect(c.isConfigured()).toBe(false);
	});

	it('isConfigured returns true when URL is set', async () => {
		const c = newClient({ aiProviderUrl: 'https://api.openai.com/v1' });
		await c.reloadConfig();
		expect(c.isConfigured()).toBe(true);
	});

	it('stream throws clearly when unconfigured', async () => {
		const c = newClient();
		await c.reloadConfig();
		const ctrl = new AbortController();
		await expect(async () => {
			for await (const _ of c.stream('hi', ctrl.signal)) {}
		}).rejects.toThrow(/not configured/i);
	});

	it('streaming happy path: 3 SSE deltas yield 3 strings', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSSEResponse([
			deltaChunk('hel'),
			deltaChunk('lo '),
			deltaChunk('world'),
			'data: [DONE]\n\n',
		])));
		const c = newClient({ aiProviderUrl: 'https://api.openai.com/v1', aiStreaming: true });
		await c.reloadConfig();
		const ctrl = new AbortController();
		const out = await collect(c.stream('test', ctrl.signal));
		expect(out).toEqual(['hel', 'lo ', 'world']);
	});

	it('non-stream mode yields a single chunk', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
			JSON.stringify({ choices: [{ message: { content: 'full response' } }] }),
			{ status: 200, headers: { 'Content-Type': 'application/json' } },
		)));
		const c = newClient({ aiProviderUrl: 'https://api.openai.com/v1', aiStreaming: false });
		await c.reloadConfig();
		const ctrl = new AbortController();
		const out = await collect(c.stream('test', ctrl.signal));
		expect(out).toEqual(['full response']);
	});

	it('throws typed error on HTTP 401', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })));
		const c = newClient({ aiProviderUrl: 'https://api.openai.com/v1' });
		await c.reloadConfig();
		const ctrl = new AbortController();
		await expect(async () => {
			for await (const _ of c.stream('test', ctrl.signal)) {}
		}).rejects.toThrow(/401|key|auth/i);
	});

	it('throws typed error on HTTP 429', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Too Many', { status: 429 })));
		const c = newClient({ aiProviderUrl: 'https://api.openai.com/v1' });
		await c.reloadConfig();
		const ctrl = new AbortController();
		await expect(async () => {
			for await (const _ of c.stream('test', ctrl.signal)) {}
		}).rejects.toThrow(/429|rate/i);
	});

	it('throws typed error on network failure', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
		const c = newClient({ aiProviderUrl: 'https://api.openai.com/v1' });
		await c.reloadConfig();
		const ctrl = new AbortController();
		await expect(async () => {
			for await (const _ of c.stream('test', ctrl.signal)) {}
		}).rejects.toThrow();
	});

	it('abort signal exits the iterator cleanly mid-stream', async () => {
		const enc = new TextEncoder();
		let cancelled = false;
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(enc.encode(deltaChunk('first')));
				setTimeout(() => {
					if (!cancelled) {
						controller.enqueue(enc.encode(deltaChunk('second')));
						controller.close();
					}
				}, 100);
			},
			cancel() { cancelled = true; },
		});
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
		const c = newClient({ aiProviderUrl: 'https://api.openai.com/v1' });
		await c.reloadConfig();
		const ctrl = new AbortController();
		const iter = c.stream('test', ctrl.signal);
		const collected: string[] = [];
		for await (const chunk of iter) {
			collected.push(chunk);
			if (collected.length === 1) ctrl.abort();
		}
		expect(collected).toEqual(['first']);
	});
});
```

- [ ] **Step A6.2: Run tests — verify failure**

Run: `npm test -- aiClient.test.ts`
Expected: FAIL — `@apis/ai` not resolvable.

- [ ] **Step A6.3: Create `src/apis/ai.ts`**

```ts
import { SettingsAPI } from '@apis/settings';

export interface AIConfig {
	url: string;
	apiKey: string;
	model: string;
	streaming: boolean;
}

const DEFAULT_MODEL = 'gpt-3.5-turbo';

export class AIClient {
	private cfg: AIConfig = { url: '', apiKey: '', model: DEFAULT_MODEL, streaming: true };

	constructor(private settings: SettingsAPI) {}

	async reloadConfig(): Promise<void> {
		const url = (await this.settings.getItem<string>('aiProviderUrl')) || '';
		const apiKey = (await this.settings.getItem<string>('aiApiKey')) || '';
		const model = (await this.settings.getItem<string>('aiModel')) || DEFAULT_MODEL;
		const streamingRaw = await this.settings.getItem<unknown>('aiStreaming');
		const streaming = streamingRaw === undefined || streamingRaw === null ? true : !!streamingRaw;
		this.cfg = { url, apiKey, model, streaming };
	}

	isConfigured(): boolean {
		return !!this.cfg.url;
	}

	getConfig(): AIConfig {
		return { ...this.cfg };
	}

	async test(): Promise<{ ok: true } | { ok: false; error: string }> {
		if (!this.isConfigured()) return { ok: false, error: 'AI provider not configured.' };
		try {
			const ctrl = new AbortController();
			const iter = this.stream('ping', ctrl.signal);
			const first = await iter[Symbol.asyncIterator]().next();
			ctrl.abort();
			if (first.done) return { ok: false, error: 'Provider returned no content.' };
			return { ok: true };
		} catch (err) {
			return { ok: false, error: err instanceof Error ? err.message : String(err) };
		}
	}

	stream(prompt: string, signal: AbortSignal): AsyncIterable<string> {
		if (!this.isConfigured()) {
			throw new Error('AI provider not configured. Open Settings to add one.');
		}
		const cfg = this.cfg;
		const endpoint = cfg.url.replace(/\/$/, '') + '/chat/completions';
		const body = JSON.stringify({
			model: cfg.model || DEFAULT_MODEL,
			messages: [{ role: 'user', content: prompt }],
			stream: cfg.streaming,
		});
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;
		return cfg.streaming
			? this.streamSSE(endpoint, headers, body, signal)
			: this.streamSingle(endpoint, headers, body, signal);
	}

	private async *streamSSE(
		endpoint: string,
		headers: Record<string, string>,
		body: string,
		signal: AbortSignal,
	): AsyncGenerator<string> {
		const res = await fetch(endpoint, { method: 'POST', headers, body, signal });
		this.assertOk(res);
		const reader = res.body?.getReader();
		if (!reader) return;
		const dec = new TextDecoder();
		let buf = '';
		try {
			while (true) {
				if (signal.aborted) return;
				const { done, value } = await reader.read();
				if (done) break;
				buf += dec.decode(value, { stream: true });
				let idx: number;
				while ((idx = buf.indexOf('\n\n')) >= 0) {
					const event = buf.slice(0, idx);
					buf = buf.slice(idx + 2);
					for (const line of event.split('\n')) {
						const trimmed = line.trim();
						if (!trimmed.startsWith('data:')) continue;
						const payload = trimmed.slice(5).trim();
						if (payload === '[DONE]') return;
						try {
							const parsed = JSON.parse(payload);
							const delta = parsed?.choices?.[0]?.delta?.content;
							if (typeof delta === 'string' && delta.length > 0) yield delta;
						} catch {
							// malformed chunk — keep already-yielded content, abort
							return;
						}
					}
				}
			}
		} finally {
			try { reader.cancel(); } catch {}
		}
	}

	private async *streamSingle(
		endpoint: string,
		headers: Record<string, string>,
		body: string,
		signal: AbortSignal,
	): AsyncGenerator<string> {
		const res = await fetch(endpoint, { method: 'POST', headers, body, signal });
		this.assertOk(res);
		const json = await res.json();
		const content = json?.choices?.[0]?.message?.content;
		if (typeof content === 'string' && content.length > 0) yield content;
	}

	private assertOk(res: Response): void {
		if (res.ok) return;
		if (res.status === 401 || res.status === 403) {
			throw new Error(`Provider rejected the API key (HTTP ${res.status}).`);
		}
		if (res.status === 429) {
			throw new Error('Rate limited (HTTP 429). Try again shortly.');
		}
		throw new Error(`Couldn't reach AI provider (HTTP ${res.status}).`);
	}
}
```

- [ ] **Step A6.4: Run tests — verify pass**

Run: `npm test -- aiClient.test.ts`
Expected: 8/8 pass.

- [ ] **Step A6.5: Typecheck + full test suite**

Run: `npx tsc -p tsconfig.build.json --noEmit && npm test`
Expected: zero tsc errors; all tests pass.

---

### Task A7: `searchEngines-at` tests + at-namespace verification

**Files:**
- Create: `tests/searchEngines-at.test.ts`

- [ ] **Step A7.1: Write tests for `at` field extension**

Create `tests/searchEngines-at.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SearchEngineRegistry, BUILTIN_SEARCH_ENGINES } from '@apis/searchEngines';
import { FakeSettings } from './helpers/fakeSettings';
import type { SettingsAPI } from '@apis/settings';

function newRegistry(seed?: { engines?: unknown; defaultId?: string }) {
	const settings = new FakeSettings();
	if (seed?.engines !== undefined) settings._set('searchEngines', seed.engines);
	if (seed?.defaultId !== undefined) settings._set('defaultSearchEngineId', seed.defaultId);
	const reg = new SearchEngineRegistry(settings as unknown as SettingsAPI);
	return { reg, settings };
}

describe('SearchEngineRegistry — at field', () => {
	it('load() seeds built-ins with the at field populated', async () => {
		const { reg } = newRegistry();
		await reg.load();
		const ddg = reg.list().find((e) => e.bang === 'ddg');
		expect(ddg?.at).toBe('ddg');
		const google = reg.list().find((e) => e.bang === 'g');
		expect(google?.at).toBe('google');
	});

	it('migration-safe: engines persisted without `at` still load', async () => {
		const legacyEngines = BUILTIN_SEARCH_ENGINES.map((e, i) => ({
			id: `legacy-${i}`,
			name: e.name,
			bang: e.bang,
			urlTemplate: e.urlTemplate,
			builtIn: e.builtIn,
		}));
		const { reg } = newRegistry({ engines: legacyEngines, defaultId: 'legacy-0' });
		await reg.load();
		expect(reg.list()).toHaveLength(BUILTIN_SEARCH_ENGINES.length);
		const ddg = reg.list().find((e) => e.bang === 'ddg');
		expect(ddg?.at).toBeUndefined();
	});

	it('add() with both bang and at succeeds', async () => {
		const { reg } = newRegistry();
		await reg.load();
		const created = await reg.add({ name: 'Kagi', bang: 'k', at: 'kagi', urlTemplate: 'https://kagi.com/?q=%s' });
		expect(created.bang).toBe('k');
		expect(created.at).toBe('kagi');
	});

	it('add() with neither bang nor at rejects', async () => {
		const { reg } = newRegistry();
		await reg.load();
		await expect(
			reg.add({ name: 'Bad', bang: '', at: '', urlTemplate: 'https://x.com/?q=%s' }),
		).rejects.toThrow(/at least one/i);
	});

	it('add() with only bang succeeds (at optional)', async () => {
		const { reg } = newRegistry();
		await reg.load();
		const created = await reg.add({ name: 'BangOnly', bang: 'bo', urlTemplate: 'https://x.com/?q=%s' });
		expect(created.at).toBeUndefined();
	});

	it('add() with only at succeeds (bang optional)', async () => {
		const { reg } = newRegistry();
		await reg.load();
		const created = await reg.add({ name: 'AtOnly', bang: '', at: 'at-only', urlTemplate: 'https://x.com/?q=%s' });
		expect(created.bang).toBe('');
		expect(created.at).toBe('at-only');
	});

	it('add() rejects duplicate at (case-insensitive)', async () => {
		const { reg } = newRegistry();
		await reg.load();
		await expect(
			reg.add({ name: 'Goog2', bang: 'g2', at: 'GOOGLE', urlTemplate: 'https://x.com/?q=%s' }),
		).rejects.toThrow(/duplicate|already/i);
	});

	it('at namespace is independent from bang namespace', async () => {
		const { reg } = newRegistry();
		await reg.load();
		// Add an engine whose `at` matches an existing engine's `bang` (yt).
		// Should succeed because the namespaces are independent.
		const created = await reg.add({
			name: 'YT Alt',
			bang: 'yt2',
			at: 'g',          // same as Google's bang, but Google's `at` is 'google'
			urlTemplate: 'https://example.com/?q=%s',
		});
		expect(created.at).toBe('g');
	});

	it('update() allows changing at to its current value (idempotent)', async () => {
		const { reg } = newRegistry();
		await reg.load();
		const ddg = reg.list().find((e) => e.bang === 'ddg')!;
		await expect(reg.update(ddg.id, { at: 'ddg' })).resolves.toBeUndefined();
	});

	it('findByAt returns the engine for a known at key', async () => {
		const { reg } = newRegistry();
		await reg.load();
		expect(reg.findByAt('google')?.bang).toBe('g');
	});

	it('findByAt is case-insensitive', async () => {
		const { reg } = newRegistry();
		await reg.load();
		expect(reg.findByAt('GOOGLE')?.bang).toBe('g');
	});

	it('findByAt returns undefined for unknown key', async () => {
		const { reg } = newRegistry();
		await reg.load();
		expect(reg.findByAt('nope')).toBeUndefined();
	});
});
```

- [ ] **Step A7.2: Run tests — verify pass**

Run: `npm test -- searchEngines-at.test.ts`
Expected: 12/12 pass.

- [ ] **Step A7.3: Run full suite — confirm no regressions**

Run: `npm test`
Expected: all previously-green tests still pass; new at-field tests pass.

---

### Phase A checkpoint

- [ ] `npm test` → all tests green (29 existing + 13 parseAtPrefix + 11 commandRegistry + 8 aiClient + 12 searchEngines-at = 73 total).
- [ ] `npx tsc -p tsconfig.build.json --noEmit` → zero errors.
- [ ] No file outside Phase A's listed scope was modified.

---

## Phase B — Omnibox skeleton

### Task B1: Delete legacy search files

**Files:**
- Delete: `src/browser/search/index.ts`
- Delete: `src/browser/search/navigation.ts`
- Delete: `src/browser/search/suggestions.ts`
- Delete: `src/browser/search/types.ts`
- Delete: `src/browser/search/ui.ts`
- Delete: `src/browser/search/utils.ts`
- Delete: `src/browser/search.ts`

- [ ] **Step B1.1: Verify no live consumers**

Run: `grep -rn "from '@browser/search'\|from '@browser/search/\|require('@browser/search'" src/ --include='*.ts' --include='*.tsx'`
Expected: zero matches that aren't inside the search/ directory itself.

- [ ] **Step B1.2: Verify no live consumers via Search class identifier**

Run: `grep -rn "new Search(\|: Search;\|: Search " src/ --include='*.ts' --include='*.tsx' | grep -v "test\|search/"`
Expected: only the commented-out block at `src/index.tsx:310-316` and the `searchbar: Search;` declaration in `src/globals.d.ts:35` (both will be cleaned up in Task B3 / Phase E).

- [ ] **Step B1.3: Delete the files**

Run:

```bash
git rm src/browser/search/index.ts src/browser/search/navigation.ts src/browser/search/suggestions.ts src/browser/search/types.ts src/browser/search/ui.ts src/browser/search/utils.ts src/browser/search.ts
```

- [ ] **Step B1.4: Typecheck — confirm no broken imports**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: zero errors. (The `searchbar: Search;` declaration in globals.d.ts will fail typecheck if Task B3 hasn't dropped it — fix here if so by removing that line from `src/globals.d.ts`.)

If the typecheck flags `Search` as unresolved, edit `src/globals.d.ts` line 35 — remove `searchbar: Search;` entirely. Re-run typecheck. Expected: zero errors.

- [ ] **Step B1.5: Run tests**

Run: `npm test`
Expected: all 73 pass.

---

### Task B2: Omnibox types + dispatcher (TDD)

**Files:**
- Create: `src/browser/omnibox/types.ts`
- Create: `src/browser/omnibox/dispatch.ts`
- Create: `tests/omniboxDispatch.test.ts`

- [ ] **Step B2.1: Write failing tests**

Create `tests/omniboxDispatch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dispatch } from '@browser/omnibox/dispatch';

describe('Omnibox dispatch', () => {
	it('empty input -> { mode: "closed" }', () => {
		expect(dispatch('')).toEqual({ mode: 'closed' });
	});

	it('whitespace-only -> closed', () => {
		expect(dispatch('   ')).toEqual({ mode: 'closed' });
	});

	it('"hello" -> default mode with payload "hello"', () => {
		expect(dispatch('hello')).toEqual({ mode: 'default', payload: 'hello' });
	});

	it('">cmd" -> command mode with payload "cmd"', () => {
		expect(dispatch('>cmd')).toEqual({ mode: 'command', payload: 'cmd' });
	});

	it('">" alone -> command mode with empty payload', () => {
		expect(dispatch('>')).toEqual({ mode: 'command', payload: '' });
	});

	it('"@yt cats" -> engine mode with payload "yt cats"', () => {
		expect(dispatch('@yt cats')).toEqual({ mode: 'engine', payload: 'yt cats' });
	});

	it('"@" alone -> engine mode with empty payload', () => {
		expect(dispatch('@')).toEqual({ mode: 'engine', payload: '' });
	});

	it('"!yt cats" -> bang mode with payload "yt cats"', () => {
		expect(dispatch('!yt cats')).toEqual({ mode: 'bang', payload: 'yt cats' });
	});

	it('"?question" -> ai mode with payload "question"', () => {
		expect(dispatch('?question')).toEqual({ mode: 'ai', payload: 'question' });
	});

	it('"?" alone -> ai mode with empty payload', () => {
		expect(dispatch('?')).toEqual({ mode: 'ai', payload: '' });
	});

	it('leading whitespace honored, mode picked from first non-whitespace', () => {
		expect(dispatch('   >cmd')).toEqual({ mode: 'command', payload: 'cmd' });
		expect(dispatch('   @yt')).toEqual({ mode: 'engine', payload: 'yt' });
	});

	it('URL-prefixed input goes to default mode regardless of mode chars mid-string', () => {
		expect(dispatch('https://example.com/?q=>foo')).toEqual({
			mode: 'default',
			payload: 'https://example.com/?q=>foo',
		});
		expect(dispatch('http://example.com/@yt')).toEqual({
			mode: 'default',
			payload: 'http://example.com/@yt',
		});
		expect(dispatch('data:text/plain,!hello')).toEqual({
			mode: 'default',
			payload: 'data:text/plain,!hello',
		});
		expect(dispatch('javascript:?')).toEqual({
			mode: 'default',
			payload: 'javascript:?',
		});
	});
});
```

- [ ] **Step B2.2: Run tests — verify failure**

Run: `npm test -- omniboxDispatch.test.ts`
Expected: FAIL — `@browser/omnibox/dispatch` not resolvable.

- [ ] **Step B2.3: Create `src/browser/omnibox/types.ts`**

```ts
export type OmniboxMode = 'closed' | 'default' | 'command' | 'engine' | 'bang' | 'ai';

export interface DispatchResult {
	mode: OmniboxMode;
	payload?: string;
}

export interface OmniboxRow {
	id: string;
	icon?: string;
	label: string;
	sublabel?: string;
	rightHint?: string;
	onSelect: () => void | Promise<void>;
}

export interface OmniboxSection {
	id: string;
	title: string;
	icon?: string;
	rows: OmniboxRow[];
	hasMore?: boolean;
}
```

- [ ] **Step B2.4: Create `src/browser/omnibox/dispatch.ts`**

```ts
import type { DispatchResult } from './types';

const URL_PREFIXES = ['http://', 'https://', 'data:', 'javascript:'];

export function dispatch(input: string): DispatchResult {
	if (!input) return { mode: 'closed' };

	// URL-prefix bypass: never enter a mode for URL-shaped input.
	for (const p of URL_PREFIXES) {
		if (input.startsWith(p)) return { mode: 'default', payload: input };
	}

	const trimmed = input.replace(/^\s+/, '');
	if (!trimmed) return { mode: 'closed' };

	const first = trimmed[0];
	switch (first) {
		case '>':
			return { mode: 'command', payload: trimmed.slice(1) };
		case '@':
			return { mode: 'engine', payload: trimmed.slice(1) };
		case '!':
			return { mode: 'bang', payload: trimmed.slice(1) };
		case '?':
			return { mode: 'ai', payload: trimmed.slice(1) };
		default:
			return { mode: 'default', payload: trimmed };
	}
}
```

- [ ] **Step B2.5: Run tests — verify pass**

Run: `npm test -- omniboxDispatch.test.ts`
Expected: 12/12 pass.

- [ ] **Step B2.6: Typecheck**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: zero errors.

---

### Task B3: Omnibox UI helpers + class skeleton

**Files:**
- Create: `src/browser/omnibox/ui.ts`
- Create: `src/browser/omnibox/index.ts`
- Modify: `src/globals.d.ts`

- [ ] **Step B3.1: Create `src/browser/omnibox/ui.ts`**

```ts
import type { OmniboxRow, OmniboxSection } from './types';

export function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function rowHtml(row: OmniboxRow, isSelected: boolean): string {
	const selectedClass = isSelected
		? 'bg-[var(--white-05)]'
		: 'hover:bg-[var(--white-05)]';
	const iconHtml = row.icon
		? `<i data-lucide="${escapeHtml(row.icon)}" class="h-4 w-4 text-[var(--proto)] flex-shrink-0"></i>`
		: '';
	const sublabelHtml = row.sublabel
		? `<div class="text-xs text-[var(--proto)] truncate">${escapeHtml(row.sublabel)}</div>`
		: '';
	const rightHintHtml = row.rightHint
		? `<div class="ml-auto text-xs text-[var(--proto)] flex-shrink-0">${escapeHtml(row.rightHint)}</div>`
		: '';
	return `
		<div class="omnibox-row flex items-center gap-3 px-3 py-2 cursor-pointer ${selectedClass}" data-row-id="${escapeHtml(row.id)}">
			${iconHtml}
			<div class="flex-1 min-w-0">
				<div class="text-sm text-[var(--text)] truncate">${escapeHtml(row.label)}</div>
				${sublabelHtml}
			</div>
			${rightHintHtml}
		</div>
	`;
}

export function sectionHtml(section: OmniboxSection, selectedRowId: string | null): string {
	if (section.rows.length === 0) return '';
	const iconHtml = section.icon
		? `<i data-lucide="${escapeHtml(section.icon)}" class="h-3.5 w-3.5"></i>`
		: '';
	const moreHtml = section.hasMore
		? `<button class="omnibox-show-all text-xs text-[var(--proto)] hover:text-[var(--text)] px-3 py-1" data-section-id="${escapeHtml(section.id)}">Show all →</button>`
		: '';
	const rowsHtml = section.rows
		.map((row) => rowHtml(row, row.id === selectedRowId))
		.join('');
	return `
		<div class="omnibox-section" data-section-id="${escapeHtml(section.id)}">
			<div class="flex items-center gap-2 px-3 py-1 text-xs text-[var(--proto)] uppercase tracking-wide">
				${iconHtml}
				<span>${escapeHtml(section.title)}</span>
			</div>
			${rowsHtml}
			${moreHtml}
		</div>
	`;
}
```

- [ ] **Step B3.2: Create `src/browser/omnibox/index.ts` (skeleton)**

```ts
import { Proxy } from '@apis/proxy';
import { Protocols } from '@browser/protocols';
import { Tabs } from '@browser/tabs';
import { SearchEngineRegistry } from '@apis/searchEngines';
import { CommandRegistry } from '@apis/commands';
import { AIClient } from '@apis/ai';
import { Logger } from '@apis/logging';
import { dispatch } from './dispatch';
import type { OmniboxMode, OmniboxRow, OmniboxSection } from './types';

export interface OmniboxDeps {
	input: HTMLInputElement;
	proxy: Proxy;
	protocols: Protocols;
	tabs: Tabs;
	searchEngines: SearchEngineRegistry;
	commands: CommandRegistry;
	aiClient: AIClient;
	swConfig: Record<any, any>;
	proxySetting: string;
}

export class Omnibox {
	private input: HTMLInputElement;
	private deps: OmniboxDeps;
	private dropdown: HTMLDivElement;
	private currentMode: OmniboxMode = 'closed';
	private currentRows: OmniboxRow[] = [];
	private selectedRowId: string | null = null;
	private debounceTimer: number | null = null;
	private currentAbort: AbortController | null = null;
	private blurTimeout: number | null = null;
	private logger: Logger | null = null;

	constructor(deps: OmniboxDeps) {
		this.deps = deps;
		this.input = deps.input;
		this.dropdown = this.createDropdown();
	}

	attach(): void {
		this.installDropdown();
		this.input.addEventListener('focus', this.onFocus);
		this.input.addEventListener('blur', this.onBlur);
		this.input.addEventListener('input', this.onInput);
		this.input.addEventListener('keydown', this.onKeyDown);
	}

	detach(): void {
		this.input.removeEventListener('focus', this.onFocus);
		this.input.removeEventListener('blur', this.onBlur);
		this.input.removeEventListener('input', this.onInput);
		this.input.removeEventListener('keydown', this.onKeyDown);
		this.dropdown.remove();
	}

	private getLogger(): Logger {
		if (!this.logger) this.logger = new Logger();
		return this.logger;
	}

	private createDropdown(): HTMLDivElement {
		const d = document.createElement('div');
		d.className = 'omnibox-dropdown absolute left-0 right-0 z-50 mt-1 bg-[var(--bg-1)] rounded-xl shadow-lg border border-[var(--main-35a)] backdrop-blur-sm overflow-y-auto hidden';
		d.style.minHeight = '25vh';
		d.style.maxHeight = '35vh';
		d.style.top = '100%';
		return d;
	}

	private installDropdown(): void {
		const parent = this.input.parentElement;
		if (!parent) {
			console.warn('[omnibox] address bar has no parent — cannot anchor dropdown');
			return;
		}
		// The parent is `<div class="relative w-full flex-1 urlbar-ring">` — already position:relative
		parent.appendChild(this.dropdown);
	}

	private onFocus = () => {
		// If input has content, re-trigger dispatch on focus to re-open the dropdown.
		if (this.input.value.trim()) {
			this.handleInput();
		}
	};

	private onBlur = () => {
		// Delay so click events on dropdown rows fire first.
		if (this.blurTimeout) clearTimeout(this.blurTimeout);
		this.blurTimeout = window.setTimeout(() => {
			this.close();
		}, 150);
	};

	private onInput = () => {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = window.setTimeout(() => {
			this.handleInput();
		}, 150);
	};

	private onKeyDown = (e: KeyboardEvent) => {
		if (this.currentMode === 'closed') return;
		if (e.key === 'Escape') {
			e.preventDefault();
			this.close();
			return;
		}
		if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
			e.preventDefault();
			this.moveSelection(1);
			return;
		}
		if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
			e.preventDefault();
			this.moveSelection(-1);
			return;
		}
		if (e.key === 'Enter') {
			if (this.selectedRowId) {
				e.preventDefault();
				const row = this.currentRows.find((r) => r.id === this.selectedRowId);
				if (row) {
					void Promise.resolve(row.onSelect()).catch((err) => {
						console.warn('[omnibox] row select failed:', err);
					});
					this.close();
				}
			}
			// If no row selected, fall through to existing legacy Enter handler.
		}
	};

	private handleInput(): void {
		const value = this.input.value;
		const result = dispatch(value);
		this.currentMode = result.mode;
		this.currentRows = [];
		this.selectedRowId = null;
		// Mode handlers added in Phase C tasks. Skeleton stub for now:
		if (result.mode === 'closed') {
			this.close();
			return;
		}
		this.render();
		this.open();
	}

	private render(): void {
		// Stub: each mode handler in Phase C populates this.dropdown.innerHTML.
		// For Phase B, render a single placeholder so we can verify the dropdown
		// opens and anchors correctly.
		this.dropdown.innerHTML = `
			<div class="px-3 py-2 text-sm text-[var(--proto)]">Mode: ${this.currentMode} (Phase C will render content)</div>
		`;
	}

	private open(): void {
		this.dropdown.classList.remove('hidden');
	}

	private close(): void {
		this.dropdown.classList.add('hidden');
		this.currentMode = 'closed';
		this.currentRows = [];
		this.selectedRowId = null;
		if (this.currentAbort) {
			this.currentAbort.abort();
			this.currentAbort = null;
		}
	}

	private moveSelection(delta: number): void {
		if (this.currentRows.length === 0) return;
		const idx = this.currentRows.findIndex((r) => r.id === this.selectedRowId);
		const nextIdx = idx === -1 ? (delta > 0 ? 0 : this.currentRows.length - 1) : (idx + delta + this.currentRows.length) % this.currentRows.length;
		this.selectedRowId = this.currentRows[nextIdx].id;
		this.render();
	}
}
```

- [ ] **Step B3.3: Update `src/globals.d.ts`**

In `src/globals.d.ts`:

1. At the top, add three type imports alongside the existing `import type { SearchEngineRegistry } from '@apis/searchEngines';`:

```ts
import type { CommandRegistry } from '@apis/commands';
import type { AIClient } from '@apis/ai';
import type { Omnibox } from '@browser/omnibox';
```

2. Inside the `Window` interface, add three lines after the existing `searchEngines: SearchEngineRegistry;` line:

```ts
commands: CommandRegistry;
aiClient: AIClient;
omnibox: Omnibox;
```

3. If the `searchbar: Search;` line at line 35 is still present (not yet cleaned up by Task B1.4), delete it now.

- [ ] **Step B3.4: Typecheck**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: zero errors.

- [ ] **Step B3.5: Run tests**

Run: `npm test`
Expected: all 85 tests pass (73 from Phase A + 12 new omnibox dispatch).

---

### Task B4: Wire Omnibox into boot sequence

**Files:**
- Modify: `src/index.tsx`

- [ ] **Step B4.1: Add imports**

In `src/index.tsx`, add to the `@apis/*` imports block (after `import { SearchEngineRegistry } from '@apis/searchEngines';`):

```ts
import { CommandRegistry } from '@apis/commands';
import { AIClient } from '@apis/ai';
import { Omnibox } from '@browser/omnibox';
```

- [ ] **Step B4.2: Instantiate `CommandRegistry` and `AIClient` in pre-`initializeSystem` block**

In `src/index.tsx`, find the existing block (around lines 88-91):

```ts
const settingsAPI = new SettingsAPI();
const searchEngines = new SearchEngineRegistry(settingsAPI);
await searchEngines.load();
window.searchEngines = searchEngines;
```

Add immediately after:

```ts
const commands = new CommandRegistry();
window.commands = commands;
const aiClient = new AIClient(settingsAPI);
await aiClient.reloadConfig();
window.aiClient = aiClient;
```

- [ ] **Step B4.3: Extend the message listener**

Find the existing listener (around lines 93-97):

```ts
window.addEventListener('message', (event) => {
	if (event.data?.type === 'searchEngines-updated') {
		void window.searchEngines.load();
	}
});
```

Replace with:

```ts
window.addEventListener('message', (event) => {
	if (event.data?.type === 'searchEngines-updated') {
		void window.searchEngines.load();
	}
	if (event.data?.type === 'ai-config-updated') {
		void window.aiClient.reloadConfig();
	}
	if (event.data?.type === 'commands-updated') {
		// Reserved for future custom-commands feature; v1 has no behavior here.
	}
});
```

- [ ] **Step B4.4: Replace the commented-out Search block with Omnibox instantiation**

In `src/index.tsx`, find the commented-out block at lines 310-316:

```ts
		/*if (searchSuggestionsEnabled) {
			const searchbar = new Search(proxy, swConfig, proxySetting, proto);
			if (items.addressBar) {
      await searchbar.init(items.addressBar);
    }
    window.searchbar = searchbar;
  }*/
```

Replace with:

```ts
		if (items.addressBar) {
			const omnibox = new Omnibox({
				input: items.addressBar,
				proxy,
				protocols: proto,
				tabs,
				searchEngines,
				commands,
				aiClient,
				swConfig,
				proxySetting,
			});
			omnibox.attach();
			window.omnibox = omnibox;
		}
```

Note: this MUST be placed AFTER the existing `searchBar!.addEventListener('keydown', ...)` block (lines 252-308) so the Omnibox's keydown handler runs FIRST (it's attached later, but DOM listeners fire in registration order — both will fire on Enter; the Omnibox's calls preventDefault if it consumes the event, otherwise the legacy handler runs as fallback). Place the new block immediately after the closing brace of the existing addEventListener handler at line 308.

Wait — listener order is registration order, but only the FIRST handler's `preventDefault` matters here; both still run. The existing handler unconditionally runs its logic on Enter regardless of whether the Omnibox preventDefault'd. We need to check whether the existing handler can be made conditional.

Re-reading the existing handler at lines 252-308: it calls `proto.processUrl` and falls through to `proxy.redirect`. There's no early-return based on event state.

**Decision:** the Omnibox's keydown listener checks `this.selectedRowId` before consuming Enter. If a row is selected, it calls `onSelect()` and `close()`, but does NOT preventDefault (the Enter event still reaches the legacy handler). We need to either:

(a) Have the Omnibox skip closing on Enter when a row was selected, since `onSelect` will navigate the active iframe and the legacy handler would also try to navigate (causing a double-action), OR
(b) Add a check at the top of the legacy handler that returns early if `window.omnibox` consumed the event.

Option (b) is cleaner. Modify the existing handler at line 252 to check for a flag.

**Implementation:** Add to the existing handler at the very top of the keydown body (immediately after `if (e.key === 'Enter') {`):

```ts
if ((e as any).__omniboxConsumed) return;
```

Then in the Omnibox `onKeyDown`, when consuming Enter on a row, set:

```ts
(e as any).__omniboxConsumed = true;
e.preventDefault();
```

Same for Escape (just `__omniboxConsumed = true`; preventDefault already there).

Apply the legacy handler change now. Find line 252 inside the handler:

```ts
		searchBar!.addEventListener('keydown', async e => {
			if (e.key === 'Enter') {
				e.preventDefault();
```

Change to:

```ts
		searchBar!.addEventListener('keydown', async e => {
			if (e.key === 'Enter') {
				if ((e as any).__omniboxConsumed) return;
				e.preventDefault();
```

In `src/browser/omnibox/index.ts`, update `onKeyDown` — the `Enter` branch becomes:

```ts
if (e.key === 'Enter') {
	if (this.selectedRowId) {
		e.preventDefault();
		(e as any).__omniboxConsumed = true;
		const row = this.currentRows.find((r) => r.id === this.selectedRowId);
		if (row) {
			void Promise.resolve(row.onSelect()).catch((err) => {
				console.warn('[omnibox] row select failed:', err);
			});
			this.close();
		}
	}
}
```

- [ ] **Step B4.5: Typecheck**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: zero errors.

- [ ] **Step B4.6: Run tests**

Run: `npm test`
Expected: 85 pass.

---

### Phase B checkpoint

- [ ] Tests green (85).
- [ ] Tsc clean.
- [ ] Legacy `src/browser/search/` and `src/browser/search.ts` deleted.
- [ ] `src/globals.d.ts` declares `commands`, `aiClient`, `omnibox` and no longer declares `searchbar: Search`.
- [ ] `src/index.tsx` instantiates `Omnibox` after `tabs` is constructed; legacy Enter handler still works as fallback.
- [ ] Manual: starting dev server should show a placeholder dropdown with "Mode: <name>" when typing in the address bar.

---

## Phase C — Mode handlers

Each task adds rendering + selection logic for one mode. Mode handlers are pure functions called by `Omnibox.render()`, returning `OmniboxRow[]` and HTML for the dropdown. Tests exist where pure logic warrants them; UI rendering is verified by manual smoke (per spec).

### Task C1: Default mode (5 sections, parallel fan-out)

**Files:**
- Create: `src/browser/omnibox/modes/default.ts`
- Modify: `src/browser/omnibox/index.ts` (call default-mode handler)
- Create: `tests/omniboxDefault-fanout.test.ts`

- [ ] **Step C1.1: Write fan-out tests**

Create `tests/omniboxDefault-fanout.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderDefaultMode, type DefaultModeDeps } from '@browser/omnibox/modes/default';

function fakeDeps(overrides: Partial<DefaultModeDeps> = {}): DefaultModeDeps {
	return {
		query: 'hello',
		searchEngines: {
			getDefault: () => ({ id: '1', name: 'DuckDuckGo', bang: 'ddg', urlTemplate: 'https://duckduckgo.com/?q=%s', builtIn: true }),
		} as any,
		tabs: { searchOpen: vi.fn().mockReturnValue([]) } as any,
		history: { searchEntries: vi.fn().mockReturnValue([]) } as any,
		bookmarks: { searchBookmarks: vi.fn().mockReturnValue([]) } as any,
		protocols: { listRoutes: vi.fn().mockReturnValue([]) } as any,
		fetchSuggestions: vi.fn().mockResolvedValue([]),
		signal: new AbortController().signal,
		onNavigate: vi.fn(),
		...overrides,
	};
}

describe('renderDefaultMode', () => {
	it('returns primary action row for any non-empty query', async () => {
		const result = await renderDefaultMode(fakeDeps());
		expect(result.primaryRow).toBeDefined();
		expect(result.primaryRow.label.toLowerCase()).toContain('search');
	});

	it('returns "Go to:" primary row for URL-shaped input', async () => {
		const result = await renderDefaultMode(fakeDeps({ query: 'https://example.com/' }));
		expect(result.primaryRow.label.toLowerCase()).toContain('go to');
	});

	it('aborts pending sources when signal aborts', async () => {
		const ctrl = new AbortController();
		const fetchSuggestions = vi.fn().mockImplementation((_q: string, signal: AbortSignal) => {
			return new Promise((_resolve, reject) => {
				signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
			});
		});
		const deps = fakeDeps({ signal: ctrl.signal, fetchSuggestions });
		const promise = renderDefaultMode(deps);
		ctrl.abort();
		const result = await promise;
		// Search-suggestions section should be empty (or absent) because the fetch was aborted.
		expect(result.sections.find((s) => s.id === 'search')?.rows ?? []).toEqual([]);
	});

	it('failed sources do not break other sections', async () => {
		const deps = fakeDeps({
			fetchSuggestions: vi.fn().mockRejectedValue(new Error('boom')),
			tabs: { searchOpen: vi.fn().mockReturnValue([{ tabId: 't1', title: 'Tab 1', url: 'https://x.com/', favicon: null }]) } as any,
		});
		const result = await renderDefaultMode(deps);
		expect(result.sections.find((s) => s.id === 'tabs')?.rows.length).toBe(1);
	});

	it('respects per-section caps', async () => {
		const many = Array.from({ length: 20 }, (_, i) => ({ tabId: `t${i}`, title: `Tab ${i}`, url: 'https://x.com/', favicon: null }));
		const deps = fakeDeps({
			tabs: { searchOpen: vi.fn().mockReturnValue(many) } as any,
		});
		const result = await renderDefaultMode(deps);
		const tabsSection = result.sections.find((s) => s.id === 'tabs');
		expect(tabsSection?.rows.length).toBe(3);
		expect(tabsSection?.hasMore).toBe(true);
	});
});
```

- [ ] **Step C1.2: Run tests — verify failure**

Run: `npm test -- omniboxDefault-fanout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step C1.3: Create `src/browser/omnibox/modes/default.ts`**

```ts
import type { OmniboxRow, OmniboxSection } from '../types';
import type { SearchEngineRegistry } from '@apis/searchEngines';
import type { Tabs } from '@browser/tabs';
import type { HistoryManager, HistorySearchResult } from '@apis/history';
import type { BookmarkManager, BookmarkItem } from '@apis/bookmarks';
import { isBookmark } from '@apis/bookmarks';
import type { Protocols, ProtocolRouteSnapshot } from '@browser/protocols';

export interface DefaultModeDeps {
	query: string;
	searchEngines: Pick<SearchEngineRegistry, 'getDefault'>;
	tabs: Pick<Tabs, 'searchOpen' | 'selectTab'> & { activeTabId?: string | null };
	history: Pick<HistoryManager, 'searchEntries'>;
	bookmarks: Pick<BookmarkManager, 'searchBookmarks'>;
	protocols: Pick<Protocols, 'listRoutes' | 'navigate'>;
	fetchSuggestions: (query: string, signal: AbortSignal) => Promise<string[]>;
	signal: AbortSignal;
	onNavigate: (url: string) => void;
}

export interface DefaultModeResult {
	primaryRow: OmniboxRow;
	sections: OmniboxSection[];
}

const CAPS = { tabs: 3, history: 4, bookmarks: 4, internal: 4, search: 6 };

function isUrlLike(s: string): boolean {
	if (s.startsWith('http://') || s.startsWith('https://')) return true;
	try {
		const u = new URL(s);
		return !!u.protocol;
	} catch {
		try {
			const u = new URL(`http://${s}`);
			return u.hostname.includes('.');
		} catch {
			return false;
		}
	}
}

export async function renderDefaultMode(deps: DefaultModeDeps): Promise<DefaultModeResult> {
	const { query } = deps;
	const defaultEngine = deps.searchEngines.getDefault();
	const urlLike = isUrlLike(query);

	const primaryRow: OmniboxRow = urlLike
		? {
			id: 'primary-go',
			icon: 'globe',
			label: `Go to: ${query}`,
			onSelect: () => deps.onNavigate(query.startsWith('http') ? query : `http://${query}`),
		}
		: {
			id: 'primary-search',
			icon: 'search',
			label: `Search ${defaultEngine.name} for: ${query}`,
			onSelect: () => deps.onNavigate(defaultEngine.urlTemplate.replace('%s', encodeURIComponent(query))),
		};

	// Synchronous sources first
	const tabsResults = safeCall(() => deps.tabs.searchOpen(query)) ?? [];
	const historyResults = safeCall(() => deps.history.searchEntries(query)) ?? [];
	const bookmarksRaw = safeCall(() => deps.bookmarks.searchBookmarks(query)) ?? [];
	const bookmarksResults = bookmarksRaw.filter(isBookmark);
	const protocolRoutes = safeCall(() => deps.protocols.listRoutes()) ?? [];

	// Async source: search suggestions
	let suggestions: string[] = [];
	try {
		suggestions = await deps.fetchSuggestions(query, deps.signal);
	} catch {
		suggestions = [];
	}

	const sections: OmniboxSection[] = [];

	// Open tabs
	if (tabsResults.length > 0) {
		const rows: OmniboxRow[] = tabsResults.slice(0, CAPS.tabs).map((t) => ({
			id: `tab-${t.tabId}`,
			icon: 'monitor',
			label: t.title,
			sublabel: hostnameOf(t.url),
			onSelect: () => { void deps.tabs.selectTab(t.tabId); },
		}));
		sections.push({
			id: 'tabs',
			title: 'Open tabs',
			icon: 'monitor',
			rows,
			hasMore: tabsResults.length > CAPS.tabs,
		});
	}

	// History
	if (historyResults.length > 0) {
		const rows: OmniboxRow[] = historyResults.slice(0, CAPS.history).map((r: HistorySearchResult) => ({
			id: `hist-${r.entry.id}`,
			icon: 'history',
			label: r.entry.title || r.entry.url,
			sublabel: hostnameOf(r.entry.url),
			onSelect: () => deps.onNavigate(r.entry.url),
		}));
		sections.push({
			id: 'history',
			title: 'History',
			icon: 'history',
			rows,
			hasMore: historyResults.length > CAPS.history,
		});
	}

	// Bookmarks
	if (bookmarksResults.length > 0) {
		const rows: OmniboxRow[] = bookmarksResults.slice(0, CAPS.bookmarks).map((b) => ({
			id: `bm-${b.id}`,
			icon: 'star',
			label: b.title,
			sublabel: hostnameOf((b as { url: string }).url),
			onSelect: () => deps.onNavigate((b as { url: string }).url),
		}));
		sections.push({
			id: 'bookmarks',
			title: 'Bookmarks',
			icon: 'star',
			rows,
			hasMore: bookmarksResults.length > CAPS.bookmarks,
		});
	}

	// Internal pages
	const protoMatches = filterProtocolRoutes(protocolRoutes, query);
	if (protoMatches.length > 0) {
		const rows: OmniboxRow[] = protoMatches.slice(0, CAPS.internal).map((r) => ({
			id: `proto-${r.proto}-${r.path}`,
			icon: 'box',
			label: `${r.proto}://${r.path}`,
			onSelect: () => { void deps.protocols.navigate(`${r.proto}://${r.path}`); },
		}));
		sections.push({
			id: 'internal',
			title: 'Internal pages',
			icon: 'box',
			rows,
			hasMore: protoMatches.length > CAPS.internal,
		});
	}

	// Search suggestions
	if (suggestions.length > 0) {
		const rows: OmniboxRow[] = suggestions.slice(0, CAPS.search).map((s, i) => ({
			id: `sug-${i}`,
			icon: 'search',
			label: s,
			onSelect: () => deps.onNavigate(defaultEngine.urlTemplate.replace('%s', encodeURIComponent(s))),
		}));
		sections.push({
			id: 'search',
			title: 'Search suggestions',
			icon: 'search',
			rows,
			hasMore: suggestions.length > CAPS.search,
		});
	}

	return { primaryRow, sections };
}

function safeCall<T>(fn: () => T): T | null {
	try { return fn(); } catch (err) { console.warn('[omnibox/default] section threw:', err); return null; }
}

function hostnameOf(url: string): string {
	try { return new URL(url).hostname; } catch { return url; }
}

function filterProtocolRoutes(routes: ProtocolRouteSnapshot[], query: string): ProtocolRouteSnapshot[] {
	const q = query.toLowerCase();
	return routes
		.filter((r) => r.path !== '*')
		.filter((r) => `${r.proto}://${r.path}`.toLowerCase().includes(q));
}
```

- [ ] **Step C1.4: Run tests — verify pass**

Run: `npm test -- omniboxDefault-fanout.test.ts`
Expected: 5/5 pass.

- [ ] **Step C1.5: Wire `renderDefaultMode` into `Omnibox.render`**

In `src/browser/omnibox/index.ts`, update the `render` method to call the default-mode handler when in default mode. Replace the existing stub `render` with:

```ts
private async render(): Promise<void> {
	if (this.currentMode === 'default') {
		const ac = new AbortController();
		this.currentAbort?.abort();
		this.currentAbort = ac;
		const query = this.input.value.trim().replace(/^\s+/, '');
		const { renderDefaultMode } = await import('./modes/default');
		const { rowHtml, sectionHtml } = await import('./ui');
		try {
			const result = await renderDefaultMode({
				query,
				searchEngines: this.deps.searchEngines,
				tabs: this.deps.tabs,
				history: this.deps.tabs.getHistoryManager(),
				bookmarks: this.deps.tabs.bookmarkManager,
				protocols: this.deps.protocols,
				fetchSuggestions: (q, signal) => this.fetchSuggestions(q, signal),
				signal: ac.signal,
				onNavigate: (url) => this.navigateActive(url),
			});
			if (ac.signal.aborted) return;
			this.currentRows = [result.primaryRow, ...result.sections.flatMap((s) => s.rows)];
			if (!this.selectedRowId && this.currentRows.length > 0) {
				this.selectedRowId = this.currentRows[0].id;
			}
			const sectionsHtml = result.sections.map((s) => sectionHtml(s, this.selectedRowId)).join('');
			this.dropdown.innerHTML = `
				<div class="omnibox-primary border-b border-[var(--white-08)] py-1">
					${rowHtml(result.primaryRow, this.selectedRowId === result.primaryRow.id)}
				</div>
				${sectionsHtml}
			`;
			this.attachRowListeners();
		} catch (err) {
			console.warn('[omnibox] default render failed:', err);
		}
		return;
	}
	// Other modes (Tasks C2-C5) populate this.dropdown.innerHTML directly.
	this.dropdown.innerHTML = `
		<div class="px-3 py-2 text-sm text-[var(--proto)]">Mode: ${this.currentMode} (rendering coming in Phase C)</div>
	`;
}

private async fetchSuggestions(query: string, signal: AbortSignal): Promise<string[]> {
	const { resolvePath } = await import('@utils/basepath');
	const url = `${resolvePath('api/results/')}${encodeURIComponent(query)}`;
	try {
		const res = await fetch(url, { signal });
		if (!res.ok) return [];
		const data = await res.json();
		if (!Array.isArray(data)) return [];
		return data.map((item: { phrase?: string }) => item.phrase ?? '').filter(Boolean);
	} catch (err) {
		if ((err as DOMException).name === 'AbortError') return [];
		console.warn('[omnibox] fetch suggestions failed:', err);
		return [];
	}
}

private navigateActive(url: string): void {
	const iframe = document.querySelector('iframe.active') as HTMLIFrameElement | null;
	if (!iframe) {
		console.warn('[omnibox] no active iframe to navigate');
		return;
	}
	// Route via proxy.search to handle URL/search/encoding consistently with the legacy handler.
	void this.deps.proxy.redirect(this.deps.swConfig as any, this.deps.proxySetting, url, iframe);
}

private attachRowListeners(): void {
	this.dropdown.querySelectorAll<HTMLDivElement>('.omnibox-row').forEach((el) => {
		el.addEventListener('mousedown', (ev) => {
			ev.preventDefault(); // keep input focus
			const id = el.dataset.rowId;
			if (!id) return;
			const row = this.currentRows.find((r) => r.id === id);
			if (!row) return;
			void Promise.resolve(row.onSelect()).catch((err) => {
				console.warn('[omnibox] row select failed:', err);
			});
			this.close();
		});
	});
}
```

The `handleInput` method must be updated to await `render()`. Change `handleInput` to:

```ts
private async handleInput(): Promise<void> {
	const value = this.input.value;
	const result = dispatch(value);
	this.currentMode = result.mode;
	this.currentRows = [];
	this.selectedRowId = null;
	if (result.mode === 'closed') {
		this.close();
		return;
	}
	this.open();
	await this.render();
}
```

The `onInput` debounce callback must call the now-async `handleInput`:

```ts
private onInput = () => {
	if (this.debounceTimer) clearTimeout(this.debounceTimer);
	this.debounceTimer = window.setTimeout(() => {
		void this.handleInput();
	}, 150);
};
```

And `onFocus`:

```ts
private onFocus = () => {
	if (this.input.value.trim()) {
		void this.handleInput();
	}
};
```

`moveSelection` also needs to await the re-render:

```ts
private moveSelection(delta: number): void {
	if (this.currentRows.length === 0) return;
	const idx = this.currentRows.findIndex((r) => r.id === this.selectedRowId);
	const nextIdx = idx === -1 ? (delta > 0 ? 0 : this.currentRows.length - 1) : (idx + delta + this.currentRows.length) % this.currentRows.length;
	this.selectedRowId = this.currentRows[nextIdx].id;
	void this.render();
}
```

- [ ] **Step C1.6: Typecheck**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: zero errors.

- [ ] **Step C1.7: Run tests**

Run: `npm test`
Expected: all 90 tests pass (85 existing + 5 fan-out).

---

### Task C2: `>` Command palette mode

**Files:**
- Create: `src/browser/omnibox/modes/commands.ts`
- Modify: `src/browser/omnibox/index.ts`

- [ ] **Step C2.1: Create `src/browser/omnibox/modes/commands.ts`**

```ts
import type { OmniboxRow, OmniboxSection } from '../types';
import type { CommandRegistry, Command } from '@apis/commands';

export interface CommandModeDeps {
	query: string;
	commands: CommandRegistry;
}

export interface CommandModeResult {
	sections: OmniboxSection[];
}

export function renderCommandMode(deps: CommandModeDeps): CommandModeResult {
	const { query, commands } = deps;
	const toRow = (cmd: Command): OmniboxRow => ({
		id: `cmd-${cmd.id}`,
		icon: cmd.icon,
		label: cmd.label,
		rightHint: cmd.shortcut,
		onSelect: () => commands.execute(cmd.id),
	});

	if (!query.trim()) {
		const grouped = commands.listByCategory();
		const sections: OmniboxSection[] = Object.entries(grouped)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([category, cmds]) => ({
				id: `cmd-cat-${category}`,
				title: category,
				icon: cmds[0]?.icon,
				rows: cmds
					.sort((a, b) => a.label.localeCompare(b.label))
					.map(toRow),
			}));
		return { sections };
	}
	const matches = commands.find(query, 50);
	const rows = matches.map(toRow);
	if (rows.length === 0) return { sections: [] };
	return {
		sections: [{ id: 'cmd-results', title: 'Commands', icon: 'terminal', rows }],
	};
}
```

- [ ] **Step C2.2: Wire into `Omnibox.render`**

In `src/browser/omnibox/index.ts`'s `render` method, add a branch for `'command'` BEFORE the `'default'` branch:

```ts
if (this.currentMode === 'command') {
	const { renderCommandMode } = await import('./modes/commands');
	const { sectionHtml } = await import('./ui');
	const query = this.payloadFor('command');
	const result = renderCommandMode({ query, commands: this.deps.commands });
	this.currentRows = result.sections.flatMap((s) => s.rows);
	if (!this.selectedRowId && this.currentRows.length > 0) {
		this.selectedRowId = this.currentRows[0].id;
	}
	this.dropdown.innerHTML = result.sections.map((s) => sectionHtml(s, this.selectedRowId)).join('') ||
		'<div class="px-3 py-2 text-sm text-[var(--proto)]">No matching commands</div>';
	this.attachRowListeners();
	return;
}
```

Add the helper `payloadFor` method to the class:

```ts
private payloadFor(_mode: 'command' | 'engine' | 'bang' | 'ai'): string {
	const result = dispatch(this.input.value);
	return result.payload ?? '';
}
```

- [ ] **Step C2.3: Typecheck + run tests**

Run: `npx tsc -p tsconfig.build.json --noEmit && npm test`
Expected: 90 tests pass; tsc clean.

---

### Task C3: `@` Engine prefix mode

**Files:**
- Create: `src/browser/omnibox/modes/engine.ts`
- Modify: `src/browser/omnibox/index.ts`

- [ ] **Step C3.1: Create `src/browser/omnibox/modes/engine.ts`**

```ts
import type { OmniboxRow, OmniboxSection } from '../types';
import type { SearchEngineRegistry, SearchEngine } from '@apis/searchEngines';

export interface EngineModeDeps {
	query: string;
	searchEngines: Pick<SearchEngineRegistry, 'list' | 'findByAt'>;
	onNavigate: (url: string) => void;
	onSelectEngine: (atKey: string) => void;
}

export interface EngineModeResult {
	primaryRow?: OmniboxRow;
	sections: OmniboxSection[];
}

export function renderEngineMode(deps: EngineModeDeps): EngineModeResult {
	const { query } = deps;
	// Parse "<key> <rest>" — split on first whitespace.
	const m = query.match(/^([A-Za-z0-9._-]+)(?:\s+(.*))?$/);
	if (m) {
		const key = m[1];
		const rest = m[2];
		const engine = deps.searchEngines.findByAt(key);
		if (engine && rest !== undefined && rest.length > 0) {
			// Preview row
			return {
				primaryRow: {
					id: `eng-preview-${engine.id}`,
					icon: 'search',
					label: `Search ${engine.name} for: ${rest}`,
					onSelect: () => deps.onNavigate(engine.urlTemplate.replace('%s', encodeURIComponent(rest))),
				},
				sections: [],
			};
		}
		if (engine && (rest === undefined || rest.length === 0)) {
			// User typed @<known-key> alone — single preview-empty row that re-opens the picker on Enter (just inserts space).
			return {
				primaryRow: {
					id: `eng-key-${engine.id}`,
					icon: 'search',
					label: `Search ${engine.name} for: `,
					sublabel: 'Type your query and press Enter',
					onSelect: () => deps.onSelectEngine(engine.at!),
				},
				sections: [],
			};
		}
	}
	// Otherwise show the picker — all engines with `at` populated, filtered by partial key
	const engines = deps.searchEngines.list().filter((e: SearchEngine) => !!e.at);
	const filtered = query
		? engines.filter((e) => (e.at ?? '').toLowerCase().startsWith(query.toLowerCase()))
		: engines;
	if (filtered.length === 0) return { sections: [] };
	const rows: OmniboxRow[] = filtered.map((e) => ({
		id: `eng-pick-${e.id}`,
		icon: 'at-sign',
		label: `@${e.at} — ${e.name}`,
		sublabel: e.urlTemplate,
		onSelect: () => deps.onSelectEngine(e.at!),
	}));
	return {
		sections: [{ id: 'engines', title: 'Search engines', icon: 'at-sign', rows }],
	};
}
```

- [ ] **Step C3.2: Wire into `Omnibox.render` + add `selectEngine` helper**

In `src/browser/omnibox/index.ts`, add this branch in `render` BEFORE `'command'`:

```ts
if (this.currentMode === 'engine') {
	const { renderEngineMode } = await import('./modes/engine');
	const { rowHtml, sectionHtml } = await import('./ui');
	const query = this.payloadFor('engine');
	const result = renderEngineMode({
		query,
		searchEngines: this.deps.searchEngines,
		onNavigate: (url) => this.navigateActive(url),
		onSelectEngine: (atKey) => this.selectEngine(atKey),
	});
	this.currentRows = [
		...(result.primaryRow ? [result.primaryRow] : []),
		...result.sections.flatMap((s) => s.rows),
	];
	if (!this.selectedRowId && this.currentRows.length > 0) {
		this.selectedRowId = this.currentRows[0].id;
	}
	const primaryHtml = result.primaryRow
		? `<div class="omnibox-primary border-b border-[var(--white-08)] py-1">${rowHtml(result.primaryRow, this.selectedRowId === result.primaryRow.id)}</div>`
		: '';
	const sectionsHtml = result.sections.map((s) => sectionHtml(s, this.selectedRowId)).join('');
	this.dropdown.innerHTML = primaryHtml + sectionsHtml || '<div class="px-3 py-2 text-sm text-[var(--proto)]">No matching engines</div>';
	this.attachRowListeners();
	return;
}
```

Add the `selectEngine` helper:

```ts
private selectEngine(atKey: string): void {
	this.input.value = `@${atKey} `;
	this.input.focus();
	this.input.setSelectionRange(this.input.value.length, this.input.value.length);
	void this.handleInput();
}
```

- [ ] **Step C3.3: Typecheck + run tests**

Run: `npx tsc -p tsconfig.build.json --noEmit && npm test`
Expected: 90 tests pass; tsc clean.

---

### Task C4: `!` Bang preview mode

**Files:**
- Create: `src/browser/omnibox/modes/bang.ts`
- Modify: `src/browser/omnibox/index.ts`

- [ ] **Step C4.1: Create `src/browser/omnibox/modes/bang.ts`**

```ts
import type { OmniboxRow } from '../types';
import type { SearchEngineRegistry } from '@apis/searchEngines';
import { parseBang } from '@apis/searchEngines';

export interface BangModeDeps {
	rawInput: string; // e.g. "!yt cats" — full input including "!"
	searchEngines: SearchEngineRegistry;
	onNavigate: (url: string) => void;
}

export interface BangModeResult {
	primaryRow?: OmniboxRow;
}

export function renderBangMode(deps: BangModeDeps): BangModeResult {
	const hit = parseBang(deps.rawInput, deps.searchEngines);
	if (!hit) return {};
	const { engine, query } = hit;
	return {
		primaryRow: {
			id: `bang-${engine.id}`,
			icon: 'zap',
			label: `Search ${engine.name} for: ${query || ''}`,
			sublabel: `!${engine.bang}`,
			onSelect: () => deps.onNavigate(engine.urlTemplate.replace('%s', encodeURIComponent(query))),
		},
	};
}
```

- [ ] **Step C4.2: Wire into `Omnibox.render`**

In `src/browser/omnibox/index.ts`, add this branch in `render` BEFORE `'command'`:

```ts
if (this.currentMode === 'bang') {
	const { renderBangMode } = await import('./modes/bang');
	const { rowHtml } = await import('./ui');
	const result = renderBangMode({
		rawInput: this.input.value,
		searchEngines: this.deps.searchEngines,
		onNavigate: (url) => this.navigateActive(url),
	});
	if (!result.primaryRow) {
		// Unknown bang — fall through to default-mode rendering by re-dispatching.
		this.currentMode = 'default';
		await this.render();
		return;
	}
	this.currentRows = [result.primaryRow];
	this.selectedRowId = result.primaryRow.id;
	this.dropdown.innerHTML = `<div class="omnibox-primary py-1">${rowHtml(result.primaryRow, true)}</div>`;
	this.attachRowListeners();
	return;
}
```

- [ ] **Step C4.3: Typecheck + run tests**

Run: `npx tsc -p tsconfig.build.json --noEmit && npm test`
Expected: 90 tests pass; tsc clean.

---

### Task C5: `?` AI mode

**Files:**
- Create: `src/browser/omnibox/modes/ai.ts`
- Modify: `src/browser/omnibox/index.ts`

- [ ] **Step C5.1: Create `src/browser/omnibox/modes/ai.ts`**

```ts
import type { AIClient } from '@apis/ai';
import type { Protocols } from '@browser/protocols';

export interface AIModeDeps {
	prompt: string;
	aiClient: AIClient;
	protocols: Pick<Protocols, 'navigate'>;
	dropdown: HTMLDivElement;
	onClose: () => void;
}

export function renderAIPromptHint(): string {
	return `<div class="px-3 py-2 text-sm text-[var(--proto)]">Type your question after <code class="bg-[var(--bg-2)] px-1 rounded">?</code> and press Enter to ask the AI.</div>`;
}

export function renderAIPromptPrimary(deps: AIModeDeps): string {
	const provider = deps.aiClient.getConfig().url || '(none)';
	const providerHost = (() => {
		try { return new URL(provider).hostname; } catch { return provider; }
	})();
	const escPrompt = deps.prompt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	return `
		<div class="omnibox-row flex items-center gap-3 px-3 py-2 cursor-pointer bg-[var(--white-05)]" data-row-id="ai-ask">
			<i data-lucide="sparkles" class="h-4 w-4 text-[var(--main)] flex-shrink-0"></i>
			<div class="flex-1 min-w-0">
				<div class="text-sm text-[var(--text)] truncate">Ask AI: ${escPrompt}</div>
				<div class="text-xs text-[var(--proto)]">Press Enter to ask · ${providerHost}</div>
			</div>
		</div>
	`;
}

export function renderAINotConfigured(deps: Pick<AIModeDeps, 'protocols' | 'onClose'>): string {
	const html = `
		<div class="px-3 py-3">
			<div class="text-sm text-[var(--text)] mb-2">AI provider not configured.</div>
			<div class="text-xs text-[var(--proto)] mb-3">Open Settings to add an OpenAI-compatible endpoint.</div>
			<button class="omnibox-ai-open-settings px-3 py-1 text-xs rounded bg-[var(--main)] text-white">Open Settings</button>
		</div>
	`;
	return html;
}

export async function startAIStream(
	deps: AIModeDeps,
	abort: AbortController,
): Promise<void> {
	const { dropdown, prompt, aiClient } = deps;
	const escPrompt = prompt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	dropdown.innerHTML = `
		<div class="omnibox-ai-panel p-3 space-y-3">
			<div class="omnibox-ai-prompt rounded bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--proto)]">${escPrompt}</div>
			<div class="omnibox-ai-response rounded bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text)] whitespace-pre-wrap"></div>
			<div class="omnibox-ai-status flex justify-end gap-2 text-xs text-[var(--proto)]">
				<button class="omnibox-ai-stop px-2 py-1 rounded bg-[var(--bg-1)] border border-[var(--white-10)]">Stop</button>
			</div>
		</div>
	`;
	const responseEl = dropdown.querySelector('.omnibox-ai-response') as HTMLDivElement;
	const statusEl = dropdown.querySelector('.omnibox-ai-status') as HTMLDivElement;
	const stopBtn = dropdown.querySelector('.omnibox-ai-stop') as HTMLButtonElement;
	stopBtn?.addEventListener('mousedown', (ev) => {
		ev.preventDefault();
		abort.abort();
	});

	let accumulated = '';
	try {
		for await (const delta of aiClient.stream(prompt, abort.signal)) {
			if (abort.signal.aborted) break;
			accumulated += delta;
			responseEl.textContent = accumulated;
		}
		statusEl.innerHTML = `
			<button class="omnibox-ai-copy px-2 py-1 rounded bg-[var(--bg-1)] border border-[var(--white-10)]">Copy</button>
			<button class="omnibox-ai-new px-2 py-1 rounded bg-[var(--bg-1)] border border-[var(--white-10)]">New question</button>
		`;
		const copyBtn = statusEl.querySelector('.omnibox-ai-copy') as HTMLButtonElement;
		const newBtn = statusEl.querySelector('.omnibox-ai-new') as HTMLButtonElement;
		copyBtn?.addEventListener('mousedown', (ev) => {
			ev.preventDefault();
			void navigator.clipboard.writeText(accumulated).catch(() => {});
		});
		newBtn?.addEventListener('mousedown', (ev) => {
			ev.preventDefault();
			deps.onClose();
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		statusEl.innerHTML = `
			<div class="text-red-400">${msg.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>
			<button class="omnibox-ai-retry px-2 py-1 rounded bg-[var(--bg-1)] border border-[var(--white-10)]">Retry</button>
		`;
	}
}
```

- [ ] **Step C5.2: Wire into `Omnibox.render`**

In `src/browser/omnibox/index.ts`, add this branch in `render`:

```ts
if (this.currentMode === 'ai') {
	const ai = await import('./modes/ai');
	const prompt = this.payloadFor('ai');
	if (!prompt.trim()) {
		this.dropdown.innerHTML = ai.renderAIPromptHint();
		this.currentRows = [];
		return;
	}
	if (!this.deps.aiClient.isConfigured()) {
		this.dropdown.innerHTML = ai.renderAINotConfigured({
			protocols: this.deps.protocols,
			onClose: () => this.close(),
		});
		const btn = this.dropdown.querySelector('.omnibox-ai-open-settings');
		btn?.addEventListener('mousedown', (ev) => {
			ev.preventDefault();
			void this.deps.protocols.navigate('ddx://settings');
			this.close();
		});
		this.currentRows = [];
		return;
	}
	this.dropdown.innerHTML = ai.renderAIPromptPrimary({
		prompt,
		aiClient: this.deps.aiClient,
		protocols: this.deps.protocols,
		dropdown: this.dropdown,
		onClose: () => this.close(),
	});
	this.currentRows = [{
		id: 'ai-ask',
		label: `Ask AI: ${prompt}`,
		onSelect: async () => {
			const abort = new AbortController();
			this.currentAbort = abort;
			await ai.startAIStream({
				prompt,
				aiClient: this.deps.aiClient,
				protocols: this.deps.protocols,
				dropdown: this.dropdown,
				onClose: () => this.close(),
			}, abort);
		},
	}];
	this.selectedRowId = 'ai-ask';
	return;
}
```

- [ ] **Step C5.3: Typecheck + run tests**

Run: `npx tsc -p tsconfig.build.json --noEmit && npm test`
Expected: 90 tests pass; tsc clean.

---

### Task C6: Seed `CommandRegistry` from keybinds + protocols + built-ins

**Files:**
- Modify: `src/apis/commands.ts`
- Modify: `src/index.tsx`

- [ ] **Step C6.1: Add seed methods to `CommandRegistry`**

In `src/apis/commands.ts`, add three methods to the `CommandRegistry` class (after `clear()`):

```ts
seedFromKeybinds(deps: SeedFromKeybindsDeps): void {
	const { keybinds, formatKeybind, tabs, protocols, devTools, settings } = deps;
	for (const [id, kb] of Object.entries(keybinds)) {
		this.register({
			id: `kb-${id}`,
			label: kb.description,
			category: kb.category,
			source: 'keybind',
			shortcut: formatKeybind(kb),
			action: () => dispatchKeybindAction(kb.action, { tabs, protocols, devTools, settings }),
		});
	}
}

seedFromProtocols(routes: Array<{ proto: string; path: string }>, navigate: (url: string) => void | Promise<void>): void {
	for (const r of routes) {
		if (r.path === '*') continue;
		this.register({
			id: `proto-${r.proto}-${r.path}`,
			label: `Open ${r.proto}://${r.path}`,
			category: 'internal',
			source: 'protocol',
			icon: 'box',
			action: () => navigate(`${r.proto}://${r.path}`),
		});
	}
}

seedBuiltins(deps: SeedBuiltinsDeps): void {
	const { tabs, protocols } = deps;
	const builtins: Command[] = [
		{ id: 'bi-settings', label: 'Open Settings', category: 'navigation', source: 'builtin', icon: 'settings', action: () => protocols.navigate('ddx://settings') },
		{ id: 'bi-bookmarks', label: 'Open Bookmarks', category: 'navigation', source: 'builtin', icon: 'star', action: () => protocols.navigate('ddx://bookmarks') },
		{ id: 'bi-history', label: 'Open History', category: 'navigation', source: 'builtin', icon: 'history', action: () => protocols.navigate('ddx://history') },
		{ id: 'bi-extensions', label: 'Open Extensions', category: 'navigation', source: 'builtin', icon: 'puzzle', action: () => protocols.navigate('ddx://extensions') },
		{ id: 'bi-newtab', label: 'New tab', category: 'tabs', source: 'builtin', icon: 'plus', action: () => { void tabs.createTab('ddx://newtab/'); } },
		{ id: 'bi-close', label: 'Close current tab', category: 'tabs', source: 'builtin', icon: 'x', action: () => { void tabs.closeCurrentTab(); } },
		{ id: 'bi-reload', label: 'Reload current tab', category: 'tabs', source: 'builtin', icon: 'rotate-cw', action: () => { if (tabs.activeTabId) tabs.refreshTab(tabs.activeTabId); } },
	];
	for (const cmd of builtins) this.register(cmd);
}
```

Add the supporting types and helper at the TOP of the file (above `class CommandRegistry`):

```ts
import type { KeybindConfig } from '@browser/functions/keybinds';
import type { Tabs } from '@browser/tabs';
import type { Protocols } from '@browser/protocols';

export interface SeedFromKeybindsDeps {
	keybinds: Record<string, KeybindConfig>;
	formatKeybind: (kb: KeybindConfig) => string;
	tabs: Tabs;
	protocols: Protocols;
	devTools?: { inspectElement?: () => void };
	settings?: { getItem<T>(key: string): Promise<T | null> };
}

export interface SeedBuiltinsDeps {
	tabs: Tabs;
	protocols: Protocols;
}

function dispatchKeybindAction(
	action: string,
	deps: { tabs: Tabs; protocols: Protocols; devTools?: SeedFromKeybindsDeps['devTools']; settings?: SeedFromKeybindsDeps['settings'] },
): void {
	const { tabs, protocols } = deps;
	switch (action) {
		case 'newTab': void tabs.createTab('ddx://newtab/'); return;
		case 'closeTab': void tabs.closeCurrentTab(); return;
		case 'reopenTab': void tabs.reopenClosedTab(); return;
		case 'duplicateTab': if (tabs.activeTabId) tabs.duplicateTab(tabs.activeTabId); return;
		case 'nextTab': tabs.switchToNextTab(); return;
		case 'prevTab': tabs.switchToPreviousTab(); return;
		case 'pinTab': if (tabs.activeTabId) tabs.togglePinTab(tabs.activeTabId); return;
		case 'reload': if (tabs.activeTabId) tabs.refreshTab(tabs.activeTabId); return;
		case 'hardReload': if (tabs.activeTabId) tabs.hardReloadTab(tabs.activeTabId); return;
		case 'goHome': void protocols.navigate('ddx://home'); return;
		case 'openSettings': void protocols.navigate('ddx://settings'); return;
		case 'openHistory': void protocols.navigate('ddx://history'); return;
		case 'openBookmarks': void protocols.navigate('ddx://bookmarks'); return;
		case 'focusAddressBar': {
			const ab = document.querySelector('[data-component="address-bar"]') as HTMLInputElement | null;
			ab?.focus();
			ab?.select();
			return;
		}
		default:
			// Actions without a handler in this dispatcher are no-ops in the command palette.
			// (Most have keyboard-only interactive behaviors that don't translate cleanly to a click.)
			console.warn(`[commands] no command-palette dispatch for keybind action "${action}"`);
	}
}
```

- [ ] **Step C6.2: Seed the registry inside `initializeSystem`**

In `src/index.tsx`, find the line where `tabs` is created (line 179):

```ts
const tabs = new Tabs(proto, swConfig, proxySetting, items, proxy);
```

After all of `tabs.initSplitLayout()`, `tabs.setupVerticalTabsToggle()`, and `tabs.auxiliaryMenus.installHostShellMenus()` have run (so `tabs` is fully ready, around line 191), but BEFORE the Omnibox is instantiated (Phase B's Task B4.4 placement), add:

```ts
{
	const { KeybindManager } = await import('@browser/functions/keybinds');
	const km = new KeybindManager(settingsAPI);
	await km.loadKeybinds();
	commands.seedFromKeybinds({
		keybinds: km.getAllKeybinds(),
		formatKeybind: (kb) => km.formatKeybind(kb),
		tabs,
		protocols: proto,
	});
	commands.seedFromProtocols(proto.listRoutes(), (url) => proto.navigate(url));
	commands.seedBuiltins({ tabs, protocols: proto });
}
```

This block runs once during boot. The `KeybindManager` instance is local to this block — its only purpose is to read the user's current keybinds for the seeding step.

- [ ] **Step C6.3: Typecheck + run tests**

Run: `npx tsc -p tsconfig.build.json --noEmit && npm test`
Expected: 90 tests pass; tsc clean.

---

### Phase C checkpoint

- [ ] All tests green (90).
- [ ] Tsc clean.
- [ ] Manual: dev server, type plain text → default dropdown with primary row + sections renders. Type `>` → command palette renders. Type `@` → engine picker renders. Type `!yt cats` → bang preview row. Type `?hello` → AI hint or "not configured" panel.

---

## Phase D — Settings UI

### Task D1: Add `@` column to search engines panel

**Files:**
- Modify: `src/pages/settings/index.html`
- Modify: `src/pages/settings/index.tsx`

- [ ] **Step D1.1: Add "At" input to the add-form HTML**

In `src/pages/settings/index.html`, find lines 453-457 (the add-form inputs):

```html
                  <input id="search-engines-add-name" type="text" placeholder="Name"
                    class="w-full rounded bg-[var(--bg-1)] border border-[var(--white-10)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--main)]" />
                  <input id="search-engines-add-bang" type="text" placeholder="Bang (without !)"
                    class="w-full rounded bg-[var(--bg-1)] border border-[var(--white-10)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--main)]" />
                  <input id="search-engines-add-url" type="text" placeholder="URL template (must contain %s)"
                    class="w-full rounded bg-[var(--bg-1)] border border-[var(--white-10)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--main)]" />
```

Add a new input BETWEEN the bang and url inputs:

```html
                  <input id="search-engines-add-name" type="text" placeholder="Name"
                    class="w-full rounded bg-[var(--bg-1)] border border-[var(--white-10)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--main)]" />
                  <input id="search-engines-add-bang" type="text" placeholder="Bang (without !) — optional"
                    class="w-full rounded bg-[var(--bg-1)] border border-[var(--white-10)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--main)]" />
                  <input id="search-engines-add-at" type="text" placeholder="At key (without @) — optional"
                    class="w-full rounded bg-[var(--bg-1)] border border-[var(--white-10)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--main)]" />
                  <input id="search-engines-add-url" type="text" placeholder="URL template (must contain %s)"
                    class="w-full rounded bg-[var(--bg-1)] border border-[var(--white-10)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--main)]" />
```

- [ ] **Step D1.2: Update `validateEngineForm`**

In `src/pages/settings/index.tsx`, find `validateEngineForm` (line 1512). Replace the whole function with:

```ts
function validateEngineForm(
  name: string,
  bang: string,
  at: string,
  url: string,
  excludeId: string | null,
):
  | { ok: true; name: string; bang: string; at: string; url: string }
  | { ok: false; error: string } {
  const trimmedName = name.trim();
  const trimmedBang = bang.trim();
  const trimmedAt = at.trim();
  const trimmedUrl = url.trim();
  if (!trimmedName || trimmedName.length > 64) return { ok: false, error: "Name must be 1-64 characters." };
  if (!trimmedBang && !trimmedAt) return { ok: false, error: 'At least one of "bang" or "at" must be set.' };
  if (trimmedBang) {
    if (!/^[A-Za-z0-9._-]+$/.test(trimmedBang) || trimmedBang.length > 16)
      return { ok: false, error: "Bang must be 1-16 chars matching [A-Za-z0-9._-]." };
    const lowerBang = trimmedBang.toLowerCase();
    const bangClash = searchEngineRegistry.list().find((e) => e.bang.toLowerCase() === lowerBang && e.id !== excludeId);
    if (bangClash) return { ok: false, error: `Bang !${trimmedBang} is already used by "${bangClash.name}".` };
  }
  if (trimmedAt) {
    if (!/^[A-Za-z0-9._-]+$/.test(trimmedAt) || trimmedAt.length > 16)
      return { ok: false, error: "At must be 1-16 chars matching [A-Za-z0-9._-]." };
    const lowerAt = trimmedAt.toLowerCase();
    const atClash = searchEngineRegistry.list().find((e) => e.at?.toLowerCase() === lowerAt && e.id !== excludeId);
    if (atClash) return { ok: false, error: `At @${trimmedAt} is already used by "${atClash.name}".` };
  }
  const occurrences = (trimmedUrl.match(/%s/g) || []).length;
  if (occurrences !== 1) return { ok: false, error: 'URL template must contain "%s" exactly once.' };
  try {
    new URL(trimmedUrl.replace("%s", "test"));
  } catch {
    return { ok: false, error: "URL template is not a valid URL after %s substitution." };
  }
  return { ok: true, name: trimmedName, bang: trimmedBang, at: trimmedAt, url: trimmedUrl };
}
```

- [ ] **Step D1.3: Update render-row HTML to show the `at` prefix**

In `src/pages/settings/index.tsx`, find `searchEngineRowHtml` (around line 1632). Replace with:

```ts
function searchEngineRowHtml(e: SearchEngine, isDefault: boolean): string {
  const prefixes: string[] = [];
  if (e.bang) prefixes.push(`!${e.bang}`);
  if (e.at) prefixes.push(`@${e.at}`);
  const prefixDisplay = prefixes.map(escapeHtml).join(' · ');
  return `
    <div class="flex items-center gap-3 bg-[var(--bg-2)] rounded-md px-3 py-2 border border-[var(--white-10)]" data-engine-row="${escapeHtml(e.id)}">
      <input type="radio" name="se-default" value="${escapeHtml(e.id)}" ${isDefault ? "checked" : ""}
        class="accent-[var(--main)]" />
      <div class="flex-1 min-w-0">
        <div class="text-sm text-[var(--text)] truncate">
          ${escapeHtml(e.name)}${e.builtIn ? ' <span class="text-[var(--proto)] text-xs">(default seed)</span>' : ""}
        </div>
        <div class="text-xs text-[var(--proto)] truncate">
          <span class="font-mono">${prefixDisplay}</span> · ${escapeHtml(e.urlTemplate)}
        </div>
      </div>
      <button data-edit-engine="${escapeHtml(e.id)}"
        class="px-2 py-1 text-xs rounded bg-[var(--bg-1)] text-[var(--text)] border border-[var(--white-10)] hover:bg-[var(--white-05)] transition-colors">
        Edit
      </button>
      <button data-remove-engine="${escapeHtml(e.id)}"
        class="px-2 py-1 text-xs rounded bg-[var(--bg-1)] text-[var(--text)] border border-[var(--white-10)] hover:bg-[var(--white-05)] transition-colors">
        Remove
      </button>
    </div>
  `;
}
```

- [ ] **Step D1.4: Update edit-row HTML to include the `at` input**

Find `searchEngineEditRowHtml` (around line 1657). Replace with:

```ts
function searchEngineEditRowHtml(e: SearchEngine): string {
  return `
    <div class="bg-[var(--bg-2)] rounded-md px-3 py-2 border border-[var(--main-35a)] space-y-2" data-engine-row="${escapeHtml(e.id)}">
      <input data-field="name" type="text" placeholder="Name" value="${escapeHtml(e.name)}"
        class="w-full rounded bg-[var(--bg-1)] border border-[var(--white-10)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--main)]" />
      <input data-field="bang" type="text" placeholder="Bang (without !) — optional" value="${escapeHtml(e.bang)}"
        class="w-full rounded bg-[var(--bg-1)] border border-[var(--white-10)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--main)]" />
      <input data-field="at" type="text" placeholder="At key (without @) — optional" value="${escapeHtml(e.at ?? '')}"
        class="w-full rounded bg-[var(--bg-1)] border border-[var(--white-10)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--main)]" />
      <input data-field="url" type="text" placeholder="URL template (must contain %s)" value="${escapeHtml(e.urlTemplate)}"
        class="w-full rounded bg-[var(--bg-1)] border border-[var(--white-10)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--main)]" />
      <div data-field="error" class="hidden text-xs text-red-400"></div>
      <div class="flex gap-2 justify-end">
        <button data-cancel-engine="${escapeHtml(e.id)}"
          class="px-3 py-1 text-xs rounded-md bg-[var(--bg-1)] text-[var(--text)] border border-[var(--white-10)] hover:bg-[var(--white-05)] transition-colors">
          Cancel
        </button>
        <button data-save-engine="${escapeHtml(e.id)}"
          class="px-3 py-1 text-xs rounded-md bg-[var(--main)] text-white hover:opacity-90 transition-opacity">
          Save
        </button>
      </div>
    </div>
  `;
}
```

- [ ] **Step D1.5: Update all `validateEngineForm` call sites to pass the new `at` argument**

There are three call sites. Find each and update:

**Call site 1** (around line 1608, inside `renderSearchEnginesTable`'s save-button handler):

Old:
```ts
const rawName = (row.querySelector('[data-field="name"]') as HTMLInputElement).value;
const rawBang = (row.querySelector('[data-field="bang"]') as HTMLInputElement).value;
const rawUrl = (row.querySelector('[data-field="url"]') as HTMLInputElement).value;
const errEl = row.querySelector('[data-field="error"]') as HTMLDivElement;
const result = validateEngineForm(rawName, rawBang, rawUrl, id);
```

New:
```ts
const rawName = (row.querySelector('[data-field="name"]') as HTMLInputElement).value;
const rawBang = (row.querySelector('[data-field="bang"]') as HTMLInputElement).value;
const rawAt = (row.querySelector('[data-field="at"]') as HTMLInputElement).value;
const rawUrl = (row.querySelector('[data-field="url"]') as HTMLInputElement).value;
const errEl = row.querySelector('[data-field="error"]') as HTMLDivElement;
const result = validateEngineForm(rawName, rawBang, rawAt, rawUrl, id);
```

And the `searchEngineRegistry.update(id, ...)` call:

Old:
```ts
await searchEngineRegistry.update(id, {
  name: result.name,
  bang: result.bang,
  urlTemplate: result.url,
});
```

New:
```ts
await searchEngineRegistry.update(id, {
  name: result.name,
  bang: result.bang,
  at: result.at || undefined,
  urlTemplate: result.url,
});
```

**Call site 2** (around line 1702, inside `startEditEngine`'s save handler): same pattern. Update `rawAt` extraction and the `update` call identically.

**Call site 3** (around line 1740, inside `initializeSearchEnginesAddForm`'s save handler):

Old:
```ts
const result = validateEngineForm(nameEl.value, bangEl.value, urlEl.value, null);
```

Replace with — first add the `atEl` reference at the top of the function, alongside the other `getElementById` lookups:

```ts
const atEl = document.getElementById("search-engines-add-at") as HTMLInputElement | null;
```

Then update the null-check at the start:

```ts
if (!toggle || !form || !cancel || !save || !errEl || !nameEl || !bangEl || !atEl || !urlEl) return;
```

The cancel handler:

```ts
cancel.addEventListener("click", () => {
  form.classList.add("hidden");
  nameEl.value = "";
  bangEl.value = "";
  atEl.value = "";
  urlEl.value = "";
  errEl.classList.add("hidden");
});
```

The save handler:

```ts
save.addEventListener("click", async () => {
  const result = validateEngineForm(nameEl.value, bangEl.value, atEl.value, urlEl.value, null);
  if (!result.ok) {
    errEl.textContent = result.error;
    errEl.classList.remove("hidden");
    return;
  }
  await searchEngineRegistry.add({
    name: result.name,
    bang: result.bang,
    at: result.at || undefined,
    urlTemplate: result.url,
  });
  broadcastSearchEnginesUpdate();
  form.classList.add("hidden");
  nameEl.value = "";
  bangEl.value = "";
  atEl.value = "";
  urlEl.value = "";
  errEl.classList.add("hidden");
  renderSearchEnginesTable();
});
```

- [ ] **Step D1.6: Typecheck + run tests**

Run: `npx tsc -p tsconfig.build.json --noEmit && npm test`
Expected: 90 tests pass; tsc clean.

---

### Task D2: AI panel

**Files:**
- Modify: `src/pages/settings/index.html`
- Modify: `src/pages/settings/index.tsx`

- [ ] **Step D2.1: Add AI panel card to HTML**

In `src/pages/settings/index.html`, find the closing `</div>` of the search-engines panel card (right after the `search-engines-add-row` block, somewhere around line 470). Add immediately AFTER that closing `</div>` (still inside `<section id="Search">`):

```html
            <div class="bg-[var(--bg-1)] rounded-xl p-6 ring-1 ring-inset ring-[var(--white-08)] backdrop-blur">
              <div class="mb-3">
                <h3 class="text-sm font-medium text-[var(--text)]">AI assistant</h3>
                <p class="text-xs text-[var(--proto)] mt-1">
                  Configure an OpenAI-compatible chat completions endpoint to use the <code class="text-[var(--text)] bg-[var(--bg-2)] px-1 rounded">?</code> prefix in the address bar.
                </p>
              </div>
              <div class="space-y-3">
                <div>
                  <label class="text-xs text-[var(--proto)] block mb-1">Provider URL</label>
                  <input id="ai-provider-url" type="url" placeholder="https://api.openai.com/v1"
                    class="w-full rounded bg-[var(--bg-2)] border border-[var(--white-10)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--main)]" />
                </div>
                <div>
                  <label class="text-xs text-[var(--proto)] block mb-1">API key</label>
                  <input id="ai-api-key" type="password" placeholder="sk-..."
                    class="w-full rounded bg-[var(--bg-2)] border border-[var(--white-10)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--main)]" />
                </div>
                <div>
                  <label class="text-xs text-[var(--proto)] block mb-1">Model</label>
                  <input id="ai-model" type="text" placeholder="gpt-3.5-turbo"
                    class="w-full rounded bg-[var(--bg-2)] border border-[var(--white-10)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--main)]" />
                </div>
                <div class="flex items-center justify-between">
                  <label class="text-xs text-[var(--text)]" for="ai-streaming">Streaming responses</label>
                  <input id="ai-streaming" type="checkbox" class="accent-[var(--main)]" checked />
                </div>
                <div class="flex items-center gap-2">
                  <button id="ai-test"
                    class="px-3 py-1.5 text-xs rounded-md bg-[var(--bg-2)] text-[var(--text)] border border-[var(--white-10)] hover:bg-[var(--white-05)] transition-colors">
                    Test connection
                  </button>
                  <div id="ai-test-result" class="text-xs"></div>
                </div>
              </div>
            </div>
```

- [ ] **Step D2.2: Add wiring in TSX**

In `src/pages/settings/index.tsx`, add the following function block AFTER `initializeSearchEnginesUI` (around line 1745, find the end of `initializeSearchEnginesUI` and insert after):

```ts
function broadcastAIConfigUpdate() {
  window.opener?.postMessage({ type: "ai-config-updated" }, "*");
}

async function initializeAIPanel() {
  const urlEl = document.getElementById("ai-provider-url") as HTMLInputElement | null;
  const keyEl = document.getElementById("ai-api-key") as HTMLInputElement | null;
  const modelEl = document.getElementById("ai-model") as HTMLInputElement | null;
  const streamEl = document.getElementById("ai-streaming") as HTMLInputElement | null;
  const testBtn = document.getElementById("ai-test") as HTMLButtonElement | null;
  const testResultEl = document.getElementById("ai-test-result") as HTMLDivElement | null;
  if (!urlEl || !keyEl || !modelEl || !streamEl || !testBtn || !testResultEl) return;

  // Load existing values
  urlEl.value = (await settingsAPI.getItem<string>("aiProviderUrl")) ?? "";
  keyEl.value = (await settingsAPI.getItem<string>("aiApiKey")) ?? "";
  modelEl.value = (await settingsAPI.getItem<string>("aiModel")) ?? "";
  const streamingStored = await settingsAPI.getItem<unknown>("aiStreaming");
  streamEl.checked = streamingStored === undefined || streamingStored === null ? true : !!streamingStored;

  const persist = async () => {
    await settingsAPI.setItem("aiProviderUrl", urlEl.value);
    await settingsAPI.setItem("aiApiKey", keyEl.value);
    await settingsAPI.setItem("aiModel", modelEl.value);
    await settingsAPI.setItem("aiStreaming", streamEl.checked);
    broadcastAIConfigUpdate();
  };

  urlEl.addEventListener("change", persist);
  keyEl.addEventListener("change", persist);
  modelEl.addEventListener("change", persist);
  streamEl.addEventListener("change", persist);

  testBtn.addEventListener("click", async () => {
    testResultEl.textContent = "Testing…";
    testResultEl.className = "text-xs text-[var(--proto)]";
    // Persist current values first so the test uses them
    await persist();
    // The settings popup runs in its own window with its own AIClient instance.
    // We construct a throwaway one here using the page's settings.
    const { AIClient } = await import("@apis/ai");
    const client = new AIClient(settingsAPI);
    await client.reloadConfig();
    const result = await client.test();
    if (result.ok) {
      testResultEl.textContent = "✓ Connected";
      testResultEl.className = "text-xs text-green-400";
    } else {
      testResultEl.textContent = `✗ ${result.error}`;
      testResultEl.className = "text-xs text-red-400";
    }
  });
}
```

- [ ] **Step D2.3: Call `initializeAIPanel` in the bottom DOMContentLoaded handler**

In `src/pages/settings/index.tsx`, find the bottom DOMContentLoaded handler (around line 1875). Update it from:

```ts
document.addEventListener("DOMContentLoaded", async () => {
  await keybindManager.loadKeybinds();
  initializeKeybindsUI();
  await searchEngineRegistry.load();
  initializeSearchEnginesUI();
});
```

To:

```ts
document.addEventListener("DOMContentLoaded", async () => {
  await keybindManager.loadKeybinds();
  initializeKeybindsUI();
  await searchEngineRegistry.load();
  initializeSearchEnginesUI();
  await initializeAIPanel();
});
```

- [ ] **Step D2.4: Typecheck + run tests**

Run: `npx tsc -p tsconfig.build.json --noEmit && npm test`
Expected: 90 tests pass; tsc clean.

---

### Task D3: Commands panel (read-only list)

**Files:**
- Modify: `src/pages/settings/index.html`
- Modify: `src/pages/settings/index.tsx`

- [ ] **Step D3.1: Add Commands panel card to HTML**

In `src/pages/settings/index.html`, find the closing `</div>` of `keybinds-container` (around line 610). Add immediately AFTER that closing `</div>` (still inside `<section id="Keybinds">`):

```html
          <div class="bg-[var(--bg-1)] rounded-xl p-6 ring-1 ring-inset ring-[var(--white-08)] backdrop-blur mt-6">
            <div class="mb-3">
              <h3 class="text-sm font-medium text-[var(--text)]">Available commands</h3>
              <p class="text-xs text-[var(--proto)] mt-1">
                Type <code class="text-[var(--text)] bg-[var(--bg-2)] px-1 rounded">&gt;</code> in the address bar to search and run any of these. Custom commands coming later.
              </p>
            </div>
            <input id="commands-filter" type="text" placeholder="Filter commands…"
              class="w-full rounded bg-[var(--bg-2)] border border-[var(--white-10)] px-2 py-1 text-xs text-[var(--text)] mb-3 focus:outline-none focus:ring-2 focus:ring-[var(--main)]" />
            <div id="commands-list" class="space-y-2"></div>
          </div>
```

- [ ] **Step D3.2: Add wiring in TSX**

In `src/pages/settings/index.tsx`, add the following function AFTER `initializeAIPanel` (added in D2.2):

```ts
function initializeCommandsPanel() {
  const listEl = document.getElementById("commands-list") as HTMLDivElement | null;
  const filterEl = document.getElementById("commands-filter") as HTMLInputElement | null;
  if (!listEl || !filterEl) return;
  const w = window as unknown as { opener?: Window & { commands?: import("@apis/commands").CommandRegistry } };
  const registry = w.opener?.commands;
  if (!registry) {
    listEl.innerHTML = `<div class="text-xs text-[var(--proto)]">Command registry not available (main window closed).</div>`;
    return;
  }
  const render = (filter: string) => {
    const matches = filter.trim() ? registry.find(filter, 200) : registry.list();
    if (matches.length === 0) {
      listEl.innerHTML = `<div class="text-xs text-[var(--proto)]">No matching commands.</div>`;
      return;
    }
    const grouped: Record<string, typeof matches> = {};
    for (const cmd of matches) {
      if (!grouped[cmd.category]) grouped[cmd.category] = [];
      grouped[cmd.category].push(cmd);
    }
    listEl.innerHTML = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, cmds]) => `
        <div class="space-y-1">
          <div class="text-xs text-[var(--proto)] uppercase tracking-wide">${escapeHtml(category)}</div>
          ${cmds.map((cmd) => `
            <div class="flex items-center gap-3 bg-[var(--bg-2)] rounded-md px-3 py-2 border border-[var(--white-10)]">
              <div class="flex-1 min-w-0">
                <div class="text-sm text-[var(--text)] truncate">${escapeHtml(cmd.label)}</div>
                ${cmd.shortcut ? `<div class="text-xs text-[var(--proto)] font-mono">${escapeHtml(cmd.shortcut)}</div>` : ''}
              </div>
              <div class="text-xs text-[var(--proto)]">${escapeHtml(cmd.source)}</div>
            </div>
          `).join('')}
        </div>
      `)
      .join('');
  };
  render("");
  filterEl.addEventListener("input", () => render(filterEl.value));
}
```

- [ ] **Step D3.3: Call `initializeCommandsPanel` in DOMContentLoaded**

Update the bottom handler (which Task D2.3 already extended):

```ts
document.addEventListener("DOMContentLoaded", async () => {
  await keybindManager.loadKeybinds();
  initializeKeybindsUI();
  await searchEngineRegistry.load();
  initializeSearchEnginesUI();
  await initializeAIPanel();
  initializeCommandsPanel();
});
```

- [ ] **Step D3.4: Typecheck + run tests**

Run: `npx tsc -p tsconfig.build.json --noEmit && npm test`
Expected: 90 tests pass; tsc clean.

---

### Phase D checkpoint

- [ ] Tests green (90).
- [ ] Tsc clean.
- [ ] Manual (settings popup): search-engines panel shows new "At" input in the add-form; existing engines render with `!bang · @at` prefix display; AI panel renders all four inputs + test button; Commands panel renders a grouped read-only list.

---

## Phase E — Final wiring + smoke + cleanup

### Task E1: Verify message-sync wiring end-to-end

- [ ] **Step E1.1: Smoke-test cross-frame sync (manual)**

Run `npm run dev`. With the dev server up:

1. Open the browser shell. Open devtools console.
2. Confirm `window.searchEngines`, `window.commands`, `window.aiClient`, `window.omnibox` all exist.
3. Run `window.aiClient.getConfig()` — should return `{ url: '', apiKey: '', model: 'gpt-3.5-turbo', streaming: true }` (or whatever was previously saved).
4. Open settings (`ddx://settings`), navigate to the AI panel.
5. Fill in URL `https://api.openai.com/v1`, set a fake key, change the model. Tab out of each input (triggers `change`).
6. Back in the main window devtools, run `window.aiClient.getConfig()` — should reflect the new values within a frame or two (postMessage roundtrip).
7. In settings, change a search engine's `at` field, save.
8. Back in main window, run `window.searchEngines.list().find(e => e.bang === 'g').at` — should reflect the new value.

If any of these don't sync, the message listener in `src/index.tsx` is wrong — re-verify Task B4.3.

---

### Task E2: Manual smoke checklist (per spec)

Execute every step from `docs/superpowers/specs/2026-05-25-omnibox-rework-design.md` § Testing → Manual smoke checklist. There are 24 numbered items. The complete list:

- [ ] **Step E2.1**: Boot fresh profile; address bar dropdown closed.
- [ ] **Step E2.2**: Click address bar; nothing changes (empty input, dropdown stays closed).
- [ ] **Step E2.3**: Type "hello" → dropdown opens anchored under bar, primary row "Search DuckDuckGo for: hello", search-suggestions section populates within ~300ms.
- [ ] **Step E2.4**: Type until history/bookmark match → those sections appear.
- [ ] **Step E2.5**: ↓ moves through all rows across sections, ↑ moves back, Enter on a row activates that row.
- [ ] **Step E2.6**: Type "ddx" → "Internal pages" section shows ddx://newtab, ddx://home, ddx://settings, etc.
- [ ] **Step E2.7**: Esc closes dropdown, focus stays in input.
- [ ] **Step E2.8**: Type "https://example.com" → primary row says "Go to: https://example.com"; Enter navigates.
- [ ] **Step E2.9**: Type "!yt cats" → preview row "Search YouTube for: cats"; Enter navigates to YouTube.
- [ ] **Step E2.10**: Type "@yt cats" → same preview row; Enter navigates.
- [ ] **Step E2.11**: Type "@yt " (with space) → query is empty → row shows "Search YouTube for: " (no preview crash).
- [ ] **Step E2.12**: Type "@" alone → engine picker shows all engines with `at` set.
- [ ] **Step E2.13**: Type ">" alone → command palette shows all commands grouped.
- [ ] **Step E2.14**: Type "> close" → fuzzy matches narrow to close-related commands.
- [ ] **Step E2.15**: Enter on "Close current tab" → active tab closes, dropdown closes.
- [ ] **Step E2.16**: Type "?" alone → hint row "Type your question after `?`...".
- [ ] **Step E2.17**: Set up AI config in settings, type "? what is 2+2" → primary row, then Enter → response panel streams.
- [ ] **Step E2.18**: Esc mid-stream → stops cleanly, partial response stays.
- [ ] **Step E2.19**: Click outside → dropdown closes after ~150ms.
- [ ] **Step E2.20**: Open settings, change DuckDuckGo's `at` field to "duck" → save → return to main window, type "@duck cats" → works.
- [ ] **Step E2.21**: Open settings → AI panel → click "Test connection" with valid config → ✓ inline.
- [ ] **Step E2.22**: Open settings → Commands panel → renders all commands grouped, search input filters.
- [ ] **Step E2.23**: Reload main window → all settings persist, all modes still work.
- [ ] **Step E2.24**: Existing protocol behavior unaffected: `ddx://newtab`, `ddx://home`, custom newtab/home settings still work end-to-end.

If any step fails, capture the failure and file as a follow-up task. Do NOT proceed to E3 with any RED smoke step unless explicitly accepted.

---

### Task E3: Final code review (subagent)

Per the subagent-driven-development workflow's "final review" step.

- [ ] **Step E3.1: Dispatch a final reviewer**

Reviewer prompt should cover:
- Boot order soundness (all globals available when referenced).
- Cross-frame sync correctness (all three event types).
- Coverage assessment vs. risk.
- Spec adherence accounting for documented deviations.
- Recommended follow-ups (non-blocking).

Use the same pattern as the prior protocols-search-registers final review.

---

### Task E4: Squash and commit

Per user instruction: **one big commit**.

- [ ] **Step E4.1: Verify clean working tree**

Run: `git status --short`
Expected: only intended changes from this branch are tracked-modified or new.

- [ ] **Step E4.2: Squash-commit**

If implemented as a sequence of internal commits during execution, squash them into one:

```bash
git reset --soft <base-sha-before-phase-A>
git add -A
git commit -m "Omnibox rework: command palette, @engine prefix, AI mode, live suggestions

Replaces the disabled floating search overlay with an anchored, multi-mode
address-bar dropdown.

- New SearchEngine.at field (settings registry gains an @ namespace).
- New parseAtPrefix (sibling of parseBang).
- New CommandRegistry + AIClient (OpenAI-compatible chat completions, SSE).
- New Omnibox class with dispatch on first non-whitespace char:
  '>' command palette / '@' engine prefix / '!' bang preview /
  '?' AI mode / default mixed-section omnibox.
- Default mode: primary action row + open tabs / history / bookmarks /
  internal pages / search suggestions (all with parallel fan-out + abort).
- Protocols gain listRoutes() snapshot; Tabs gain searchOpen() filter.
- Settings UI: @ column on engines panel, AI configuration panel,
  read-only Commands panel.
- Cross-frame sync via ai-config-updated and commands-updated postMessages.
- Replaces commented-out Search block; deletes src/browser/search/ and
  src/browser/search.ts (~1500 lines of dead code).
- 90 tests across 7 vitest files; full manual smoke checklist passed.

Spec: docs/superpowers/specs/2026-05-25-omnibox-rework-design.md
Plan: docs/superpowers/plans/2026-05-25-omnibox-rework.md"
```

If implemented in a single subagent session with no internal commits, the final state will already be a single uncommitted diff — just stage and commit.

- [ ] **Step E4.3: Verify the commit**

Run: `git log --oneline -3 && git show HEAD --stat | tail -20`
Expected: one new commit at HEAD covering all the changes.

---

## Done criteria

- All vitest tests pass: `npm test` → 90/90, exit 0.
- `npx tsc -p tsconfig.build.json --noEmit` → zero errors.
- Manual smoke checklist (Task E2) completed end-to-end with no RED items.
- One squash commit on the working branch with the message above.

---

## Open questions resolved during execution

- **AI hint deep-link to settings subsection**: per spec § Open questions, v1 just opens `ddx://settings` and the user scrolls to the AI card. No fragment handling.
- **KeybindManager dispatch reuse**: `CommandRegistry.seedFromKeybinds` mirrors the dispatch table inside `dispatchKeybindAction` (Task C6.1) rather than refactoring `KeyboardManager`. Documented as such.
- **HistoryManager singleton**: pulled via `tabs.getHistoryManager()` (existing accessor, returns the singleton via `HistoryManager.getInstance()`).
- **AI Test Connection button**: constructs a throwaway `AIClient` against the settings popup's own `SettingsAPI` (the popup has its own NightFS handle but they share the underlying file). Settings written by D2's `persist()` run BEFORE the test, so the test sees the current form values. CORS / SW behavior: `api/results/` is SW-bypassed; AI endpoints are not SW-intercepted by default (SW only handles `/~/` proxy paths). If the test request is blocked by the SW in practice, routing through main-window postMessage is the fallback — file a follow-up.
