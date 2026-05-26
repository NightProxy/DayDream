import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandRegistry, type Command } from '@apis/commands';

function makeCmd(partial: Partial<Command> & { id: string; label: string }): Command {
	return {
		category: 'misc',
		source: 'builtin',
		action: () => {},
		...partial,
	};
}

describe('CommandRegistry', () => {
	let reg: CommandRegistry;
	beforeEach(() => {
		reg = new CommandRegistry();
	});

	it('register adds a command and list returns it', () => {
		reg.register(makeCmd({ id: 'a', label: 'Alpha' }));
		expect(reg.list()).toHaveLength(1);
		expect(reg.list()[0].id).toBe('a');
	});

	it('register returns an unregister function', () => {
		const off = reg.register(makeCmd({ id: 'a', label: 'Alpha' }));
		off();
		expect(reg.list()).toHaveLength(0);
	});

	it('find returns matches with substring scoring', () => {
		reg.register(makeCmd({ id: 'a', label: 'Close current tab' }));
		reg.register(makeCmd({ id: 'b', label: 'Open new tab' }));
		const results = reg.find('tab');
		expect(results).toHaveLength(2);
	});

	it('find ranks prefix matches above mid-substring matches', () => {
		reg.register(makeCmd({ id: 'a', label: 'Close current tab' }));
		reg.register(makeCmd({ id: 'b', label: 'Tab management' }));
		const results = reg.find('tab');
		expect(results[0].id).toBe('b');
	});

	it('find matches keywords too', () => {
		reg.register(makeCmd({ id: 'a', label: 'Open Settings', keywords: ['preferences', 'config'] }));
		const results = reg.find('preferences');
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe('a');
	});

	it('find returns empty array for no matches', () => {
		reg.register(makeCmd({ id: 'a', label: 'Alpha' }));
		expect(reg.find('xyzzy')).toEqual([]);
	});

	it('find respects limit', () => {
		for (let i = 0; i < 10; i++) reg.register(makeCmd({ id: `c${i}`, label: `Item ${i}` }));
		expect(reg.find('item', 3)).toHaveLength(3);
	});

	it('execute runs the action', async () => {
		const fn = vi.fn();
		reg.register(makeCmd({ id: 'a', label: 'Alpha', action: fn }));
		await reg.execute('a');
		expect(fn).toHaveBeenCalledOnce();
	});

	it('execute catches synchronous throws', async () => {
		reg.register(makeCmd({ id: 'a', label: 'Alpha', action: () => { throw new Error('boom'); } }));
		await expect(reg.execute('a')).resolves.toBeUndefined();
	});

	it('execute catches async rejections', async () => {
		reg.register(makeCmd({ id: 'a', label: 'Alpha', action: async () => { throw new Error('boom'); } }));
		await expect(reg.execute('a')).resolves.toBeUndefined();
	});

	it('listByCategory groups commands by category', () => {
		reg.register(makeCmd({ id: 'a', label: 'A', category: 'tabs' }));
		reg.register(makeCmd({ id: 'b', label: 'B', category: 'navigation' }));
		reg.register(makeCmd({ id: 'c', label: 'C', category: 'tabs' }));
		const grouped = reg.listByCategory();
		expect(grouped.tabs).toHaveLength(2);
		expect(grouped.navigation).toHaveLength(1);
	});

	it('onChange fires when a command is registered', () => {
		const handler = vi.fn();
		reg.onChange(handler);
		reg.register(makeCmd({ id: 'a', label: 'Alpha' }));
		expect(handler).toHaveBeenCalledOnce();
	});

	it('onChange fires when a command is unregistered', () => {
		const handler = vi.fn();
		const off = reg.register(makeCmd({ id: 'a', label: 'Alpha' }));
		// Reset after the register call so we only count the unregister.
		handler.mockClear();
		reg.onChange(handler);
		off();
		expect(handler).toHaveBeenCalledOnce();
	});

	it('onChange returns an unsubscribe function that stops further calls', () => {
		const handler = vi.fn();
		const off = reg.onChange(handler);
		reg.register(makeCmd({ id: 'a', label: 'Alpha' }));
		expect(handler).toHaveBeenCalledOnce();
		off();
		reg.register(makeCmd({ id: 'b', label: 'Beta' }));
		expect(handler).toHaveBeenCalledOnce(); // still 1 — unsubscribed before the second register
	});

	it('unregister is idempotent — calling the returned function twice is safe', () => {
		const off = reg.register(makeCmd({ id: 'a', label: 'Alpha' }));
		off();
		expect(() => off()).not.toThrow();
		expect(reg.list()).toHaveLength(0);
	});
});
