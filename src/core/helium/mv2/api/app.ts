import type { ExtensionContext } from '../../extfs/types';

export class ChromeApp {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public isInstalled: boolean = false;

  getDetails(..._args: any[]): any {
    throw new Error('chrome.app.getDetails is not implemented');
  }

  getIsInstalled(..._args: any[]): any {
    throw new Error('chrome.app.getIsInstalled is not implemented');
  }

  installState(..._args: any[]): any {
    throw new Error('chrome.app.installState is not implemented');
  }

  runningState(..._args: any[]): any {
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
