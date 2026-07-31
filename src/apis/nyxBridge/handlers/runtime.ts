
import { register } from './index';

register('runtime.getURL', async (_ctx, path: string) => new URL(path, location.origin).toString());

register('runtime.getManifest', async () => ({
	version: '1.0',
	protocolVersion: '1.0',
	capabilities: [
		'tabs', 'dom', 'scripting', 'cookies', 'input',
		'webNavigation', 'debugger', 'storage', 'history',
		'bookmarks', 'windows', 'search', 'dialogs', 'auth',
	],
}));

register('runtime.getPlatformInfo', async () => {
	const p = navigator.platform.toLowerCase();
	const os = p.includes('mac') ? 'mac' : p.includes('win') ? 'win' : 'linux';
	return { os, arch: 'x86_64' };
});
