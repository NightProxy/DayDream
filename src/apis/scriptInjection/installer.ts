/**
 * installScriptInjector(controller)
 *
 * Wires `scriptInjectionRegistry` (./registry.ts) into Scramjet by
 * wrapping the per-frame `interface.getInjectScripts` factory exposed
 * via `Frame.prototype` `context` getter.
 *
 * Why this hook?
 * --------------
 * Scramjet's HTML rewriter calls `context.interface.getInjectScripts(
 *   meta, handler, htmlcontext, script
 * )` while parsing the document and unshifts the returned elements
 * into `<head>`. Whatever we return here becomes the first scripts
 * inside `<head>`, executing BEFORE any of the page's own inline or
 * external scripts. This is the equivalent of a browser-extension
 * content script with `run_at: document_start, world: MAIN`.
 *
 * The controller defines `getInjectScripts` as an IIFE that bakes in
 * scramjet's config + cookies. We don't touch that — we replace the
 * `interface` object on each `context` access with one whose
 * `getInjectScripts` calls the original then prepends our entries.
 *
 * Inline scripts are encoded into `data:text/javascript;base64,...`
 * URLs because the rewriter's `script` callback only knows how to
 * build external `<script src=...>` elements (this is the same trick
 * scramjet uses for its own bootstrap loader, see
 * `node_modules/@mercuryworkshop/scramjet-controller/dist/controller.api.js`).
 *
 * Idempotent. Re-invocation is a no-op.
 */

import {
	scriptInjectionRegistry,
	type InjectableScript
} from './registry';

type DomElement = unknown; // domhandler Element; we don't import its types

/**
 * Signature of the inner function the rewriter calls. We mirror it
 * loosely — only `meta.origin` is read, and `script` is called.
 */
type GetInjectScriptsFn = (
	meta: { origin: URL | { href: string } },
	handler: unknown,
	htmlcontext: unknown,
	script: (src: string) => DomElement
) => DomElement[];

let installed = false;

export function installScriptInjector(controller: unknown): void {
	if (installed) return;

	const sjController = (globalThis as any).$scramjetController as
		| {
				Frame?: { prototype: object };
		  }
		| undefined;

	const FrameClass = sjController?.Frame as
		| (new (...args: unknown[]) => unknown)
		| undefined;

	if (!FrameClass || typeof FrameClass !== 'function') {
		console.warn(
			'[scriptInjection] $scramjetController.Frame not found; injector not installed'
		);
		return;
	}

	const proto = FrameClass.prototype as Record<PropertyKey, unknown>;
	const descriptor = Object.getOwnPropertyDescriptor(proto, 'context');

	if (!descriptor || typeof descriptor.get !== 'function') {
		console.warn(
			'[scriptInjection] Frame.prototype.context getter not found; injector not installed'
		);
		return;
	}

	const originalGetter = descriptor.get as () => {
		interface?: { getInjectScripts?: GetInjectScriptsFn };
	};

	Object.defineProperty(proto, 'context', {
		configurable: true,
		enumerable: descriptor.enumerable ?? false,
		get(this: unknown) {
			const ctx = originalGetter.call(this);
			if (!ctx || !ctx.interface) return ctx;

			const originalGet = ctx.interface.getInjectScripts;
			if (typeof originalGet !== 'function') return ctx;

			// Avoid double-wrapping if this getter is somehow invoked
			// recursively. We tag the wrapper and bail if we see it.
			if ((originalGet as { __ddxWrapped?: boolean }).__ddxWrapped) {
				return ctx;
			}

			const wrapped: GetInjectScriptsFn = (
				meta,
				handler,
				htmlcontext,
				script
			) => {
				const baseScripts = originalGet.call(
					ctx.interface,
					meta,
					handler,
					htmlcontext,
					script
				);

				const url = resolveUrl(meta?.origin);
				if (!url) return baseScripts;

				const matched = scriptInjectionRegistry.matchesFor(url);
				if (matched.length === 0) return baseScripts;

				const prepend: DomElement[] = [];
				for (const entry of matched) {
					try {
						prepend.push(
							script(injectableToSrc(entry))
						);
					} catch (err) {
						console.warn(
							'[scriptInjection] failed to build script element:',
							err
						);
					}
				}

				// Order: registry-injected scripts run FIRST (before
				// scramjet's own bootstrap). This is intentional —
				// per-site shims must be live before any of the page's
				// own scripts so they can patch globals, set storage,
				// or otherwise prepare the environment.
				return [...prepend, ...baseScripts];
			};

			(wrapped as { __ddxWrapped?: boolean }).__ddxWrapped = true;
			ctx.interface.getInjectScripts = wrapped;
			return ctx;
		}
	});

	installed = true;
	void controller; // controller arg reserved for future use (e.g.
	// per-controller registries); currently we patch the class itself
	// so the controller instance is unused. Keep the parameter to
	// mirror `installEventsBridge(controller)` for call-site symmetry.
}

/**
 * URLMeta.origin is Scramjet's `_URL` snapshot; coerce to a real URL
 * we can run our matchers against. We accept both the snapshot
 * (which has `href`) and a real URL.
 */
function resolveUrl(origin: unknown): URL | null {
	if (!origin) return null;
	if (origin instanceof URL) return origin;
	try {
		const href = (origin as { href?: string }).href;
		if (typeof href === 'string' && href) return new URL(href);
	} catch {
		// fall through
	}
	return null;
}

/**
 * Convert a registry entry into a single URL the rewriter's `script`
 * callback can stuff into `<script src=...>`. Inline scripts are
 * base64-encoded into a data URL — same approach scramjet itself uses
 * for its bootstrap loader (see controller.api.js).
 */
function injectableToSrc(entry: InjectableScript): string {
	if (entry.kind === 'src') return entry.url;
	// kind === 'inline'
	const utf8 = new TextEncoder().encode(entry.code);
	let binary = '';
	for (let i = 0; i < utf8.length; i++) {
		binary += String.fromCharCode(utf8[i]!);
	}
	const b64 = btoa(binary);
	return `data:text/javascript;charset=utf-8;base64,${b64}`;
}
