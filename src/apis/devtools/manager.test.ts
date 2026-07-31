/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from 'vitest';
import { DevToolsManager } from './manager';

afterEach(() => {
	document.body.innerHTML = '';
});

function makeTabs(ids: string[]): Map<string, any> {
	const map = new Map<string, any>();
	for (const id of ids) {
		const parent = document.createElement('div');
		parent.style.position = 'relative';
		const iframe = document.createElement('iframe');
		parent.appendChild(iframe);
		document.body.appendChild(parent);
		map.set(id, { id, iframe, devtoolsPanel: undefined });
	}
	return map;
}

describe('DevToolsManager', () => {
	it('toggle creates session, second toggle hides, third shows', () => {
		const tabs = makeTabs(['tab-1']);
		const m = new DevToolsManager({
			devtoolsHostUrl: '/host.html',
			getTabData: id => tabs.get(id),
		});
		m.toggle('tab-1');
		expect(tabs.get('tab-1').devtoolsPanel).toBeDefined();
		expect(
			tabs.get('tab-1').devtoolsPanel.container.style.display
		).not.toBe('none');
		m.toggle('tab-1');
		expect(tabs.get('tab-1').devtoolsPanel.container.style.display).toBe(
			'none'
		);
		m.toggle('tab-1');
		expect(
			tabs.get('tab-1').devtoolsPanel.container.style.display
		).not.toBe('none');
	});

	it('isEnabledForTab reflects open/close state', () => {
		const tabs = makeTabs(['tab-1']);
		const m = new DevToolsManager({
			devtoolsHostUrl: '/host.html',
			getTabData: id => tabs.get(id),
		});
		expect(m.isEnabledForTab('tab-1')).toBe(false);
		m.toggle('tab-1');
		expect(m.isEnabledForTab('tab-1')).toBe(true);
		m.onTabClose('tab-1');
		expect(m.isEnabledForTab('tab-1')).toBe(false);
	});

	it('onTabSelect hides others, shows the new', () => {
		const tabs = makeTabs(['tab-1', 'tab-2']);
		const m = new DevToolsManager({
			devtoolsHostUrl: '/host.html',
			getTabData: id => tabs.get(id),
		});
		m.toggle('tab-1');
		m.toggle('tab-2');
		m.onTabSelect('tab-1');
		expect(
			tabs.get('tab-1').devtoolsPanel.container.style.display
		).not.toBe('none');
		expect(tabs.get('tab-2').devtoolsPanel.container.style.display).toBe(
			'none'
		);
	});

	it('onTabClose destroys the session', () => {
		const tabs = makeTabs(['tab-1']);
		const m = new DevToolsManager({
			devtoolsHostUrl: '/host.html',
			getTabData: id => tabs.get(id),
		});
		m.toggle('tab-1');
		m.onTabClose('tab-1');
		expect(tabs.get('tab-1').devtoolsPanel).toBeUndefined();
	});

	it('registerProxiedWindow does not throw when session exists', () => {
		const tabs = makeTabs(['tab-1']);
		const m = new DevToolsManager({
			devtoolsHostUrl: '/host.html',
			getTabData: id => tabs.get(id),
		});
		m.toggle('tab-1');
		expect(() => m.registerProxiedWindow('tab-1', window)).not.toThrow();
		expect(() => m.unregisterProxiedWindow('tab-1', window)).not.toThrow();
	});
});
