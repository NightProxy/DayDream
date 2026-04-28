export class ChromeSearch {

  query(...args: any[]): any {
    throw new Error('chrome.search.query is not implemented');
  }

  static readonly Disposition = {
    CURRENT_TAB: "CURRENT_TAB",
    NEW_TAB: "NEW_TAB",
    NEW_WINDOW: "NEW_WINDOW",
  } as const;

}
