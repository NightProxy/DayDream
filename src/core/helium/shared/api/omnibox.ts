import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeOmnibox {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onInputStarted: ChromeEvent = new ChromeEvent();
  public readonly onInputChanged: ChromeEvent = new ChromeEvent();
  public readonly onInputEntered: ChromeEvent = new ChromeEvent();
  public readonly onInputCancelled: ChromeEvent = new ChromeEvent();
  public readonly onDeleteSuggestion: ChromeEvent = new ChromeEvent();

  setDefaultSuggestion(..._args: any[]): any {
    throw new Error('chrome.omnibox.setDefaultSuggestion is not implemented');
  }

  static readonly DescriptionStyleType = {
    URL: 'url',
    MATCH: 'match',
    DIM: 'dim',
  } as const;
}
