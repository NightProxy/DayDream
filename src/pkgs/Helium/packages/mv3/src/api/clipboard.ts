import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeClipboard {
  public readonly onClipboardDataChanged: ChromeEvent = new ChromeEvent();

  setImageData(...args: any[]): any {
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
