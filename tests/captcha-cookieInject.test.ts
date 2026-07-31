import './helpers/opfsStub';
import { describe, it, expect, vi } from 'vitest';
import {
	serializeCookie,
	injectCfClearanceCookies
} from '@apis/captcha';

describe('serializeCookie', () => {
	it('produces a minimal Set-Cookie string', () => {
		expect(serializeCookie({ name: 'a', value: 'b' })).toBe('a=b');
	});

	it('includes domain + path when present', () => {
		expect(
			serializeCookie({
				name: 'cf_clearance',
				value: 'XYZ',
				domain: '.example.com',
				path: '/'
			})
		).toBe('cf_clearance=XYZ; Domain=.example.com; Path=/');
	});

	it('formats expires as RFC 7231 from unix seconds', () => {
		// 2030-01-01 00:00:00 UTC = 1893456000 unix seconds
		const out = serializeCookie({
			name: 'k',
			value: 'v',
			expires: 1_893_456_000
		});
		expect(out).toContain('k=v');
		expect(out).toContain('Expires=');
		// should be parseable back to a date close to the input
		const parsed = Date.parse(out.split('Expires=')[1]!);
		expect(Math.abs(parsed - 1_893_456_000 * 1000)).toBeLessThan(1000);
	});

	it('appends flags', () => {
		const out = serializeCookie({
			name: 'k',
			value: 'v',
			secure: true,
			httpOnly: true,
			sameSite: 'Lax'
		});
		expect(out).toContain('Secure');
		expect(out).toContain('HttpOnly');
		expect(out).toContain('SameSite=Lax');
	});

	it('skips bad expires silently', () => {
		const out = serializeCookie({
			name: 'k',
			value: 'v',
			expires: Number.NaN
		});
		expect(out).toBe('k=v');
	});
});

describe('injectCfClearanceCookies', () => {
	it('returns false when controller.cookieJar is missing', () => {
		const result = injectCfClearanceCookies({}, 'https://example.com', [
			{ name: 'a', value: 'b' }
		]);
		expect(result).toBe(false);
	});

	it('returns false on invalid URL', () => {
		const setCookies = vi.fn();
		const ctl = { cookieJar: { setCookies } };
		const result = injectCfClearanceCookies(ctl, 'not a url', [
			{ name: 'a', value: 'b' }
		]);
		expect(result).toBe(false);
		expect(setCookies).not.toHaveBeenCalled();
	});

	it('calls setCookies once per cookie with the right URL', () => {
		const setCookies = vi.fn();
		const ctl = { cookieJar: { setCookies } };
		const ok = injectCfClearanceCookies(ctl, 'https://example.com/path', [
			{ name: 'a', value: '1' },
			{ name: 'b', value: '2', domain: '.example.com', path: '/' }
		]);
		expect(ok).toBe(true);
		expect(setCookies).toHaveBeenCalledTimes(2);
		const args0 = setCookies.mock.calls[0]!;
		expect(args0[0]).toBe('a=1');
		expect(args0[1]).toBeInstanceOf(URL);
		expect((args0[1] as URL).origin).toBe('https://example.com');
	});

	it('skips malformed cookies but reports success if any wrote', () => {
		const setCookies = vi.fn();
		const ctl = { cookieJar: { setCookies } };
		const ok = injectCfClearanceCookies(ctl, 'https://example.com', [
			{ name: null as unknown as string, value: 'x' },
			{ name: 'good', value: 'val' }
		]);
		expect(ok).toBe(true);
		expect(setCookies).toHaveBeenCalledTimes(1);
	});

	it('returns false when every cookie is malformed', () => {
		const setCookies = vi.fn();
		const ctl = { cookieJar: { setCookies } };
		const ok = injectCfClearanceCookies(ctl, 'https://example.com', [
			{ name: null as unknown as string, value: 'x' }
		]);
		expect(ok).toBe(false);
		expect(setCookies).not.toHaveBeenCalled();
	});
});
