/**
 * DOM helpers for the per-tab devtools panel.
 *
 * Mounts a bottom-docked panel inside the tab's iframe parent. The
 * panel supports multiple sub-panels (a primary chii panel plus N
 * extension panels added via chrome.devtools.panels.create), with a
 * tab strip at the top that switches the visible iframe.
 *
 * Layout (top → bottom):
 *   [ resizeHandle ]
 *   [ tabStrip   ] — one tab per panel
 *   [ iframes    ] — only the active panel's iframe is visible
 *
 * Backwards-compat: the `devtoolsIframe` accessor on PanelHandle
 * resolves to the chii panel's iframe (always present, panel 0). This
 * keeps existing call sites in session.ts / manager.ts working
 * without churn.
 */

interface TabLike {
	id: string;
	iframe: HTMLIFrameElement;
	devtoolsPanel?: PanelHandle | undefined;
}

/** Per-panel data tracked by a PanelHandle. */
export interface PanelEntry {
	id: number;
	title: string;
	iconUrl: string;
	iframe: HTMLIFrameElement;
	tab: HTMLDivElement;
	active: boolean;
	/** `null` for the built-in chii panel; extension id otherwise. */
	extId: string | null;
	kind: 'chii' | 'extension';
}

/** Options for adding an extension panel via chrome.devtools.panels.create. */
export interface AddPanelOpts {
	title: string;
	iconUrl: string;
	/** Full URL the iframe should load. Caller resolves to the extension origin. */
	iframeSrc: string;
	extId: string;
	/** Optional callback fired when this panel becomes visible. */
	onShown?: (win: Window) => void;
	/** Optional callback fired when this panel becomes hidden. */
	onHidden?: () => void;
	/**
	 * Optional createFrame hook — when provided, this is called instead
	 * of setting iframe.src directly. Used by the host's
	 * chrome.devtools.panels.create impl to attach a Scramjet plugin.
	 *
	 * Receives the freshly-appended iframe and the requested URL.
	 */
	mountIframe?: (iframe: HTMLIFrameElement, iframeSrc: string) => void | Promise<void>;
}

export interface PanelHandle {
	container: HTMLDivElement;
	resizeHandle: HTMLDivElement;
	tabStrip: HTMLDivElement;
	/** Backwards-compat shim: resolves to the chii panel's iframe. */
	readonly devtoolsIframe: HTMLIFrameElement;
	/** Mirrors the chii panel's visibility for backwards compat. */
	isActive: boolean;
	height: number;
	panels: PanelEntry[];
	addPanel(opts: AddPanelOpts): PanelEntry;
	setActive(panelId: number): void;
	removePanelsByExtId(extId: string): void;
	removeAll(): void;
}

const DEFAULT_HEIGHT = 300;

let nextPanelId = 1;

function applyTabStyling(tab: HTMLDivElement, active: boolean): void {
	tab.style.padding = '6px 14px';
	tab.style.fontSize = '11px';
	tab.style.fontFamily = 'system-ui, sans-serif';
	tab.style.cursor = 'pointer';
	tab.style.userSelect = 'none';
	tab.style.color = active ? '#fff' : '#bbb';
	tab.style.background = active ? '#2d2d2d' : 'transparent';
	tab.style.borderRight = '1px solid #333';
	tab.style.display = 'inline-flex';
	tab.style.alignItems = 'center';
	tab.style.gap = '4px';
	tab.style.whiteSpace = 'nowrap';
}

export function mountPanel(tab: TabLike, devtoolsUrl: string): PanelHandle {
	if (tab.devtoolsPanel?.container) {
		return tab.devtoolsPanel;
	}
	const parent = tab.iframe.parentElement;
	if (!parent) {
		throw new Error('mountPanel: tab iframe has no parent element');
	}

	const container = document.createElement('div');
	container.className = 'devtools-panel';
	container.dataset.tabId = tab.id;
	container.style.position = 'absolute';
	container.style.left = '0';
	container.style.right = '0';
	container.style.bottom = '0';
	container.style.height = `${DEFAULT_HEIGHT}px`;
	container.style.background = '#1e1e1e';
	container.style.zIndex = '50';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';

	const resizeHandle = document.createElement('div');
	resizeHandle.className = 'devtools-resize-handle';
	resizeHandle.style.height = '4px';
	resizeHandle.style.background = '#444';
	resizeHandle.style.cursor = 'ns-resize';
	resizeHandle.style.flex = '0 0 4px';

	const tabStrip = document.createElement('div');
	tabStrip.className = 'devtools-tab-strip';
	tabStrip.style.flex = '0 0 26px';
	tabStrip.style.display = 'flex';
	tabStrip.style.flexDirection = 'row';
	tabStrip.style.background = '#252525';
	tabStrip.style.borderBottom = '1px solid #333';
	tabStrip.style.overflow = 'hidden';

	const iframeStack = document.createElement('div');
	iframeStack.className = 'devtools-iframe-stack';
	iframeStack.style.position = 'relative';
	iframeStack.style.flex = '1 1 auto';
	iframeStack.style.minHeight = '0';

	const chiiIframe = document.createElement('iframe');
	chiiIframe.className = 'devtools-iframe';
	chiiIframe.src = devtoolsUrl;
	chiiIframe.dataset.heliumDevtoolsPanel = 'chii';
	chiiIframe.style.position = 'absolute';
	chiiIframe.style.inset = '0';
	chiiIframe.style.width = '100%';
	chiiIframe.style.height = '100%';
	chiiIframe.style.border = '0';
	iframeStack.appendChild(chiiIframe);

	container.appendChild(resizeHandle);
	container.appendChild(tabStrip);
	container.appendChild(iframeStack);
	parent.appendChild(container);

	const chiiTabEl = document.createElement('div');
	chiiTabEl.className = 'devtools-tab devtools-tab-chii';
	chiiTabEl.textContent = 'Elements';
	applyTabStyling(chiiTabEl, true);
	tabStrip.appendChild(chiiTabEl);

	const chiiEntry: PanelEntry = {
		id: nextPanelId++,
		title: 'Elements',
		iconUrl: '',
		iframe: chiiIframe,
		tab: chiiTabEl,
		active: true,
		extId: null,
		kind: 'chii',
	};

	const handle: PanelHandle = {
		container,
		resizeHandle,
		tabStrip,
		get devtoolsIframe(): HTMLIFrameElement {
			return chiiEntry.iframe;
		},
		isActive: true,
		height: DEFAULT_HEIGHT,
		panels: [chiiEntry],
		addPanel(opts: AddPanelOpts): PanelEntry {
			const iframe = document.createElement('iframe');
			iframe.className = 'devtools-iframe devtools-iframe-extension';
			iframe.dataset.heliumDevtoolsPanel = 'extension';
			iframe.dataset.heliumExtId = opts.extId;
			iframe.style.position = 'absolute';
			iframe.style.inset = '0';
			iframe.style.width = '100%';
			iframe.style.height = '100%';
			iframe.style.border = '0';
			iframe.style.display = 'none';
			iframeStack.appendChild(iframe);

			const tabEl = document.createElement('div');
			tabEl.className = 'devtools-tab devtools-tab-extension';
			tabEl.dataset.heliumExtId = opts.extId;
			tabEl.title = opts.title;
			applyTabStyling(tabEl, false);

			if (opts.iconUrl) {
				const icon = document.createElement('img');
				icon.src = opts.iconUrl;
				icon.alt = '';
				icon.style.width = '12px';
				icon.style.height = '12px';
				icon.style.flex = '0 0 12px';
				tabEl.appendChild(icon);
			}
			const label = document.createElement('span');
			label.textContent = opts.title;
			tabEl.appendChild(label);
			tabStrip.appendChild(tabEl);

			const entry: PanelEntry = {
				id: nextPanelId++,
				title: opts.title,
				iconUrl: opts.iconUrl,
				iframe,
				tab: tabEl,
				active: false,
				extId: opts.extId,
				kind: 'extension',
			};
			(entry as PanelEntry & { onShown?: AddPanelOpts['onShown']; onHidden?: AddPanelOpts['onHidden'] }).onShown = opts.onShown;
			(entry as PanelEntry & { onShown?: AddPanelOpts['onShown']; onHidden?: AddPanelOpts['onHidden'] }).onHidden = opts.onHidden;

			tabEl.addEventListener('click', () => {
				handle.setActive(entry.id);
			});

			handle.panels.push(entry);

			if (opts.mountIframe) {
				try {
					const result = opts.mountIframe(iframe, opts.iframeSrc);
					if (result && typeof (result as Promise<unknown>).then === 'function') {
						(result as Promise<unknown>).catch((err: unknown) => {
							console.warn(
								'[ddx-devtools] mountIframe rejected for ext panel',
								opts.extId,
								err,
							);
						});
					}
				} catch (err) {
					console.warn(
						'[ddx-devtools] mountIframe threw for ext panel',
						opts.extId,
						err,
					);
				}
			} else {
				iframe.src = opts.iframeSrc;
			}

			return entry;
		},
		setActive(panelId: number): void {
			const target = handle.panels.find((p) => p.id === panelId);
			if (!target) return;
			for (const p of handle.panels) {
				const wasActive = p.active;
				const becomesActive = p.id === panelId;
				p.active = becomesActive;
				p.iframe.style.display = becomesActive ? 'block' : 'none';
				applyTabStyling(p.tab, becomesActive);
				if (wasActive && !becomesActive) {
					const cb = (p as PanelEntry & { onHidden?: AddPanelOpts['onHidden'] }).onHidden;
					if (cb) {
						try { cb(); } catch (err) {
							console.warn('[ddx-devtools] onHidden cb threw:', err);
						}
					}
				}
				if (!wasActive && becomesActive) {
					const cb = (p as PanelEntry & { onShown?: AddPanelOpts['onShown'] }).onShown;
					if (cb) {
						try {
							const win = p.iframe.contentWindow;
							if (win) cb(win);
						} catch (err) {
							console.warn('[ddx-devtools] onShown cb threw:', err);
						}
					}
				}
			}
		},
		removePanelsByExtId(extId: string): void {
			const remaining: PanelEntry[] = [];
			let removedActive = false;
			for (const p of handle.panels) {
				if (p.extId === extId) {
					try { p.iframe.remove(); } catch { /* ignore */ }
					try { p.tab.remove(); } catch { /* ignore */ }
					if (p.active) removedActive = true;
				} else {
					remaining.push(p);
				}
			}
			handle.panels = remaining;
			if (removedActive && remaining.length > 0) {
				handle.setActive(remaining[0]!.id);
			}
		},
		removeAll(): void {
			for (const p of handle.panels) {
				if (p.kind === 'extension') {
					try { p.iframe.remove(); } catch { /* ignore */ }
					try { p.tab.remove(); } catch { /* ignore */ }
				}
			}
			handle.panels = handle.panels.filter((p) => p.kind === 'chii');
			if (handle.panels.length > 0) {
				handle.setActive(handle.panels[0]!.id);
			}
		},
	};

	chiiTabEl.addEventListener('click', () => {
		handle.setActive(chiiEntry.id);
	});

	return handle;
}

export function unmountPanel(tab: TabLike): void {
	const panel = tab.devtoolsPanel;
	if (!panel) return;
	try {
		panel.removeAll();
	} catch {
		// ignore
	}
	try {
		panel.container.remove();
	} catch {
		// ignore
	}
	tab.devtoolsPanel = undefined;
}
