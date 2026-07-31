
import { register } from './index';
import { METHOD_REGISTRY } from '../api';

register('host.version', async () => ({ protocolVersion: '1.0', hostVersion: '3.0.0' }));

register('host.capabilities', async () => {
	const ns: Record<string, string[]> = {};
	for (const m of METHOD_REGISTRY) {
		const [n, ...rest] = m.split('.');
		(ns[n] ??= []).push(rest.join('.'));
	}
	return { namespaces: ns };
});

register('host.setDefaultTimeout', async () => {
	/* v1 no-op; CdpHelper timeout is fixed at construction */
});
