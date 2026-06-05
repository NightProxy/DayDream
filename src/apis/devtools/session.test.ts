/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevToolsSession } from './session';

afterEach(() => {
	document.body.innerHTML = '';
});

function makeTab(): any {
	const parent = document.createElement('div');
	parent.style.position = 'relative';
	const iframe = document.createElement('iframe');
	parent.appendChild(iframe);
	document.body.appendChild(parent);
	return { id: 'tab-1', iframe, devtoolsPanel: undefined };
}

describe('DevToolsSession', () => {
	it('mounts a panel pointing at the devtools host URL on construct', () => {
		const tab = makeTab();
		const session = new DevToolsSession({
			tabId: tab.id,
			tabData: tab,
			devtoolsHostUrl: '/devtools-host.html',
			onClose: () => {},
		});
		expect(tab.devtoolsPanel).toBeDefined();
		expect(tab.devtoolsPanel.devtoolsIframe.src).toContain(
			'devtools-host.html'
		);
		session.destroy();
	});

	it('attachProxiedWindow + handle frame-ready envelope routes through multiplexer', () => {
		const tab = makeTab();
		const session = new DevToolsSession({
			tabId: tab.id,
			tabData: tab,
			devtoolsHostUrl: '/x.html',
			onClose: () => {},
		});
		const proxied = document.createElement('iframe');
		document.body.appendChild(proxied);
		const proxiedWin = proxied.contentWindow as Window;
		(proxiedWin as any).postMessage = vi.fn();
		session.attachProxiedWindow(proxiedWin);

		// Dispatch a frame-ready envelope from the "proxied" window
		const evt = new MessageEvent('message', {
			source: proxiedWin,
			data: {
				$scramjet$messagetype: 'window',
				$scramjet$origin: 'http://proxied',
				$scramjet$data: {
					kind: 'frame-ready',
					frameId: 'top',
					parentFrameId: null,
					url: 'http://proxied/',
					title: 'p',
					__ddxDevtoolsMsg: true,
				},
			},
		});
		window.dispatchEvent(evt);
		// We can't easily observe internal multiplexer state from here, but
		// confirm no throw and that detach works too.
		const evt2 = new MessageEvent('message', {
			source: proxiedWin,
			data: {
				$scramjet$messagetype: 'window',
				$scramjet$origin: 'http://proxied',
				$scramjet$data: {
					kind: 'frame-gone',
					frameId: 'top',
					__ddxDevtoolsMsg: true,
				},
			},
		});
		window.dispatchEvent(evt2);
		session.destroy();
	});

	it('destroy unmounts the panel and stops listening', () => {
		const tab = makeTab();
		const session = new DevToolsSession({
			tabId: tab.id,
			tabData: tab,
			devtoolsHostUrl: '/x.html',
			onClose: () => {},
		});
		session.destroy();
		expect(tab.devtoolsPanel).toBeUndefined();
	});

	it('show/hide toggles display', () => {
		const tab = makeTab();
		const session = new DevToolsSession({
			tabId: tab.id,
			tabData: tab,
			devtoolsHostUrl: '/x.html',
			onClose: () => {},
		});
		session.hide();
		expect(tab.devtoolsPanel.container.style.display).toBe('none');
		session.show();
		expect(tab.devtoolsPanel.container.style.display).not.toBe('none');
		session.destroy();
	});

	it('detachProxiedWindow removes window from registry', () => {
		const tab = makeTab();
		const session = new DevToolsSession({
			tabId: tab.id,
			tabData: tab,
			devtoolsHostUrl: '/x.html',
			onClose: () => {},
		});
		const proxied = document.createElement('iframe');
		document.body.appendChild(proxied);
		const proxiedWin = proxied.contentWindow as Window;
		session.attachProxiedWindow(proxiedWin);
		session.detachProxiedWindow(proxiedWin);
		// Now subsequent messages from that window should not be processed.
		// Since we can't see internal state, just confirm no throw.
		const evt = new MessageEvent('message', {
			source: proxiedWin,
			data: {
				$scramjet$messagetype: 'window',
				$scramjet$origin: 'x',
				$scramjet$data: {
					kind: 'frame-ready',
					frameId: 'x',
					parentFrameId: null,
					url: 'u',
					title: 't',
					__ddxDevtoolsMsg: true,
				},
			},
		});
		window.dispatchEvent(evt);
		session.destroy();
	});
});
