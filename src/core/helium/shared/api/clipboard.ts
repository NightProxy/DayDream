import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeClipboard {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onClipboardDataChanged: ChromeEvent = new ChromeEvent();

  setImageData(..._args: any[]): any {
    throw new Error('chrome.clipboard.setImageData is not implemented');
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
