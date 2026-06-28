import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '../../shared';

export class ChromeProcesses {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onExited: ChromeEvent = new ChromeEvent();
  public readonly onUnresponsive: ChromeEvent = new ChromeEvent();
  public readonly onCreated: ChromeEvent = new ChromeEvent();
  public readonly onUpdatedWithMemory: ChromeEvent = new ChromeEvent();
  public readonly onUpdated: ChromeEvent = new ChromeEvent();

  getProcessIdForTab(..._args: any[]): any {
    throw new Error('chrome.processes.getProcessIdForTab is not implemented');
  }

  getProcessInfo(..._args: any[]): any {
    throw new Error('chrome.processes.getProcessInfo is not implemented');
  }

  terminate(..._args: any[]): any {
    throw new Error('chrome.processes.terminate is not implemented');
  }

  static readonly ProcessType = {
    BROWSER: "browser",
    EXTENSION: "extension",
    GPU: "gpu",
    NACL: "nacl",
    NOTIFICATION: "notification",
    OTHER: "other",
    PLUGIN: "plugin",
    RENDERER: "renderer",
    SERVICE_WORKER: "service_worker",
    UTILITY: "utility",
    WORKER: "worker",
  } as const;

}
