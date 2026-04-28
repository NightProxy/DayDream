export class ChromeSidePanel {

  getLayout(...args: any[]): any {
    throw new Error('chrome.sidePanel.getLayout is not implemented');
  }

  getOptions(...args: any[]): any {
    throw new Error('chrome.sidePanel.getOptions is not implemented');
  }

  getPanelBehavior(...args: any[]): any {
    throw new Error('chrome.sidePanel.getPanelBehavior is not implemented');
  }

  open(...args: any[]): any {
    throw new Error('chrome.sidePanel.open is not implemented');
  }

  setOptions(...args: any[]): any {
    throw new Error('chrome.sidePanel.setOptions is not implemented');
  }

  setPanelBehavior(...args: any[]): any {
    throw new Error('chrome.sidePanel.setPanelBehavior is not implemented');
  }

  static readonly Side = {
    LEFT: "left",
    RIGHT: "right",
  } as const;

}
