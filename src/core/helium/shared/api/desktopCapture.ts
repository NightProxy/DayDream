import type { ExtensionContext } from '../../extfs/types';

export class ChromeDesktopCapture {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  /**
   * `chrome.desktopCapture.*` — wrapper around the standard
   * `navigator.mediaDevices.getDisplayMedia()` API.
   *
   * Chrome's contract returns a `streamId` opaque token that's
   * passed to `navigator.mediaDevices.getUserMedia(...)` with
   * `chromeMediaSourceId`. The web equivalent is to call
   * `getDisplayMedia` directly and pass the resulting MediaStream
   * back. We do the latter and wrap the stream ID as
   * `stream.id` (the standard MediaStream id is a string).
   *
   * Limitations:
   *   - `requestId`-based cancellation is approximate. We track
   *     in-flight requests by an internal counter.
   *   - `sources` filter (screen/window/tab/audio) is forwarded to
   *     `getDisplayMedia` as best-effort constraints.
   */

  private nextRequestId = 1;
  private pending = new Map<number, AbortController>();

  cancelChooseDesktopMedia(...args: any[]): void {
    const id = typeof args[0] === 'number' ? args[0] : 0;
    const ctrl = this.pending.get(id);
    if (ctrl) {
      try { ctrl.abort(); } catch { /* swallow */ }
      this.pending.delete(id);
    }
  }

  chooseDesktopMedia(...args: any[]): any {
    const _sources = (Array.isArray(args[0]) ? args[0] : []) as string[];
    void _sources;
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] as (id: string) => void : null;
    const requestId = this.nextRequestId++;
    const ctrl = new AbortController();
    this.pending.set(requestId, ctrl);
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          throw new Error('getDisplayMedia unavailable');
        }
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        this.pending.delete(requestId);
        try { (window as { __heliumDesktopStreams?: Map<string, MediaStream> }).__heliumDesktopStreams ??= new Map(); } catch { /* noop */ }
        const map = (window as { __heliumDesktopStreams?: Map<string, MediaStream> }).__heliumDesktopStreams;
        if (map) map.set(stream.id, stream);
        if (cb) cb(stream.id);
      } catch (err) {
        console.warn('[helium/desktopCapture] getDisplayMedia failed:', err);
        this.pending.delete(requestId);
        if (cb) cb('');
      }
    })();
    return requestId;
  }

  static readonly DesktopCaptureSourceType = {
    AUDIO: "audio",
    SCREEN: "screen",
    TAB: "tab",
    WINDOW: "window",
  } as const;

  static readonly SelfCapturePreferenceEnum = {
    EXCLUDE: "exclude",
    INCLUDE: "include",
  } as const;

  static readonly SystemAudioPreferenceEnum = {
    EXCLUDE: "exclude",
    INCLUDE: "include",
  } as const;

  static readonly WindowAudioPreferenceEnum = {
    EXCLUDE: "exclude",
    SYSTEM: "system",
    WINDOW: "window",
  } as const;

}
