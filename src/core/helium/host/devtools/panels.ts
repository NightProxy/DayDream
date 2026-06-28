// src/core/helium/host/devtools/panels.ts
//
// chrome.devtools.panels.* host handlers.
//
// Surface (per spec §24.2):
//   - panels.create(title, iconPath, pagePath, callback)
//       → spawns a new panel iframe in every open DevToolsSession;
//         returns the numeric panelId. If no session is open, buffers
//         the request and replays it on the next devtools-opened
//         event (Chrome's documented "deferred panel" behavior).
//   - ExtensionPanel.onShown / onHidden (fired from the panel host
//       via session.addExtensionPanel — see apis/devtools/panel.ts).
//   - panels.elements.createSidebarPane              — STUB
//   - panels.sources.createSidebarPane               — STUB
//   - panels.setOpenResourceHandler                  — STUB
//   - ExtensionPanel.createStatusBarButton           — STUB (on BG side)

import type { DevToolsManager } from '@apis/devtools';
import type { AddPanelOpts } from '@apis/devtools';
import { readExtensionFile } from '../../extfs';
import { contentTypeFromPath } from '../../extfs/mime';
import { HeliumExtensionPlugin } from '../../extfs/plugin';
import type { ExtensionContext } from '../../extfs/types';

interface PanelsDeps {
	getDevToolsManager: () => DevToolsManager | null;
	/**
	 * Returns the Scramjet Proxy (its createFrame) so we can attach a
	 * HeliumExtensionPlugin to each extension panel iframe. Without
	 * this, extension scripts inside the panel can't fetch their own
	 * static files under https://<extId>.ddx.
	 */
	getProxy: () => { createFrame: (el: HTMLIFrameElement, opts: { plugins: unknown[] }) => Promise<unknown> } | null;
	/**
	 * Notify host when a panel becomes shown/hidden so the BG side can
	 * fire ExtensionPanel.onShown/onHidden listeners. Caller is the
	 * ExtensionManager which forwards via fireEventOn.
	 */
	fireOnShown: (extId: string, panelId: number) => void;
	fireOnHidden: (extId: string, panelId: number) => void;
}

/**
 * A deferred panel-create call, waiting for a DevToolsSession to open.
 * Synthetic ids live in a negative range so they cannot collide with
 * the global PanelEntry counter (which starts at 1 and increments).
 */
interface PendingPanel {
	syntheticId: number;
	ctx: ExtensionContext;
	title: string;
	iconUrl: string;
	iframeSrc: string;
}

export class PanelsHandlers {
	private pending: Map<string, PendingPanel[]> = new Map();
	private nextSyntheticId = -1;

	constructor(private readonly deps: PanelsDeps) {}

	/**
	 * Add an extension panel to every currently-open DevToolsSession.
	 * Resolves `iconPath` to a data URL by reading the extension's
	 * static file. Returns the numeric panelId of the first session's
	 * registration (panelIds are stable across sessions for the same
	 * call thanks to the global counter in panel.ts). If no devtools
	 * session is open, allocates a synthetic negative id, buffers the
	 * descriptor, and returns the synthetic id immediately; the panel
	 * is materialized when the next devtools session opens (via
	 * `flushPendingFor(tabId)`).
	 *
	 * Args layout: [title, iconPath, pagePath]
	 */
	create = async (
		ctx: ExtensionContext,
		args: unknown[],
	): Promise<number> => {
		const title = String(args[0] ?? '');
		const iconPath = String(args[1] ?? '');
		const pagePath = String(args[2] ?? '');
		if (!title || !pagePath) {
			throw new Error('chrome.devtools.panels.create: title and pagePath required');
		}
		const mgr = this.deps.getDevToolsManager();
		if (!mgr) {
			throw new Error('chrome.devtools.panels.create: DevToolsManager unavailable');
		}

		const iconUrl = await this.resolveIconDataUrl(ctx, iconPath);
		const iframeSrc = `https://${ctx.origin}/${pagePath.replace(/^\/+/, '')}`;

		const sessions = mgr.listSessions();
		if (sessions.length === 0) {
			// No open devtools — Chrome buffers the panel for when
			// devtools opens. Allocate a synthetic id from a private
			// negative range so the BG-side caller has something stable
			// to identify the panel by in subsequent on{Shown,Hidden}
			// fan-out, then queue the descriptor.
			const syntheticId = this.nextSyntheticId--;
			const queue = this.pending.get(ctx.id) ?? [];
			queue.push({ syntheticId, ctx, title, iconUrl, iframeSrc });
			this.pending.set(ctx.id, queue);
			return syntheticId;
		}

		return this.mountIntoSessions(ctx, title, iconUrl, iframeSrc);
	};

	/**
	 * Replay any pending panel descriptors for `extId` (or for every
	 * extension if `extId` is omitted) against the currently-open
	 * DevToolsSessions. Called by the host wiring layer after the
	 * `helium:devtools-opened` event fires.
	 */
	flushPending(extId?: string): void {
		const mgr = this.deps.getDevToolsManager();
		if (!mgr || mgr.listSessions().length === 0) return;
		const targets = extId !== undefined
			? (this.pending.has(extId) ? [extId] : [])
			: Array.from(this.pending.keys());
		for (const id of targets) {
			const queue = this.pending.get(id);
			if (!queue || queue.length === 0) continue;
			this.pending.delete(id);
			for (const p of queue) {
				this.mountIntoSessions(p.ctx, p.title, p.iconUrl, p.iframeSrc).catch(
					(err) => console.warn('[helium/devtools] deferred panel mount failed:', err),
				);
			}
		}
	}

	/**
	 * Drop any buffered panels for `extId` (e.g. when the extension is
	 * killed before devtools opens).
	 */
	clearPending(extId: string): void {
		this.pending.delete(extId);
	}

	private async mountIntoSessions(
		ctx: ExtensionContext,
		title: string,
		iconUrl: string,
		iframeSrc: string,
	): Promise<number> {
		const mgr = this.deps.getDevToolsManager();
		if (!mgr) {
			throw new Error('chrome.devtools.panels.create: DevToolsManager unavailable');
		}
		const sessions = mgr.listSessions();
		if (sessions.length === 0) {
			throw new Error('chrome.devtools.panels.create: no open DevTools (after flush)');
		}
		const proxy = this.deps.getProxy();
		let firstPanelId: number | null = null;
		for (const session of sessions) {
			const addOpts: AddPanelOpts = {
				title,
				iconUrl,
				iframeSrc,
				extId: ctx.id,
				onShown: () => this.deps.fireOnShown(ctx.id, firstPanelId ?? -1),
				onHidden: () => this.deps.fireOnHidden(ctx.id, firstPanelId ?? -1),
				mountIframe: (iframe, src) => this.mountWithPlugin(iframe, src, ctx, proxy),
			};
			const entry = session.addExtensionPanel(addOpts);
			if (firstPanelId === null) firstPanelId = entry.id;
		}
		return firstPanelId ?? -1;
	}

	// --- Stubs --------------------------------------------------------

	elementsCreateSidebarPane = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<{ id: number }> => ({ id: -1 });

	sourcesCreateSidebarPane = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<{ id: number }> => ({ id: -1 });

	setOpenResourceHandler = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<void> => undefined;

	// --- internals ----------------------------------------------------

	private async resolveIconDataUrl(
		ctx: ExtensionContext,
		iconPath: string,
	): Promise<string> {
		if (!iconPath) return '';
		const rel = iconPath.replace(/^\/+/, '');
		try {
			const bytes = await readExtensionFile(ctx.id, rel);
			if (!bytes) return '';
			const mime = contentTypeFromPath(rel);
			// Force a tight ArrayBuffer copy so Blob accepts the BlobPart
			// even when the underlying buffer type is SharedArrayBuffer
			// (which can happen depending on the upstream lib types).
			const ab = new ArrayBuffer(bytes.byteLength);
			new Uint8Array(ab).set(bytes);
			const blob = new Blob([ab], { type: mime });
			return await new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(String(reader.result ?? ''));
				reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
				reader.readAsDataURL(blob);
			});
		} catch (err) {
			console.warn(
				'[helium/devtools] panels.create: icon read failed for',
				iconPath,
				err,
			);
			return '';
		}
	}

	private async mountWithPlugin(
		iframe: HTMLIFrameElement,
		src: string,
		ctx: ExtensionContext,
		proxy: ReturnType<PanelsDeps['getProxy']>,
	): Promise<void> {
		if (!proxy) {
			// No Scramjet proxy — fall back to raw iframe load. Extension
			// scripts will fail to fetch their own files, but at least
			// the iframe attaches to the DOM.
			console.warn(
				'[helium/devtools] panels.create: no proxy available, raw load',
			);
			iframe.src = src;
			return;
		}
		try {
			const plugin = new HeliumExtensionPlugin(ctx);
			const frame = (await proxy.createFrame(iframe, {
				plugins: [plugin],
			})) as { go?: (url: string) => void };
			if (typeof frame?.go === 'function') {
				frame.go(src);
			} else {
				iframe.src = src;
			}
		} catch (err) {
			console.warn('[helium/devtools] panels.create: proxy.createFrame failed', err);
			iframe.src = src;
		}
	}
}
