// src/browser/downloads/install.ts
//
// Boot wiring for the downloads subsystem.
//
//   1. Register the default web download provider so
//      `chrome.downloads.download()` works out of the box.
//   2. Install the Scramjet download-intercept plugin onto every
//      Frame the controller creates. Existing frames are also
//      retrofitted at install time.
//
// External platforms (Tier OS etc.) can register their own provider
// via `window.downloadsManager.registerProvider(...)` AFTER this
// runs. The default provider stays installed alongside — providers
// don't conflict; downloads route to the explicit `provider` name in
// `DownloadOptions`, or fall back to the first-registered default.

import { DdxDownloadInterceptPlugin } from './scramjetPlugin';

interface ControllerLike {
  createFrame?: (...args: unknown[]) => unknown;
  frames?: Array<unknown>;
}

interface FrameLike {
  hooks?: { fetch?: { preresponse?: unknown } };
}

export async function installDownloadsSubsystem(controller: ControllerLike): Promise<void> {
  // 1. Register the default web provider so the manager has a
  //    fallback target.
  try {
    const { DownloadsManager, DefaultWebDownloadProvider } = await import('@apis/downloads');
    const mgr = DownloadsManager.getInstance();
    if (!mgr.listProviders().includes('web')) {
      mgr.registerProvider(new DefaultWebDownloadProvider());
    }
    // Expose globally for external platforms to plug into.
    (window as { downloadsManager?: import('@apis/downloads').DownloadsManager }).downloadsManager = mgr;
  } catch (err) {
    console.warn('[downloads] manager init failed:', err);
    return;
  }

  // 2. Wrap createFrame so every new Frame gets the intercept plugin.
  const plugin = new DdxDownloadInterceptPlugin();

  const installOnFrame = (frame: unknown): void => {
    const f = frame as FrameLike;
    if (!f?.hooks?.fetch?.preresponse) return;
    try {
      plugin.install(f as Parameters<typeof plugin.install>[0]);
    } catch (err) {
      console.warn('[downloads] plugin install failed for frame:', err);
    }
  };

  if (Array.isArray(controller.frames)) {
    for (const frame of controller.frames) installOnFrame(frame);
  }

  const original = controller.createFrame?.bind(controller);
  if (typeof original === 'function') {
    controller.createFrame = (...args: unknown[]) => {
      const frame = original(...args);
      if (frame) installOnFrame(frame);
      return frame;
    };
  }

  console.log('[downloads] subsystem installed');
}
