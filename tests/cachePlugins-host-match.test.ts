import { describe, it, expect } from 'vitest';
import {
	compileHostPattern,
	hostMatchesPattern,
	normalizeHost,
	policySpecificity
} from '@apis/cachePlugins/host-match';

describe('normalizeHost', () => {
	it('lowercases', () => {
		expect(normalizeHost('GitHub.COM')).toBe('github.com');
	});
	it('strips port', () => {
		expect(normalizeHost('example.com:8080')).toBe('example.com');
	});
	it('strips trailing dot', () => {
		expect(normalizeHost('example.com.')).toBe('example.com');
	});
	it('strips user@', () => {
		expect(normalizeHost('user:pass@example.com:80')).toBe('example.com');
	});
	it('returns empty on garbage', () => {
		expect(normalizeHost('')).toBe('');
		expect(normalizeHost('   ')).toBe('');
	});
});

describe('compileHostPattern', () => {
	it('catch-all `*` matches any non-empty host', () => {
		const t = compileHostPattern('*');
		expect(t('github.com')).toBe(true);
		expect(t('a.b.c')).toBe(true);
		expect(t('')).toBe(false);
	});

	it('exact pattern matches only its host', () => {
		const t = compileHostPattern('github.com');
		expect(t('github.com')).toBe(true);
		expect(t('api.github.com')).toBe(false);
		expect(t('notgithub.com')).toBe(false);
	});

	it('`*.github.com` matches apex and any subdomain depth', () => {
		const t = compileHostPattern('*.github.com');
		expect(t('github.com')).toBe(true);
		expect(t('api.github.com')).toBe(true);
		expect(t('a.b.github.com')).toBe(true);
		expect(t('notgithub.com')).toBe(false);
		expect(t('github.com.evil.com')).toBe(false);
	});

	it('`docs.*` matches single-label rightward wildcard', () => {
		const t = compileHostPattern('docs.*');
		expect(t('docs.foo')).toBe(true);
		expect(t('docs.bar')).toBe(true);
		// Single-label wildcard: docs.foo.bar should NOT match docs.*
		// (mirrors browser-extension match-pattern behaviour)
		expect(t('docs.foo.bar')).toBe(false);
		expect(t('notdocs.foo')).toBe(false);
	});

	it('`api.*.github.com` matches with a single middle label', () => {
		const t = compileHostPattern('api.*.github.com');
		expect(t('api.v2.github.com')).toBe(true);
		expect(t('api.v3.github.com')).toBe(true);
		expect(t('api.github.com')).toBe(false);
		expect(t('api.v2.v3.github.com')).toBe(false);
	});
});

describe('hostMatchesPattern', () => {
	it('one-shot test convenience', () => {
		expect(hostMatchesPattern('api.github.com', '*.github.com')).toBe(true);
		expect(hostMatchesPattern('chase.com', 'chase.com')).toBe(true);
		expect(hostMatchesPattern('evil.com', '*.github.com')).toBe(false);
	});
});

describe('policySpecificity', () => {
	it('exact match beats wildcard match', () => {
		expect(policySpecificity('github.com')).toBeGreaterThan(
			policySpecificity('*.github.com')
		);
	});
	it('more labels = higher specificity', () => {
		expect(policySpecificity('api.v2.github.com')).toBeGreaterThan(
			policySpecificity('github.com')
		);
	});
	it('catch-all `*` is lowest', () => {
		expect(policySpecificity('*')).toBe(0);
		expect(policySpecificity('chase.com')).toBeGreaterThan(0);
	});
});
