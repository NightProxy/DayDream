import { Logger } from '@apis/logging';
import type { KeybindConfig } from '@browser/functions/keybinds';
import type { Tabs } from '@browser/tabs';
import type { Protocols } from '@browser/protocols';

export interface SeedFromKeybindsDeps {
	keybinds: Record<string, KeybindConfig>;
	formatKeybind: (kb: KeybindConfig) => string;
	tabs: Tabs;
	protocols: Protocols;
}

export interface SeedBuiltinsDeps {
	tabs: Tabs;
	protocols: Protocols;
}

function dispatchKeybindAction(
	action: string,
	deps: { tabs: Tabs; protocols: Protocols },
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
			console.warn(`[commands] no command-palette dispatch for keybind action "${action}"`);
	}
}

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

	// Lazy because `new Logger()` constructs a NightFS instance, which calls
	// `navigator.storage.getDirectory()`. That isn't available in jsdom (the
	// test runtime) or any other non-browser context. Eager init would crash
	// every test that instantiates a registry; lazy init defers the side
	// effect until a code path actually needs to log.
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
			// Best-effort log; tolerate Logger init failure (e.g., non-browser env).
			try {
				const logResult = this.getLogger().createLog(`[commands] unknown id "${id}"`);
				logResult?.catch?.(() => {});
			} catch {
				/* ignore */
			}
			return;
		}
		try {
			await cmd.action();
		} catch (err) {
			console.warn(`[commands] action "${id}" failed:`, err);
			// Best-effort log; tolerate Logger init failure (e.g., non-browser env).
			try {
				const logResult = this.getLogger().createLog(`[commands] action "${id}" failed: ${err}`);
				logResult?.catch?.(() => {});
			} catch {
				/* ignore */
			}
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

	clearBySource(source: CommandSource): void {
		for (const [id, cmd] of this.commands.entries()) {
			if (cmd.source === source) this.commands.delete(id);
		}
		this.notify();
	}

	seedFromKeybinds(deps: SeedFromKeybindsDeps): void {
		const { keybinds, formatKeybind, tabs, protocols } = deps;
		for (const [id, kb] of Object.entries(keybinds)) {
			this.register({
				id: `kb-${id}`,
				label: kb.description,
				category: kb.category,
				source: 'keybind',
				shortcut: formatKeybind(kb),
				action: () => dispatchKeybindAction(kb.action, { tabs, protocols }),
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

	private notify(): void {
		for (const fn of this.listeners) {
			try { fn(); } catch (err) { console.warn('[commands] onChange handler threw:', err); }
		}
	}
}
