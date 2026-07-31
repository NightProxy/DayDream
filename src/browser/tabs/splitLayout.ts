import type { TabsInterface } from './types';

const STORAGE_KEY = 'tabs.splitLayout.midPercent';
const DEFAULT_MID_PERCENT = 50;
const MIN_PERCENT = 20;
const MAX_PERCENT = 80;

/**
 * Edge-style 2-pane split layout.
 *
 * Layout DOM lives inside `frame-container`:
 *   frame-container
 *     ├─ .split-pane[data-pane="main"]         (default fullscreen pane)
 *     ├─ .split-pane[data-pane="split-left"]   (left half of pair)
 *     ├─ .split-pane[data-pane="split-right"]  (right half of pair)
 *     └─ .split-gutter[data-gutter="split"]    (draggable midpoint)
 *
 * When no split is active, only `main` is shown. When a split is active,
 * `main` is hidden and split-left + split-right + gutter are shown.
 *
 * The "focused" frame in a split is tracked externally (Tabs class) and
 * communicated here via setFocusedSide() so we can render the focus ring.
 */
export class SplitLayoutManager {
	private tabs: TabsInterface;
	private root: HTMLElement | null = null;
	private mainPane!: HTMLElement;
	private leftPane!: HTMLElement;
	private rightPane!: HTMLElement;
	private gutter!: HTMLElement;
	private leftOverlay!: HTMLElement;
	private rightOverlay!: HTMLElement;
	private midPercent: number;
	private mode: 'main' | 'split' = 'main';

	constructor(tabs: TabsInterface) {
		this.tabs = tabs;
		this.midPercent = this.loadMidPercent();
	}

	mount(container: HTMLElement): void {
		if (this.root === container) return;
		this.root = container;

		const preservedIframes = Array.from(
			container.querySelectorAll<HTMLIFrameElement>(':scope > iframe')
		);

		container.replaceChildren();
		container.classList.add('split-layout-root');
		container.dataset.splitMode = 'main';

		this.mainPane = this.createPane('main');
		this.leftPane = this.createPane('split-left');
		this.rightPane = this.createPane('split-right');
		this.gutter = document.createElement('div');
		this.gutter.className = 'split-gutter';
		this.gutter.dataset.gutter = 'split';
		this.gutter.dataset.shown = 'false';

		this.leftOverlay = this.createOverlay('left');
		this.rightOverlay = this.createOverlay('right');

		container.append(
			this.mainPane,
			this.leftPane,
			this.rightPane,
			this.gutter,
			this.leftOverlay,
			this.rightOverlay
		);

		for (const iframe of preservedIframes) {
			this.mainPane.appendChild(iframe);
		}

		this.applyMidPercent();
		this.attachGutterHandler();
	}

	private createOverlay(side: 'left' | 'right'): HTMLElement {
		const el = document.createElement('div');
		el.className = `split-click-catcher split-click-catcher--${side}`;
		el.dataset.side = side;
		el.dataset.shown = 'false';
		el.addEventListener('mousedown', evt => {
			if (this.mode !== 'split') return;
			const pane = side === 'left' ? this.leftPane : this.rightPane;
			const iframe = pane.querySelector(
				'iframe'
			) as HTMLIFrameElement | null;
			const tabId = iframe?.getAttribute('data-tab-id') ?? null;
			if (!tabId) return;

			el.style.pointerEvents = 'none';
			this.tabs.setSplitFocus?.(tabId);
			void evt;
		});
		return el;
	}

	getPane(
		placement: 'main' | 'split-left' | 'split-right'
	): HTMLElement | null {
		switch (placement) {
			case 'main':
				return this.mainPane ?? null;
			case 'split-left':
				return this.leftPane ?? null;
			case 'split-right':
				return this.rightPane ?? null;
		}
	}

	private createPane(
		placement: 'main' | 'split-left' | 'split-right'
	): HTMLElement {
		const el = document.createElement('div');
		el.className = `split-pane split-pane--${placement}`;
		el.dataset.pane = placement;
		el.dataset.shown = 'false';
		return el;
	}

	/**
	 * Apply layout for the given occupancy. `mainIframe` is the iframe to
	 * show in the main pane (single mode). If `leftIframe` AND `rightIframe`
	 * are both provided, switches to split mode and hides main.
	 *
	 * `focusedSide` indicates which split pane carries the focus ring (only
	 * meaningful in split mode).
	 */
	apply(opts: {
		mainIframe: HTMLIFrameElement | null;
		leftIframe: HTMLIFrameElement | null;
		rightIframe: HTMLIFrameElement | null;
		focusedSide: 'left' | 'right' | null;
	}): void {
		if (!this.root) {
			const fc = (this.tabs.items.frameContainer ??
				(window.d?.querySelector(
					'[data-component="frame-container"]'
				) as HTMLElement | null)) as HTMLElement | null;
			if (fc) this.mount(fc);
		}
		if (!this.root) return;

		const splitActive = !!opts.leftIframe && !!opts.rightIframe;
		this.mode = splitActive ? 'split' : 'main';
		this.root.dataset.splitMode = this.mode;

		if (opts.mainIframe && opts.mainIframe.parentElement !== this.mainPane) {
			this.mainPane.appendChild(opts.mainIframe);
		}
		if (
			opts.leftIframe &&
			opts.leftIframe.parentElement !== this.leftPane
		) {
			this.leftPane.appendChild(opts.leftIframe);
		}
		if (
			opts.rightIframe &&
			opts.rightIframe.parentElement !== this.rightPane
		) {
			this.rightPane.appendChild(opts.rightIframe);
		}

		this.mainPane.dataset.shown =
			!splitActive && !!opts.mainIframe ? 'true' : 'false';
		this.leftPane.dataset.shown = splitActive ? 'true' : 'false';
		this.rightPane.dataset.shown = splitActive ? 'true' : 'false';
		this.gutter.dataset.shown = splitActive ? 'true' : 'false';

		this.leftPane.dataset.focused =
			splitActive && opts.focusedSide === 'left' ? 'true' : 'false';
		this.rightPane.dataset.focused =
			splitActive && opts.focusedSide === 'right' ? 'true' : 'false';

		if (splitActive) {
			const leftIsFocused = opts.focusedSide === 'left';
			this.leftOverlay.dataset.shown = leftIsFocused
				? 'false'
				: 'true';
			this.rightOverlay.dataset.shown = leftIsFocused
				? 'true'
				: 'false';
			this.leftOverlay.style.pointerEvents = '';
			this.rightOverlay.style.pointerEvents = '';
		} else {
			this.leftOverlay.dataset.shown = 'false';
			this.rightOverlay.dataset.shown = 'false';
		}
	}

	private applyMidPercent(): void {
		if (!this.root) return;
		this.root.style.setProperty(
			'--split-mid-pct',
			`${this.midPercent}%`
		);
	}

	private attachGutterHandler(): void {
		let dragging = false;
		this.gutter.addEventListener('pointerdown', evt => {
			if (this.mode !== 'split') return;
			dragging = true;
			this.gutter.setPointerCapture(evt.pointerId);
			document.body.style.cursor = 'ew-resize';
		});
		this.gutter.addEventListener('pointermove', evt => {
			if (!dragging || !this.root) return;
			const rect = this.root.getBoundingClientRect();
			if (rect.width <= 0) return;
			const localX = evt.clientX - rect.left;
			const pct = (localX / rect.width) * 100;
			this.midPercent = clamp(pct, MIN_PERCENT, MAX_PERCENT);
			this.applyMidPercent();
		});
		const release = (evt: PointerEvent) => {
			if (!dragging) return;
			dragging = false;
			if (this.gutter.hasPointerCapture(evt.pointerId)) {
				this.gutter.releasePointerCapture(evt.pointerId);
			}
			document.body.style.cursor = '';
			try {
				localStorage.setItem(STORAGE_KEY, String(this.midPercent));
			} catch {
				// quota / privacy mode
			}
		};
		this.gutter.addEventListener('pointerup', release);
		this.gutter.addEventListener('pointercancel', release);
	}

	private loadMidPercent(): number {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return DEFAULT_MID_PERCENT;
			const n = parseFloat(raw);
			return Number.isFinite(n)
				? clamp(n, MIN_PERCENT, MAX_PERCENT)
				: DEFAULT_MID_PERCENT;
		} catch {
			return DEFAULT_MID_PERCENT;
		}
	}
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, v));
}
