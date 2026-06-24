import { describe, it, expect } from 'vitest';
import { HandleStore } from '../../src/apis/nyxBridge/handleStore';

describe('HandleStore', () => {
	it('round-trips a connected element', () => {
		const s = new HandleStore();
		const el = document.createElement('div');
		document.body.appendChild(el);
		const h = s.create(1, el);
		expect(s.resolve(h)).toBe(el);
	});

	it('returns null for a detached element', () => {
		const s = new HandleStore();
		const el = document.createElement('div');
		document.body.appendChild(el);
		const h = s.create(1, el);
		el.remove();
		expect(s.resolve(h)).toBeNull();
	});

	it('returns null for cross-tab handle', () => {
		const s = new HandleStore();
		const el = document.createElement('div');
		document.body.appendChild(el);
		const h = s.create(1, el);
		expect(s.resolve({ ...h, tabId: 2 })).toBeNull();
	});

	it('dropByTab clears handles', () => {
		const s = new HandleStore();
		const a = document.createElement('div'); document.body.appendChild(a);
		const b = document.createElement('div'); document.body.appendChild(b);
		const ha = s.create(1, a);
		const hb = s.create(2, b);
		s.dropByTab(1);
		expect(s.resolve(ha)).toBeNull();
		expect(s.resolve(hb)).toBe(b);
	});
});
