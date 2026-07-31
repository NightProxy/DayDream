import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	testMatch: '**/*.spec.ts',
	timeout: 60_000,
	fullyParallel: false,
	reporter: [['list']],
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
		headless: true,
		viewport: { width: 1280, height: 720 },
		launchOptions: {
			executablePath: '/usr/bin/chromium',
		},
	},
	projects: [
		{ name: 'chromium' },
	],
	webServer: {
		command: 'tsx devserver.ts',
		url: 'http://localhost:5173',
		reuseExistingServer: true,
		timeout: 60_000,
	},
});
