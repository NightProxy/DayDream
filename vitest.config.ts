import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
	// Scope tsconfck to the root tsconfig only — prevents the plugin from
	// recursing into `concepting/` (vendored Playwright fixture tsconfigs)
	// and printing TSConfckParseError noise on every test run.
	plugins: [tsconfigPaths({ projects: ['./tsconfig.json'] })],
	test: {
		environment: 'jsdom',
		globals: false,
		include: ['tests/**/*.test.ts'],
		exclude: ['node_modules', 'dist'],
		passWithNoTests: true,
	},
});
