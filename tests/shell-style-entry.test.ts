import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const shellEntry = resolve(process.cwd(), 'src/index.ts');

describe('shell stylesheet entry', () => {
	it('loads shell styles into the main document as well as the shadow root', async () => {
		const source = await readFile(shellEntry, 'utf8');

		expect(source).toContain("import '@css/vars.scss';");
		expect(source).toContain("import '@css/imports.scss';");
		expect(source).toContain("import '@css/tailwind.css';");
		expect(source).toContain("import '@css/global.scss';");
		expect(source).toContain("import 'basecoat-css/all';");
	});
});
