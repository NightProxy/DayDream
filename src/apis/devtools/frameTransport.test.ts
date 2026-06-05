import { describe, expect, it } from 'vitest';
import { encodeEnvelope, decodeEnvelope, DEVTOOLS_HOST_TAG } from './frameTransport';
import type { DevtoolsMessage } from './types';

describe('frameTransport', () => {
	const sample: DevtoolsMessage = {
		kind: 'frame-ready',
		frameId: 'f1',
		parentFrameId: null,
		url: 'https://example.com/',
		title: 'Example',
	};

	it('round-trips every message kind', () => {
		const messages: DevtoolsMessage[] = [
			sample,
			{ kind: 'frame-gone', frameId: 'f1' },
			{ kind: 'cdp-out', frameId: 'f1', payload: '{"id":1}' },
			{ kind: 'cdp-in', frameId: 'f1', payload: '{"id":1}' },
			{ kind: 'agent-error', frameId: 'f1', message: 'oops' },
		];
		for (const m of messages) {
			const encoded = encodeEnvelope('https://host.test', m);
			const decoded = decodeEnvelope(encoded);
			expect(decoded).toEqual(m);
		}
	});

	it('rejects malformed inputs', () => {
		expect(decodeEnvelope(null)).toBeNull();
		expect(decodeEnvelope('string')).toBeNull();
		expect(decodeEnvelope({})).toBeNull();
		expect(decodeEnvelope({ $scramjet$messagetype: 'window' })).toBeNull();
		expect(
			decodeEnvelope({
				$scramjet$messagetype: 'window',
				$scramjet$origin: 'x',
				$scramjet$data: { kind: 'unknown' },
			})
		).toBeNull();
		expect(
			decodeEnvelope({
				$scramjet$messagetype: 'window',
				$scramjet$origin: 'x',
				$scramjet$data: { kind: 'frame-ready', frameId: 'f1' },
			})
		).toBeNull();
	});

	it('encoded envelope carries the host tag and scramjet shape', () => {
		const encoded = encodeEnvelope('https://h', sample) as Record<string, unknown>;
		expect(encoded.$scramjet$messagetype).toBe('window');
		expect(encoded.$scramjet$origin).toBe('https://h');
		const data = encoded.$scramjet$data as Record<string, unknown>;
		expect(data[DEVTOOLS_HOST_TAG]).toBe(true);
		expect(data.kind).toBe('frame-ready');
	});
});
