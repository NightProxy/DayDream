export class ChromeApp {
  public isInstalled: boolean = false;

  getDetails(...args: any[]): any {
    throw new Error('chrome.app.getDetails is not implemented');
  }

  getIsInstalled(...args: any[]): any {
    throw new Error('chrome.app.getIsInstalled is not implemented');
  }

  installState(...args: any[]): any {
    throw new Error('chrome.app.installState is not implemented');
  }

  runningState(...args: any[]): any {
    throw new Error('chrome.app.runningState is not implemented');
  }

  static readonly InstallState = {
    DISABLED: "disabled",
    INSTALLED: "installed",
    NOT_INSTALLED: "not_installed",
  } as const;

  static readonly RunningState = {
    CANNOT_RUN: "cannot_run",
    READY_TO_RUN: "ready_to_run",
    RUNNING: "running",
  } as const;

}
