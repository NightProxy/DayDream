
import { register } from './index';
import { DDXError } from '../types';
import type { TabTarget, MethodName } from '../api';

function area(ctx: any, target: TabTarget, name: 'local' | 'session'): Storage {
	const iframe = ctx.tabResolver.resolveIframe(target.tabId);
	const win = iframe.contentWindow as Window | null;
	if (!win) throw new DDXError('frame_not_found', 'no contentWindow');
	return name === 'local' ? win.localStorage : win.sessionStorage;
}

function makeArea(name: 'local' | 'session') {
	register(`storage.${name}.get` as MethodName, async (ctx, args: [TabTarget, string | string[] | null | undefined]) => {
		const [target, keys] = args;
		const s = area(ctx, target, name);
		const ks = !keys ? Array.from({ length: s.length }, (_, i) => s.key(i)!) : (typeof keys === 'string' ? [keys] : keys);
		const out: Record<string, unknown> = {};
		for (const k of ks) {
			const v = s.getItem(k);
			if (v !== null) out[k] = v;
		}
		return out;
	});

	register(`storage.${name}.set` as MethodName, async (ctx, args: [TabTarget, Record<string, unknown>]) => {
		const [target, items] = args;
		const s = area(ctx, target, name);
		for (const [k, v] of Object.entries(items)) {
			s.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
		}
	});

	register(`storage.${name}.remove` as MethodName, async (ctx, args: [TabTarget, string | string[]]) => {
		const [target, keys] = args;
		const s = area(ctx, target, name);
		(typeof keys === 'string' ? [keys] : keys).forEach((k) => s.removeItem(k));
	});

	register(`storage.${name}.clear` as MethodName, async (ctx, args: [TabTarget]) => {
		area(ctx, args[0], name).clear();
	});

	register(`storage.${name}.getKeys` as MethodName, async (ctx, args: [TabTarget]) => {
		const s = area(ctx, args[0], name);
		return Array.from({ length: s.length }, (_, i) => s.key(i)!);
	});
}

makeArea('local');
makeArea('session');
