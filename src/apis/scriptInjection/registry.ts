/**
 * ScriptInjectionRegistry — generic per-site script injection for
 * Scramjet-proxied frames.
 *
 * The registry is consumed by `installScriptInjector` (./installer.ts)
 * which wraps Scramjet's per-frame `interface.getInjectScripts` so any
 * registered scripts get prepended into `<head>` of matched documents,
 * before any of the page's own scripts execute.
 *
 * This file knows nothing about Scramjet — it's a plain data structure.
 *
 * Lifecycle: registrations should be made at module load (eagerly) so
 * that they're in place before the first proxied navigation happens.
 * Registrations made after a frame has already started rewriting its
 * current document do not retroactively affect it.
 */

export type InjectableScript =
	/**
	 * A script loaded from a same-origin URL. The URL must be reachable
	 * via a non-Scramjet-prefixed path (typically under `/assets/`) so
	 * the SW serves it directly without proxy rewriting.
	 */
	| { kind: 'src'; url: string; type?: 'classic' | 'module' }
	/**
	 * Inline script body. Encoded into a `data:text/javascript;base64,...`
	 * URL by the installer because Scramjet's `getInjectScripts`
	 * callback only knows how to construct external `<script src=...>`
	 * elements.
	 */
	| { kind: 'inline'; code: string };

export interface ScriptInjectionEntry {
	/** Stable identifier; used for idempotent re-registration & removal. */
	id: string;
	/**
	 * Predicate over the page URL being rewritten. Receives the real
	 * (decoded) origin URL of the document, NOT the Scramjet-rewritten
	 * one. Return true to inject this entry's scripts into that page.
	 */
	match: (url: URL) => boolean;
	/** Scripts to inject, in registration/array order. */
	scripts: InjectableScript[];
}

class ScriptInjectionRegistryImpl {
	private entries = new Map<string, ScriptInjectionEntry>();

	register(entry: ScriptInjectionEntry): void {
		this.entries.set(entry.id, entry);
	}

	unregister(id: string): boolean {
		return this.entries.delete(id);
	}

	/**
	 * Returns the flat list of scripts that match the given URL, in
	 * registration order across entries and in-array order within each
	 * entry. Caller is expected to inject them in the returned order.
	 */
	matchesFor(url: URL): InjectableScript[] {
		const out: InjectableScript[] = [];
		for (const entry of this.entries.values()) {
			let matches = false;
			try {
				matches = entry.match(url);
			} catch (err) {
				console.warn(
					`[scriptInjection] match() threw for entry "${entry.id}":`,
					err
				);
				continue;
			}
			if (matches) out.push(...entry.scripts);
		}
		return out;
	}

	/** Number of registered entries. Useful for tests/diagnostics. */
	size(): number {
		return this.entries.size;
	}

	/** Diagnostic snapshot. Returned array is a copy; safe to mutate. */
	list(): ScriptInjectionEntry[] {
		return [...this.entries.values()];
	}
}

export const scriptInjectionRegistry = new ScriptInjectionRegistryImpl();
export type ScriptInjectionRegistry = ScriptInjectionRegistryImpl;
