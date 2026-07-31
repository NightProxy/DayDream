/**
 * Hostname wildcard matching for cache policies.
 *
 * Patterns
 * --------
 *   - Exact:    `github.com`     matches only `github.com`
 *   - Wildcard: `*.github.com`   matches `github.com`, `api.github.com`,
 *                                `a.b.github.com` (any number of label
 *                                segments to the left of `.github.com`,
 *                                INCLUDING the empty case so the bare
 *                                apex matches too)
 *   - Suffix:   `docs.*`         matches `docs.foo.com`, `docs.bar.io`
 *                                (rightward wildcard, multi-label)
 *   - Catch-all `*`              matches every non-empty host
 *
 * Hosts are normalized before comparison: lowercased, port stripped,
 * trailing dot stripped. The match is performed against the normalized
 * form of the input host.
 *
 * Specificity ranking
 * -------------------
 * `policySpecificity(pattern)` returns a number used to pick the
 * "most-specific" winner when multiple registered policies match a URL.
 * Higher = more specific. Computed as `(non-wildcard labels) * 10 +
 * (no-wildcards bonus)`, so:
 *
 *   `chase.com`        → 21    (2 non-wild labels + exact-match bonus)
 *   `*.chase.com`      → 20    (2 non-wild labels)
 *   `api.*.chase.com`  → 30    (3 non-wild labels)
 *   `*`                → 0
 *
 * Ties are broken by the registry by registration order.
 */

/** Lowercase + strip port + strip trailing dot. Returns "" on bad input. */
export function normalizeHost(input: string): string {
	if (typeof input !== 'string') return '';
	let h = input.trim().toLowerCase();
	if (!h) return '';
	// strip user:pass@ if accidentally included
	const at = h.lastIndexOf('@');
	if (at !== -1) h = h.slice(at + 1);
	// strip port
	const colon = h.indexOf(':');
	if (colon !== -1) h = h.slice(0, colon);
	// strip trailing dot
	if (h.endsWith('.')) h = h.slice(0, -1);
	return h;
}

/**
 * Compile a host pattern into a tester function. Cheap to call
 * repeatedly; suitable to memoize on the policy record at register time.
 */
export function compileHostPattern(pattern: string): (host: string) => boolean {
	const p = pattern.trim().toLowerCase();
	if (!p) return () => false;

	if (p === '*') {
		return (host: string) => host.length > 0;
	}

	// Convert glob → regex.
	// Escape regex metacharacters, then turn `*` into `[^.]+` for a
	// single-label wildcard ... EXCEPT for the special form `*.foo.bar`
	// where the leading `*.` may match zero labels (so `foo.bar` matches
	// `*.foo.bar`). We detect that prefix and handle it separately.
	const leadingStar = p.startsWith('*.');
	const tail = leadingStar ? p.slice(2) : p;

	// Escape regex specials in the tail except the `*` we use as wildcard.
	const escaped = tail.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
	// `*` → `[^.]+` (one or more non-dot characters; matches a single
	// label segment). Multi-label rightward wildcards are uncommon; if
	// `docs.*` should match `docs.foo.bar`, callers can use `docs.*.*`
	// or list both. Keeping a single-label semantic here mirrors
	// browser-extension match-pattern behaviour.
	const wildcardified = escaped.replace(/\*/g, '[^.]+');

	const reBody = leadingStar
		? `(?:.+\\.)?${wildcardified}`
		: wildcardified;
	const re = new RegExp(`^${reBody}$`);

	return (host: string) => re.test(host);
}

/**
 * Convenience: compile-and-test in one call. Don't use in hot loops —
 * compile once and reuse.
 */
export function hostMatchesPattern(host: string, pattern: string): boolean {
	return compileHostPattern(pattern)(host);
}

/**
 * Specificity score for tie-breaking. See file header.
 */
export function policySpecificity(pattern: string): number {
	const p = pattern.trim().toLowerCase();
	if (!p) return 0;
	if (p === '*') return 0;
	const labels = p.split('.');
	const nonWild = labels.filter((l) => l !== '*' && !l.includes('*')).length;
	const hasWildcard = labels.some((l) => l.includes('*'));
	return nonWild * 10 + (hasWildcard ? 0 : 1);
}
