export class ChromePower {

  releaseKeepAwake(...args: any[]): any {
    throw new Error('chrome.power.releaseKeepAwake is not implemented');
  }

  requestKeepAwake(...args: any[]): any {
    throw new Error('chrome.power.requestKeepAwake is not implemented');
  }

  static readonly Level = {
    DISPLAY: "display",
    SYSTEM: "system",
  } as const;

}
