import { describe, it, expect } from 'vitest';

describe('Omnibox keydown listener — capture-phase ordering', () => {
	it('capture listener fires before bubble listener regardless of registration order', () => {
		// Verifies the DOM contract that the bug-fix relies on.
		const input = document.createElement('input');
		document.body.appendChild(input);
		const order: string[] = [];

		// Register bubble-phase first (mimics the legacy index.tsx Enter handler)
		input.addEventListener('keydown', () => { order.push('bubble'); });

		// Register capture-phase second (mimics the Omnibox's listener with { capture: true })
		input.addEventListener('keydown', () => { order.push('capture'); }, { capture: true });

		const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
		input.dispatchEvent(ev);

		document.body.removeChild(input);
		expect(order).toEqual(['capture', 'bubble']);
	});

	it('capture listener can preventDefault and stop propagation flag before bubble runs', () => {
		const input = document.createElement('input');
		document.body.appendChild(input);
		let bubbleSawFlag = false;

		input.addEventListener('keydown', (e) => {
			bubbleSawFlag = (e as any).__omniboxConsumed === true;
		});

		input.addEventListener('keydown', (e) => {
			(e as any).__omniboxConsumed = true;
			e.preventDefault();
		}, { capture: true });

		const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		input.dispatchEvent(ev);

		document.body.removeChild(input);
		expect(bubbleSawFlag).toBe(true);
	});
});
