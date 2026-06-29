// src/core/helium/host/management/handlers.ts
//
// chrome.management.* host handlers (spec §26.3).
//
// Reads installed-extension metadata from extfs (listExtensions /
// getExtension) and performs lifecycle ops by delegating to the host
// ExtensionManager via the injected deps.
//
// The ExtensionInfo shape mirrors Chrome's docs:
//   { id, name, shortName, description, version, mayDisable, enabled,
//     isApp, type, homepageUrl?, updateUrl?, offlineEnabled, optionsUrl?,
//     icons?, permissions, hostPermissions, installType }
//
// Methods that don't apply to a browser extension model — launchApp,
// createAppShortcut, setLaunchType, generateAppForLink — throw
// 'not_supported'. getPermissionWarningsBy* return [] (no warning UI).

import type { ExtensionContext } from '../../extfs/types';
import {
	getExtension,
	listExtensions,
	type ExtensionIndexEntry,
} from '../../extfs';
import type { ChromeManifest, FirefoxManifest } from '../../shared/unpack/types';

export interface ManagementHandlerDeps {
	setEnabled: (id: string, enabled: boolean) => Promise<void>;
	uninstall: (id: string) => Promise<void>;
}

export interface IconInfo {
	size: number;
	url: string;
}

export interface ExtensionInfo {
	id: string;
	name: string;
	shortName: string;
	description: string;
	version: string;
	versionName?: string;
	mayDisable: boolean;
	enabled: boolean;
	isApp: false;
	type: 'extension' | 'theme';
	appLaunchUrl?: string;
	homepageUrl?: string;
	updateUrl?: string;
	offlineEnabled: false;
	optionsUrl?: string;
	icons?: IconInfo[];
	permissions: string[];
	hostPermissions: string[];
	installType: 'normal';
}

function notSupported(method: string): never {
	throw new Error(`chrome.management.${method} is not supported`);
}

function manifestPermissions(m: ChromeManifest | FirefoxManifest): string[] {
	const perms = (m as { permissions?: unknown }).permissions;
	if (!Array.isArray(perms)) return [];
	return perms.filter((p): p is string => typeof p === 'string');
}

function manifestHostPermissions(m: ChromeManifest | FirefoxManifest): string[] {
	const hosts = (m as { host_permissions?: unknown }).host_permissions;
	if (!Array.isArray(hosts)) return [];
	return hosts.filter((p): p is string => typeof p === 'string');
}

function buildIcons(
	entry: ExtensionIndexEntry,
	manifest: ChromeManifest | FirefoxManifest,
): IconInfo[] | undefined {
	const icons = (manifest as { icons?: Record<string, string> }).icons;
	if (!icons || typeof icons !== 'object') return undefined;
	const out: IconInfo[] = [];
	for (const [k, v] of Object.entries(icons)) {
		const size = Number.parseInt(k, 10);
		if (!Number.isFinite(size) || typeof v !== 'string') continue;
		const cleaned = v.replace(/^\/+/, '');
		out.push({ size, url: `https://${entry.id}.ddx/${cleaned}` });
	}
	if (out.length === 0) return undefined;
	out.sort((a, b) => a.size - b.size);
	return out;
}

function buildOptionsUrl(
	entry: ExtensionIndexEntry,
	manifest: ChromeManifest | FirefoxManifest,
): string | undefined {
	const m = manifest as { options_page?: string; options_ui?: { page?: string } };
	const path = m.options_page ?? m.options_ui?.page;
	if (typeof path !== 'string' || path.length === 0) return undefined;
	const cleaned = path.replace(/^\/+/, '');
	return `https://${entry.id}.ddx/${cleaned}`;
}

export function buildExtensionInfo(
	entry: ExtensionIndexEntry,
	manifest: ChromeManifest | FirefoxManifest,
): ExtensionInfo {
	const m = manifest as {
		short_name?: string;
		description?: string;
		homepage_url?: string;
		update_url?: string;
		version_name?: string;
	};
	const info: ExtensionInfo = {
		id: entry.id,
		name: entry.name,
		shortName: typeof m.short_name === 'string' ? m.short_name : entry.name,
		description: typeof m.description === 'string' ? m.description : '',
		version: entry.version,
		mayDisable: true,
		enabled: entry.enabled,
		isApp: false,
		type: (manifest as any)?.theme ? 'theme' : 'extension',
		offlineEnabled: false,
		permissions: manifestPermissions(manifest),
		hostPermissions: manifestHostPermissions(manifest),
		installType: 'normal',
	};
	// Optional fields, only set if present in manifest. `version_name`
	// is a user-friendly version label (e.g. "v3.0 beta") distinct from
	// the strict numeric `version`. Real Chrome surfaces it here when
	// declared; some extensions check for it.
	if (typeof m.version_name === 'string') info.versionName = m.version_name;
	if (typeof m.homepage_url === 'string') info.homepageUrl = m.homepage_url;
	if (typeof m.update_url === 'string') info.updateUrl = m.update_url;
	const optionsUrl = buildOptionsUrl(entry, manifest);
	if (optionsUrl) info.optionsUrl = optionsUrl;
	const icons = buildIcons(entry, manifest);
	if (icons) info.icons = icons;
	return info;
}

async function loadInfo(id: string): Promise<ExtensionInfo | null> {
	const got = await getExtension(id);
	if (!got) return null;
	return buildExtensionInfo(got.entry, got.manifest);
}

export class ManagementHandlers {
	constructor(private readonly deps: ManagementHandlerDeps) {}

	getAll = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<ExtensionInfo[]> => {
		const entries = await listExtensions();
		const out: ExtensionInfo[] = [];
		for (const entry of entries) {
			const info = await loadInfo(entry.id);
			if (info) out.push(info);
		}
		return out;
	};

	get = async (
		_ctx: ExtensionContext,
		args: unknown[],
	): Promise<ExtensionInfo> => {
		const id = String(args[0] ?? '');
		const info = await loadInfo(id);
		if (!info) throw new Error(`Extension ${id} not installed`);
		return info;
	};

	getSelf = async (
		ctx: ExtensionContext,
		_args: unknown[],
	): Promise<ExtensionInfo> => {
		const info = await loadInfo(ctx.id);
		if (info) return info;
		// Fall back to whatever we can synthesize from ctx — the
		// extension is clearly running so this should rarely happen,
		// but cover the case where extfs read fails.
		return {
			id: ctx.id,
			name: ctx.id,
			shortName: ctx.id,
			description: '',
			version: '',
			mayDisable: true,
			enabled: true,
			isApp: false,
			type: (ctx.manifest as any)?.theme ? 'theme' : 'extension',
			offlineEnabled: false,
			permissions: manifestPermissions(ctx.manifest),
			hostPermissions: manifestHostPermissions(ctx.manifest),
			installType: 'normal',
		};
	};

	setEnabled = async (
		_ctx: ExtensionContext,
		args: unknown[],
	): Promise<void> => {
		const id = String(args[0] ?? '');
		const enabled = args[1] === true;
		await this.deps.setEnabled(id, enabled);
	};

	uninstall = async (
		_ctx: ExtensionContext,
		args: unknown[],
	): Promise<void> => {
		const id = String(args[0] ?? '');
		// args[1] may be {showConfirmDialog?: boolean} — ignored; Helium
		// has no built-in confirmation UI for management-driven uninstall.
		await this.deps.uninstall(id);
	};

	uninstallSelf = async (
		ctx: ExtensionContext,
		_args: unknown[],
	): Promise<void> => {
		await this.deps.uninstall(ctx.id);
	};

	getPermissionWarningsById = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<string[]> => [];

	getPermissionWarningsByManifest = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<string[]> => [];

	launchApp = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<never> => notSupported('launchApp');

	createAppShortcut = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<never> => notSupported('createAppShortcut');

	setLaunchType = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<never> => notSupported('setLaunchType');

	generateAppForLink = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<never> => notSupported('generateAppForLink');
}
