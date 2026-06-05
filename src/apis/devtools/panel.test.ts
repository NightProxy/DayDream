/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from 'vitest';
import { mountPanel, unmountPanel } from './panel';

afterEach(() => {
	document.body.innerHTML = '';
});

function makeFakeTab(): any {
	const parent = document.createElement('div');
	parent.style.position = 'relative';
	const iframe = document.createElement('iframe');
	parent.appendChild(iframe);
	document.body.appendChild(parent);
	return {
		id: 'tab-1',
		iframe,
		devtoolsPanel: undefined,
	};
}

describe('panel helpers', () => {
	it('mountPanel creates container, devtools iframe, and resize handle', () => {
		const tab = makeFakeTab();
		const handle = mountPanel(
			tab,
			'/core/i/chii/front_end/ddx_chii_host.html'
		);
		expect(handle.container).toBeInstanceOf(HTMLDivElement);
		expect(handle.devtoolsIframe).toBeInstanceOf(HTMLIFrameElement);
		expect(handle.resizeHandle).toBeInstanceOf(HTMLDivElement);
		expect(handle.devtoolsIframe.src).toContain('ddx_chii_host.html');
		expect(handle.container.parentElement).toBe(tab.iframe.parentElement);
	});

	it('unmountPanel removes the container from the DOM', () => {
		const tab = makeFakeTab();
		const handle = mountPanel(tab, '/x.html');
		tab.devtoolsPanel = handle;
		unmountPanel(tab);
		expect(handle.container.isConnected).toBe(false);
		expect(tab.devtoolsPanel).toBeUndefined();
	});

	it('mountPanel is a no-op if a panel already exists', () => {
		const tab = makeFakeTab();
		const a = mountPanel(tab, '/x.html');
		tab.devtoolsPanel = a;
		const b = mountPanel(tab, '/x.html');
		expect(b.container).toBe(a.container);
	});
});
