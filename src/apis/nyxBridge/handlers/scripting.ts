
import { register } from './index';
import { DDXError } from '../types';

register('scripting.executeScript', async (ctx, inj: any) => {
	if (!inj?.target?.tabId) throw new DDXError('invalid_argument', 'missing target.tabId');
	if (inj.files) throw new DDXError('not_supported', 'files: not supported in v1');
	const iframe = ctx.tabResolver.resolveIframe(inj.target.tabId);
	const win = iframe.contentWindow as any;
	if (!win) throw new DDXError('frame_not_found', 'no contentWindow');
	const fnSource = inj.func
		? `(${String(inj.func)}).apply(null, ${JSON.stringify(inj.args ?? [])})`
		: 'undefined';
	let result: unknown;
	let error: unknown;
	try {
		result = win.eval(fnSource);
	} catch (e: any) {
		error = e?.message ?? String(e);
	}
	return [{ frameId: 0, documentId: '', result, error }];
});

register('scripting.insertCSS', async (ctx, inj: any) => {
	const iframe = ctx.tabResolver.resolveIframe(inj.target.tabId);
	const doc = iframe.contentDocument;
	if (!doc) throw new DDXError('frame_not_found', 'no doc');
	if (!inj.css) throw new DDXError('invalid_argument', 'missing css');
	const style = doc.createElement('style');
	style.setAttribute('data-nyx-css-origin', inj.origin ?? 'AUTHOR');
	style.textContent = inj.css;
	doc.head.appendChild(style);
});

register('scripting.removeCSS', async () => {
	throw new DDXError('not_supported', 'removeCSS deferred to v2');
});
register('scripting.registerContentScripts', async () => {
	throw new DDXError('not_supported', 'use scriptInjectionRegistry directly (v2)');
});
register('scripting.unregisterContentScripts', async () => {
	throw new DDXError('not_supported', 'v2');
});
register('scripting.getRegisteredContentScripts', async () => []);
register('scripting.updateContentScripts', async () => {
	throw new DDXError('not_supported', 'v2');
});
