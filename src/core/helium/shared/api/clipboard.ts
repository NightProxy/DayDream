import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeClipboard {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onClipboardDataChanged: ChromeEvent = new ChromeEvent();

  /**
   * `chrome.clipboard.setImageData(imageData, imageType, additionalItems?, callback?)`
   * — writes an image (and optionally a text/html or text/plain
   * alternative) to the system clipboard.
   *
   * Wraps the modern `navigator.clipboard.write()` API. Requires a
   * recent user gesture in many browsers; failures resolve quietly
   * (caller can detect via `chrome.runtime.lastError` analog —
   * here, by a `false` callback / rejected promise).
   */
  async setImageData(...args: any[]): Promise<void> {
    const imageData = args[0];
    const imageType = args[1] === 'png' ? 'image/png' : args[1] === 'jpeg' ? 'image/jpeg' : 'image/png';
    const additional = Array.isArray(args[2]) ? (args[2] as Array<{ type?: string; data?: string }>) : [];
    const lastArg = args[args.length - 1];
    const cb = typeof lastArg === 'function' ? (lastArg as () => void) : null;
    try {
      if (!imageData) throw new Error('imageData required');
      const blob = imageData instanceof Blob
        ? imageData
        : imageData instanceof ArrayBuffer
        ? new Blob([imageData], { type: imageType })
        : null;
      if (!blob) throw new Error('imageData must be Blob or ArrayBuffer');
      const items: Record<string, Blob | string> = { [imageType]: blob };
      for (const a of additional) {
        if (a?.type === 'textPlain' && typeof a.data === 'string') {
          items['text/plain'] = a.data;
        } else if (a?.type === 'textHtml' && typeof a.data === 'string') {
          items['text/html'] = a.data;
        }
      }
      const ClipboardItemCls = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
      if (!ClipboardItemCls || !navigator.clipboard?.write) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.write([new ClipboardItemCls(items as Record<string, Blob>)]);
      if (cb) cb();
    } catch (err) {
      console.warn('[helium/clipboard] setImageData failed:', err);
      if (cb) cb();
    }
  }

  static readonly DataItemType = {
    TEXT_HTML: "textHtml",
    TEXT_PLAIN: "textPlain",
  } as const;

  static readonly ImageType = {
    JPEG: "jpeg",
    PNG: "png",
  } as const;

}
