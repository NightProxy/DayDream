
import { DdxSitePermissionsPlugin } from './scramjetPlugin';

interface ControllerLike {
  createFrame?: (...args: unknown[]) => unknown;
  frames?: Array<unknown>;
}

interface FrameLike {
  hooks?: { init?: { post?: unknown } };
}

export async function installSitePermissionsSubsystem(
  controller: ControllerLike,
): Promise<void> {
  try {
    const { installSitePermissionsHost } = await import('@apis/sitePermissions/host');
    installSitePermissionsHost();
    const { SitePermissionsStore } = await import('@apis/sitePermissions');
    (window as { sitePermissionsStore?: import('@apis/sitePermissions').SitePermissionsStore }).sitePermissionsStore =
      SitePermissionsStore.getInstance();
  } catch (err) {
    console.warn('[sitePerms] host init failed:', err);
    return;
  }

  const plugin = new DdxSitePermissionsPlugin();
  const installOnFrame = (frame: unknown): void => {
    const f = frame as FrameLike;
    if (!f?.hooks?.init?.post) return;
    try {
      plugin.install(f as Parameters<typeof plugin.install>[0]);
    } catch (err) {
      console.warn('[sitePerms] plugin install failed for frame:', err);
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

  console.log('[sitePerms] subsystem installed');
}
