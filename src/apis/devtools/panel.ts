/**
 * DOM helpers for the per-tab devtools panel.
 *
 * Mounts a bottom-docked panel (devtools iframe + resize handle)
 * inside the tab's iframe parent. Layout intentionally mirrors the
 * pre-rewrite panel so existing CSS continues to apply.
 */

interface TabLike {
	id: string;
	iframe: HTMLIFrameElement;
	devtoolsPanel?: PanelHandle | undefined;
}

export interface PanelHandle {
	container: HTMLDivElement;
	devtoolsIframe: HTMLIFrameElement;
	resizeHandle: HTMLDivElement;
	isActive: boolean;
	height: number;
}

const DEFAULT_HEIGHT = 300;

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

	const devtoolsIframe = document.createElement('iframe');
	devtoolsIframe.className = 'devtools-iframe';
	devtoolsIframe.src = devtoolsUrl;
	devtoolsIframe.style.flex = '1 1 auto';
	devtoolsIframe.style.border = '0';
	devtoolsIframe.style.width = '100%';

	container.appendChild(resizeHandle);
	container.appendChild(devtoolsIframe);
	parent.appendChild(container);

	const handle: PanelHandle = {
		container,
		devtoolsIframe,
		resizeHandle,
		isActive: true,
		height: DEFAULT_HEIGHT,
	};
	return handle;
}

export function unmountPanel(tab: TabLike): void {
	const panel = tab.devtoolsPanel;
	if (!panel) return;
	try {
		panel.container.remove();
	} catch {
		// ignore
	}
	tab.devtoolsPanel = undefined;
}
