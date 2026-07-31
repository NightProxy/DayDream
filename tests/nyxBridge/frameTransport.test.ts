import { describe, it, expect } from 'vitest';
import { encodeEnvelope, decodeEnvelope } from '../../src/apis/nyxBridge/frameTransport';

describe('frameTransport', () => {
	it('encodes message with $scramjet wrapper + __nyxBridgeMsg tag', () => {
		const env = encodeEnvelope({ kind: 'cdp-out', frameId: 'f1', payload: '{}' });
		expect(env.$scramjet$messagetype).toBe('window');
		expect(env.$scramjet$data.__nyxBridgeMsg).toBe(true);
		expect(env.$scramjet$data.kind).toBe('cdp-out');
	});

	it('decodes a wrapped envelope', () => {
		const env = encodeEnvelope({ kind: 'frame-ready', frameId: 'f1' });
		const decoded = decodeEnvelope(env);
		expect(decoded).toMatchObject({ kind: 'frame-ready', frameId: 'f1' });
	});

	it('decodes an unwrapped (non-Scramjet) message', () => {
		const decoded = decodeEnvelope({ __nyxBridgeMsg: true, kind: 'cdp-out', frameId: 'f1', payload: '{}' });
		expect(decoded?.kind).toBe('cdp-out');
	});

	it('returns null for non-nyxBridge messages', () => {
		expect(decodeEnvelope({})).toBeNull();
		expect(decodeEnvelope(null)).toBeNull();
		expect(decodeEnvelope({ foo: 'bar' })).toBeNull();
	});
});
