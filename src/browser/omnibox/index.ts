import type { Proxy } from '@apis/proxy';
import type { Protocols } from '@browser/protocols';
import type { Tabs } from '@browser/tabs';
import type { SearchEngineRegistry } from '@apis/searchEngines';
import type { CommandRegistry } from '@apis/commands';
import { Logger } from '@apis/logging';
import { dispatch } from './dispatch';
import type { OmniboxMode, OmniboxRow, DispatchResult } from './types';

export interface OmniboxDeps {
	input: HTMLInputElement;
	proxy: Proxy;
	protocols: Protocols;
	tabs: Tabs;
	searchEngines: SearchEngineRegistry;
	commands: CommandRegistry;
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
	private currentDispatch: DispatchResult | null = null;
	private currentExtensionKeyword: string | null = null;
	/**
	 * Token incremented every time the extension mode renders. Used
	 * to guard stale re-render callbacks scheduled from previous
	 * renders (e.g. async-suggest arrived but the user has since
	 * typed something new). Compared in the rerender closure.
	 */
	private extensionRerenderToken = 0;
	/**
	 * Unsubscribe handle for the current OmniboxRegistry.onChange
	 * subscription. Cleared and re-subscribed every render of the
	 * extension mode; explicitly torn down when the mode changes.
	 */
	private extensionRegistryUnsub: (() => void) | null = null;

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
		this.input.addEventListener('keydown', this.onKeyDown, { capture: true });
	}

	detach(): void {
		this.input.removeEventListener('focus', this.onFocus);
		this.input.removeEventListener('blur', this.onBlur);
		this.input.removeEventListener('input', this.onInput);
		this.input.removeEventListener('keydown', this.onKeyDown, { capture: true });
		this.dropdown.remove();
	}

	// @ts-expect-error Phase B scaffolding — Phase C error paths will use `getLogger`.
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
		if (this.input.value.trim()) {
			void this.handleInput();
		}
	};

	private onBlur = () => {
		if (this.blurTimeout) clearTimeout(this.blurTimeout);
		this.blurTimeout = window.setTimeout(() => {
			this.close();
		}, 150);
	};

	private onInput = () => {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = window.setTimeout(() => {
			void this.handleInput();
		}, 150);
	};

	private onKeyDown = (e: KeyboardEvent) => {
		if (this.currentMode === 'closed') return;
		if (e.key === 'Escape') {
			e.preventDefault();
			(e as any).__omniboxConsumed = true;
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
				(e as any).__omniboxConsumed = true;
				const row = this.currentRows.find((r) => r.id === this.selectedRowId);
				if (row) {
					void Promise.resolve(row.onSelect()).catch((err) => {
						console.warn('[omnibox] row select failed:', err);
					});
					if (!this.shouldKeepOpenAfterSelect()) this.close();
				}
			}
			// If no row selected, fall through to existing legacy Enter handler.
		}
	};

	private async handleInput(): Promise<void> {
		const value = this.input.value;
		const result = dispatch(value);
		this.currentDispatch = result;
		this.currentMode = result.mode;
		this.currentRows = [];
		this.selectedRowId = null;
		// chrome.omnibox.onInputStarted: fire once per entry into extension mode.
		if (result.mode === 'extension' && result.extension) {
			if (this.currentExtensionKeyword !== result.extension.keyword) {
				this.currentExtensionKeyword = result.extension.keyword;
				try {
					(window as { extensions?: { fireEventOn?: (id: string, m: string, a: unknown[]) => void } }).extensions
						?.fireEventOn?.(result.extension.extId, 'chrome.omnibox.onInputStarted', []);
				} catch (err) {
					console.warn('[omnibox] onInputStarted dispatch failed:', err);
				}
			}
		} else if (this.currentExtensionKeyword) {
			// User left extension mode — fire onInputCancelled on the last ext.
			try {
				(window as { extensions?: { fireEventOn?: (id: string, m: string, a: unknown[]) => void } }).extensions
					?.fireEventOn?.(this.findExtIdForKeyword(this.currentExtensionKeyword) ?? '', 'chrome.omnibox.onInputCancelled', []);
			} catch (err) {
				console.warn('[omnibox] onInputCancelled dispatch failed:', err);
			}
			this.currentExtensionKeyword = null;
		}
		if (result.mode === 'closed') {
			this.close();
			return;
		}
		this.open();
		await this.render();
	}

	private findExtIdForKeyword(_kw: string): string | null {
		// We don't track the extId across dispatches separately — read
		// from the registry. Returns null silently on miss.
		const reg = (window as { extensions?: { omniboxRegistry?: { matchPrefix?: (i: string) => { extId: string } | null } } }).extensions?.omniboxRegistry;
		const m = reg?.matchPrefix?.(_kw);
		return m?.extId ?? null;
	}

	private async render(): Promise<void> {
		if (this.currentMode === 'ai') {
			const ai = await import('./modes/ai');
			const prompt = this.payloadFor('ai');
			if (!prompt.trim()) {
				this.dropdown.innerHTML = ai.renderAIPromptHint();
				this.currentRows = [];
				return;
			}
			// Single-row "Ask Nyx" affordance. Selecting routes through
			// dispatchPrefillAndNavigate, which queues the prompt on
			// the nyxBridge and navigates the active tab to ddx://ai —
			// NyxAI consumes the prefill on handshake completion.
			this.dropdown.innerHTML = ai.renderAskNyxPrimary(prompt);
			this.attachRowListeners();
			this.currentRows = [{
				id: 'ai-ask',
				label: `Ask Nyx: ${prompt}`,
				onSelect: () => {
					this.dispatchPrefillAndNavigate(prompt);
				},
			}];
			this.selectedRowId = 'ai-ask';
			return;
		}
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
		if (this.currentMode === 'extension') {
			const ext = this.currentDispatch?.extension;
			if (!ext) {
				this.dropdown.innerHTML = '<div class="px-3 py-2 text-sm text-[var(--proto)]">No extension keyword</div>';
				return;
			}
			const { renderExtensionMode } = await import('./modes/extension');
			const { rowHtml, sectionHtml } = await import('./ui');
			const extMgr = (window as {
				extensions?: {
					fireEventOn?: (id: string, m: string, a: unknown[]) => void;
					omniboxRegistry?: {
						listSuggestions(extId: string): Array<{ content: string; description: string; deletable?: boolean }>;
						onChange?(listener: (extId: string) => void): () => void;
					};
				};
			}).extensions;
			const fireExtensionsEvent = (event: string, args: unknown[]) => {
				try {
					extMgr?.fireEventOn?.(ext.extId, event, args);
				} catch (err) {
					console.warn('[omnibox] fireEventOn failed:', err);
				}
			};
			// Subscribe to OmniboxRegistry change notifications so
			// async-suggest payloads from the extension's `suggest()`
			// callback trigger a re-render the moment they arrive at
			// the host (no polling, no timeout). Token ensures stale
			// subscriptions from prior renders are no-ops.
			const rerenderToken = ++this.extensionRerenderToken;
			// Clean up the prior subscription, if any.
			if (this.extensionRegistryUnsub) {
				try { this.extensionRegistryUnsub(); } catch { /* noop */ }
				this.extensionRegistryUnsub = null;
			}
			if (extMgr?.omniboxRegistry?.onChange) {
				this.extensionRegistryUnsub = extMgr.omniboxRegistry.onChange((id) => {
					if (id !== ext.extId) return;
					if (this.extensionRerenderToken !== rerenderToken) return;
					void this.render();
				});
			}
			const deps: Parameters<typeof renderExtensionMode>[0] = {
				keyword: ext.keyword,
				rest: ext.rest,
				extId: ext.extId,
				fireEvent: fireExtensionsEvent,
				onNavigate: (url) => this.navigateActive(url),
				listSuggestions: extMgr?.omniboxRegistry
					? (id) => extMgr.omniboxRegistry!.listSuggestions(id)
					: undefined as never,
				requestRerender: () => {
					if (this.extensionRerenderToken !== rerenderToken) return;
					void this.render();
				},
			};
			if (ext.defaultSuggestionDescription) deps.defaultSuggestionDescription = ext.defaultSuggestionDescription;
			const result = renderExtensionMode(deps);
			this.currentRows = [
				...(result.primaryRow ? [result.primaryRow] : []),
				...result.sections.flatMap((s) => s.rows),
			];
			if (!this.selectedRowId && this.currentRows.length > 0) {
				this.selectedRowId = this.currentRows[0]?.id ?? null;
			}
			const primary = result.primaryRow
				? `<div class="omnibox-primary py-1">${rowHtml(result.primaryRow, this.selectedRowId === result.primaryRow.id)}</div>`
				: '<div class="px-3 py-2 text-sm text-[var(--proto)]">Waiting for extension...</div>';
			const sectionsHtml = result.sections.map((s) => sectionHtml(s, this.selectedRowId)).join('');
			this.dropdown.innerHTML = primary + sectionsHtml;
			this.attachRowListeners();
			return;
		}
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
		// Other modes (Tasks C2-C5) will populate this.dropdown.innerHTML directly.
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
		void this.deps.proxy.redirect(this.deps.swConfig as any, this.deps.proxySetting, url, iframe);
	}

	/**
	 * `?`-mode dispatch: queue the prompt on the nyxBridge for the
	 * active iframe, then navigate it to `ddx://ai`. NyxAI's bridge
	 * client picks up the prefill payload from the post-handshake
	 * dispatch and starts a fresh chat.
	 *
	 * The iframe DOM node is the same before and after `protocols.
	 * navigate` (only its `src` changes), so queueing against the
	 * pre-navigation ref reliably hits the right post-handshake
	 * callback. If `window.nyxBridge` isn't initialized for any
	 * reason, we still navigate — NyxAI just opens cold without the
	 * prompt prefilled.
	 */
	private dispatchPrefillAndNavigate(prompt: string): void {
		const trimmed = prompt.trim();
		if (!trimmed) return;
		const iframe = document.querySelector('iframe.active') as HTMLIFrameElement | null;
		const bridge = (window as { nyxBridge?: { queuePrefill?: (i: HTMLIFrameElement, p: { query: string }) => void } }).nyxBridge;
		if (iframe && bridge?.queuePrefill) {
			try {
				bridge.queuePrefill(iframe, { query: trimmed });
			} catch (e) {
				console.warn('[omnibox] nyxBridge.queuePrefill threw:', e);
			}
		} else if (!iframe) {
			console.warn('[omnibox] no active iframe for prefill');
		} else {
			console.warn('[omnibox] nyxBridge not available; navigating without prefill');
		}
		void this.deps.protocols.navigate('ddx://ai/');
		this.close();
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
				if (!this.shouldKeepOpenAfterSelect()) this.close();
			});
		});
	}

	private payloadFor(_: 'command' | 'engine' | 'bang' | 'ai'): string {
		const result = dispatch(this.input.value);
		return result.payload ?? '';
	}

	private selectEngine(atKey: string): void {
		this.input.value = `@${atKey} `;
		this.input.focus();
		this.input.setSelectionRange(this.input.value.length, this.input.value.length);
		void this.handleInput();
	}

	private open(): void {
		this.dropdown.classList.remove('hidden');
	}

	private shouldKeepOpenAfterSelect(): boolean {
		// AI mode rewrites the dropdown into a streaming response panel after
		// the user picks the "Ask AI" row. Closing here would hide the panel.
		return this.currentMode === 'ai';
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
		void this.render();
	}
}
