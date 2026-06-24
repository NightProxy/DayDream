import { describe, it, expect } from 'vitest';
import { isNyxOrigin, NYX_ORIGINS_DEFAULT } from '../../src/apis/nyxBridge/handshake';

describe('isNyxOrigin', () => {
	it('accepts the official Nyx origins', () => {
		expect(isNyxOrigin('https://nyx.night-x.com/')).toBe(true);
		expect(isNyxOrigin('https://nyx.night-x.com/chat')).toBe(true);
		expect(isNyxOrigin('https://nyx.ampscat.dev/')).toBe(true);
		expect(isNyxOrigin('https://nyx.ampscat.dev/anything?q=1#h')).toBe(true);
	});

	it('rejects non-Nyx origins', () => {
		expect(isNyxOrigin('https://example.com/')).toBe(false);
		expect(isNyxOrigin('https://nyx.night-x.com.evil.com/')).toBe(false);
		expect(isNyxOrigin('http://nyx.night-x.com/')).toBe(false); // wrong scheme
		expect(isNyxOrigin('nyx.night-x.com')).toBe(false); // missing scheme
	});

	it('accepts an extra dev origin when passed', () => {
		const extra = ['http://localhost:5174'];
		expect(isNyxOrigin('http://localhost:5174/', extra)).toBe(true);
		expect(isNyxOrigin('http://localhost:5175/', extra)).toBe(false);
	});

	it('exports the default allowlist', () => {
		expect(NYX_ORIGINS_DEFAULT).toContain('https://nyx.night-x.com');
		expect(NYX_ORIGINS_DEFAULT).toContain('https://nyx.ampscat.dev');
	});

	it('rejects malformed URLs without throwing', () => {
		expect(isNyxOrigin('not a url')).toBe(false);
		expect(isNyxOrigin('')).toBe(false);
	});
});

import { Handshake } from '../../src/apis/nyxBridge/handshake';

function fakeIframe(): HTMLIFrameElement {
	const el = document.createElement('iframe');
	// jsdom defines `contentWindow` as a getter-only property; override via
	// defineProperty so the test can plant a stable identity object.
	Object.defineProperty(el, 'contentWindow', {
		value: { name: 'fakeWin' },
		configurable: true,
	});
	return el;
}

async function sha256Hex(s: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('Handshake', () => {
	const HOST_MARKER = 'host-marker-test-1234';

	it('init returns nonce + sessionId for an allowed iframe', async () => {
		const hs = new Handshake({ hostMarker: HOST_MARKER, allowlist: ['https://nyx.night-x.com'] });
		const iframe = fakeIframe();
		const r = await hs.handleInit({ iframe, realUrl: 'https://nyx.night-x.com/' });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(typeof r.nonce).toBe('string');
			expect(r.nonce.length).toBeGreaterThanOrEqual(32);
			expect(typeof r.sessionId).toBe('string');
		}
	});

	it('init rejects an iframe whose realUrl is not in allowlist', async () => {
		const hs = new Handshake({ hostMarker: HOST_MARKER, allowlist: ['https://nyx.night-x.com'] });
		const iframe = fakeIframe();
		const r = await hs.handleInit({ iframe, realUrl: 'https://evil.com/' });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe('permission_denied');
	});

	it('complete trusts a correctly-hashed token', async () => {
		const hs = new Handshake({ hostMarker: HOST_MARKER, allowlist: ['https://nyx.night-x.com'] });
		const iframe = fakeIframe();
		const initRes = await hs.handleInit({ iframe, realUrl: 'https://nyx.night-x.com/' });
		if (!initRes.ok) throw new Error('init failed');
		const token = await sha256Hex(`${initRes.nonce}:${HOST_MARKER}:nyx-bridge-v1`);
		const r = await hs.handleComplete({ sessionId: initRes.sessionId, token, iframe });
		expect(r.ok).toBe(true);
	});

	it('complete rejects a wrong token', async () => {
		const hs = new Handshake({ hostMarker: HOST_MARKER, allowlist: ['https://nyx.night-x.com'] });
		const iframe = fakeIframe();
		const initRes = await hs.handleInit({ iframe, realUrl: 'https://nyx.night-x.com/' });
		if (!initRes.ok) throw new Error('init failed');
		const r = await hs.handleComplete({ sessionId: initRes.sessionId, token: 'wrong', iframe });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe('handshake_required');
	});

	it('complete rejects an unknown sessionId', async () => {
		const hs = new Handshake({ hostMarker: HOST_MARKER, allowlist: ['https://nyx.night-x.com'] });
		const r = await hs.handleComplete({ sessionId: 'nope', token: 'whatever', iframe: fakeIframe() });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe('session_expired');
	});

	it('complete rejects when iframe differs from the one that initiated', async () => {
		const hs = new Handshake({ hostMarker: HOST_MARKER, allowlist: ['https://nyx.night-x.com'] });
		const iframeA = fakeIframe();
		const iframeB = fakeIframe();
		const initRes = await hs.handleInit({ iframe: iframeA, realUrl: 'https://nyx.night-x.com/' });
		if (!initRes.ok) throw new Error('init failed');
		const token = await sha256Hex(`${initRes.nonce}:${HOST_MARKER}:nyx-bridge-v1`);
		const r = await hs.handleComplete({ sessionId: initRes.sessionId, token, iframe: iframeB });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe('permission_denied');
	});

	it('verify returns ok for a trusted session from the right iframe', async () => {
		const hs = new Handshake({ hostMarker: HOST_MARKER, allowlist: ['https://nyx.night-x.com'] });
		const iframe = fakeIframe();
		const initRes = await hs.handleInit({ iframe, realUrl: 'https://nyx.night-x.com/' });
		if (!initRes.ok) throw new Error();
		const token = await sha256Hex(`${initRes.nonce}:${HOST_MARKER}:nyx-bridge-v1`);
		await hs.handleComplete({ sessionId: initRes.sessionId, token, iframe });
		expect(hs.verify(initRes.sessionId, iframe.contentWindow as Window).ok).toBe(true);
	});

	it('drop removes a session', async () => {
		const hs = new Handshake({ hostMarker: HOST_MARKER, allowlist: ['https://nyx.night-x.com'] });
		const iframe = fakeIframe();
		const initRes = await hs.handleInit({ iframe, realUrl: 'https://nyx.night-x.com/' });
		if (!initRes.ok) throw new Error();
		const token = await sha256Hex(`${initRes.nonce}:${HOST_MARKER}:nyx-bridge-v1`);
		await hs.handleComplete({ sessionId: initRes.sessionId, token, iframe });
		hs.drop(initRes.sessionId);
		expect(hs.verify(initRes.sessionId, iframe.contentWindow as Window).ok).toBe(false);
	});
});
