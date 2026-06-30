
import { DdxDownloadInterceptPlugin } from './scramjetPlugin';

interface ControllerLike {
  createFrame?: (...args: unknown[]) => unknown;
  frames?: Array<unknown>;
}

interface FrameLike {
  hooks?: { fetch?: { preresponse?: unknown } };
}

export async function installDownloadsSubsystem(controller: ControllerLike): Promise<void> {
  try {
    const { DownloadsManager, DefaultWebDownloadProvider } = await import('@apis/downloads');
    const mgr = DownloadsManager.getInstance();
    if (!mgr.listProviders().includes('web')) {
      mgr.registerProvider(new DefaultWebDownloadProvider());
    }
    (window as { downloadsManager?: import('@apis/downloads').DownloadsManager }).downloadsManager = mgr;
  } catch (err) {
    console.warn('[downloads] manager init failed:', err);
    return;
  }

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
