import { SettingsAPI } from '@apis/settings';
import { ProfilesAPI } from '@apis/profiles';
import { SearchEngineRegistry } from '@apis/searchEngines';
import { universalTheme } from '@utils/global/universalTheme';
import { checkNightPlusStatus } from '@apis/nightplus';
import { basePath, resolvePath } from '@utils/basepath';
import type { BootReadiness } from './readiness';

export interface BackgroundResult {
	SW: ServiceWorkerRegistration;
	settingsAPI: SettingsAPI;
	profilesAPI: ProfilesAPI;
	searchEngines: SearchEngineRegistry;
}

export async function backgroundInit(
	readiness: BootReadiness,
): Promise<BackgroundResult> {
	const settingsAPI = new SettingsAPI();

	const [SW, , profilesAPI] = await Promise.all([
		navigator.serviceWorker
			.register(resolvePath('sw.js'), { scope: basePath })
			.then(async (reg) => {
				await navigator.serviceWorker.ready;
				return reg;
			}),
		universalTheme.init().then(() => {
			const theming = universalTheme.getTheming();
			theming.applyTheme(theming.currentTheme);
		}),
		(async () => {
			const p = new ProfilesAPI(checkNightPlusStatus, 3);
			await p.initPromise;
			return p;
		})(),
	]);

	const searchEngines = new SearchEngineRegistry(settingsAPI);
	await searchEngines.load();

	readiness.resolveSettings();

	return { SW, settingsAPI, profilesAPI, searchEngines };
}
