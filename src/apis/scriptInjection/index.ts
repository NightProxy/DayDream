/**
 * Generic per-site script injection for Scramjet-proxied frames.
 *
 * Public surface:
 *   - `scriptInjectionRegistry` — register/unregister per-site script entries.
 *   - `installScriptInjector(controller)` — wire the registry into Scramjet.
 *     Call once during proxy initialization (already wired in `@apis/proxy`).
 *
 * Usage:
 *   import { scriptInjectionRegistry } from '@apis/scriptInjection';
 *
 *   scriptInjectionRegistry.register({
 *     id: 'my-shim',
 *     match: (url) => url.hostname === 'example.com',
 *     scripts: [
 *       { kind: 'inline', code: 'window.__myShim = true;' },
 *       { kind: 'src', url: '/assets/my-shim.js' },
 *     ],
 *   });
 *
 * Registrations should happen at module-load time (eagerly) so they
 * are in place before the first proxied navigation.
 *
 * Architecture: see ./installer.ts for the hook-point explanation.
 */

export {
	scriptInjectionRegistry,
	type ScriptInjectionEntry,
	type InjectableScript,
	type ScriptInjectionRegistry
} from './registry';
export { installScriptInjector } from './installer';
