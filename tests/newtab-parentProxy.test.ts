import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const newTabEntry = resolve(process.cwd(), 'src/pages/newtab/index.tsx');

describe('new-tab parent proxy access', () => {
	it('uses the parent proxy without importing its implementation', async () => {
		const source = await readFile(newTabEntry, 'utf8');

		expect(source).not.toContain("import type { Proxy } from '@apis/proxy';");
		expect(source).not.toContain("import { Proxy } from '@apis/proxy';");
	});

	it('uses the parent proxy directly rather than retaining a local alias', async () => {
		const source = await readFile(newTabEntry, 'utf8');

		expect(source).not.toContain('private proxy: Proxy;');
		expect(source).not.toContain('this.proxy');
	});
});
