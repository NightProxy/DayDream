
import type { ExtensionContext } from '../../extfs/types';
import { readExtensionFile, writeExtensionFile } from '../../extfs';

const GLOBAL_FILE = '__helium_sidepanel__.json';
const TABS_FILE = '__helium_sidepanel_tabs__.json';

export interface SidePanelOptions {
	path?: string;
	enabled?: boolean;
	tabId?: number;
}

export interface SidePanelPanelBehavior {
	openPanelOnActionClick?: boolean;
}

interface StoredGlobal {
	version: 1;
	options: SidePanelOptions;
	behavior: SidePanelPanelBehavior;
}

interface StoredTabs {
	version: 1;
	options: Record<string, SidePanelOptions>;
}

function emptyGlobal(): StoredGlobal {
	return { version: 1, options: {}, behavior: {} };
}

function emptyTabs(): StoredTabs {
	return { version: 1, options: {} };
}

async function readGlobal(extId: string): Promise<StoredGlobal> {
	try {
		const bytes = await readExtensionFile(extId, GLOBAL_FILE);
		if (!bytes) return emptyGlobal();
		const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<StoredGlobal>;
		if (parsed.version !== 1) return emptyGlobal();
		return {
			version: 1,
			options: (parsed.options ?? {}) as SidePanelOptions,
			behavior: (parsed.behavior ?? {}) as SidePanelPanelBehavior,
		};
	} catch (err) {
		console.warn(`[helium/sidePanel] readGlobal(${extId}) failed:`, err);
		return emptyGlobal();
	}
}

async function writeGlobal(extId: string, data: StoredGlobal): Promise<void> {
	try {
		await writeExtensionFile(
			extId,
			GLOBAL_FILE,
			new TextEncoder().encode(JSON.stringify(data)),
		);
	} catch (err) {
		console.warn(`[helium/sidePanel] writeGlobal(${extId}) failed:`, err);
	}
}

async function readTabs(extId: string): Promise<StoredTabs> {
	try {
		const bytes = await readExtensionFile(extId, TABS_FILE);
		if (!bytes) return emptyTabs();
		const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<StoredTabs>;
		if (parsed.version !== 1) return emptyTabs();
		const options = (parsed.options ?? {}) as Record<string, SidePanelOptions>;
		return { version: 1, options };
	} catch (err) {
		console.warn(`[helium/sidePanel] readTabs(${extId}) failed:`, err);
		return emptyTabs();
	}
}

async function writeTabs(extId: string, data: StoredTabs): Promise<void> {
	try {
		await writeExtensionFile(
			extId,
			TABS_FILE,
			new TextEncoder().encode(JSON.stringify(data)),
		);
	} catch (err) {
		console.warn(`[helium/sidePanel] writeTabs(${extId}) failed:`, err);
	}
}

export class SidePanelHandlers {
	setOptions = async (
		ctx: ExtensionContext,
		args: unknown[],
	): Promise<void> => {
		const opts = (args[0] ?? {}) as SidePanelOptions;
		if (typeof opts.tabId === 'number') {
			const tabs = await readTabs(ctx.id);
			const key = String(opts.tabId);
			const prev = tabs.options[key] ?? {};
			const next: SidePanelOptions = { ...prev };
			if (typeof opts.path === 'string') next.path = opts.path;
			if (typeof opts.enabled === 'boolean') next.enabled = opts.enabled;
			tabs.options[key] = next;
			await writeTabs(ctx.id, tabs);
			return;
		}
		const global = await readGlobal(ctx.id);
		const nextOpts: SidePanelOptions = { ...global.options };
		if (typeof opts.path === 'string') nextOpts.path = opts.path;
		if (typeof opts.enabled === 'boolean') nextOpts.enabled = opts.enabled;
		global.options = nextOpts;
		await writeGlobal(ctx.id, global);
	};

	getOptions = async (
		ctx: ExtensionContext,
		args: unknown[],
	): Promise<SidePanelOptions> => {
		const arg = (args[0] ?? {}) as { tabId?: number };
		const global = await readGlobal(ctx.id);
		if (typeof arg.tabId === 'number') {
			const tabs = await readTabs(ctx.id);
			const perTab = tabs.options[String(arg.tabId)];
			const merged: SidePanelOptions = { ...global.options, ...(perTab ?? {}) };
			merged.tabId = arg.tabId;
			return merged;
		}
		return { ...global.options };
	};

	setPanelBehavior = async (
		ctx: ExtensionContext,
		args: unknown[],
	): Promise<void> => {
		const behavior = (args[0] ?? {}) as SidePanelPanelBehavior;
		const global = await readGlobal(ctx.id);
		const next: SidePanelPanelBehavior = { ...global.behavior };
		if (typeof behavior.openPanelOnActionClick === 'boolean') {
			next.openPanelOnActionClick = behavior.openPanelOnActionClick;
		}
		global.behavior = next;
		await writeGlobal(ctx.id, global);
	};

	getPanelBehavior = async (
		ctx: ExtensionContext,
		_args: unknown[],
	): Promise<SidePanelPanelBehavior> => {
		const global = await readGlobal(ctx.id);
		return { ...global.behavior };
	};

	/**
	 * No-op stub.
	 *
	 * NOTE(helium-t1-3): documented v1 limitation. Per the spec
	 * decision recorded at the top of this file, chrome.sidePanel is a
	 * data-only stub: setOptions/getOptions/setPanelBehavior round-trip
	 * through extfs, but `open()` does NOT render a panel because the
	 * DDX UI does not currently expose a third-column slot for
	 * extension content. Extensions calling `open()` see a resolved
	 * promise (Chrome-equivalent: returns void on success), which keeps
	 * caller flow intact while leaving the visual integration to a
	 * future product spec.
	 */
	open = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<void> => {
		// Intentionally a no-op.
	};
}
