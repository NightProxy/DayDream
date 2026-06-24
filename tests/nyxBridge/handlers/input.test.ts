import { describe, it, expect, vi } from 'vitest';
import { HANDLERS } from '../../../src/apis/nyxBridge/handlers';
import '../../../src/apis/nyxBridge/handlers/input';

const cases: Array<[string, any, string]> = [
	['input.keyboard.down', [{ tabId: 1 }, 'a'], 'Input.dispatchKeyEvent'],
	['input.keyboard.up', [{ tabId: 1 }, 'a'], 'Input.dispatchKeyEvent'],
	['input.keyboard.press', [{ tabId: 1 }, 'a'], 'Input.dispatchKeyEvent'],
	['input.keyboard.type', [{ tabId: 1 }, 'hi'], 'Input.insertText'],
	['input.mouse.move', [{ tabId: 1 }, 10, 20], 'Input.dispatchMouseEvent'],
	['input.mouse.down', [{ tabId: 1 }], 'Input.dispatchMouseEvent'],
	['input.mouse.up', [{ tabId: 1 }], 'Input.dispatchMouseEvent'],
	['input.mouse.click', [{ tabId: 1 }, 5, 5], 'Input.dispatchMouseEvent'],
	['input.mouse.wheel', [{ tabId: 1 }, 0, 10], 'Input.dispatchMouseEvent'],
];

describe('input handlers', () => {
	for (const [method, args, cdpMethod] of cases) {
		it(`${method} sends ${cdpMethod}`, async () => {
			const send = vi.fn(async (_t: any, _m: string, _p?: any) => ({}));
			const ctx: any = { cdp: { send } };
			await HANDLERS[method as keyof typeof HANDLERS]!(ctx, args);
			expect(send.mock.calls.some((c) => c[1] === cdpMethod)).toBe(true);
		});
	}
});
