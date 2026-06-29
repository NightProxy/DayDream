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

  // `chrome.processes.*` — process introspection. DDX has no process
  // model (everything is one renderer + Scramjet SW). Returns safe
  // defaults; extensions that branch on process info pick the "no
  // info" path.

  getProcessIdForTab(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(-1); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(-1);
  }

  getProcessInfo(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb({}); } catch { /* swallow */ } return undefined; }
    return Promise.resolve({});
  }

  terminate(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(false); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(false);
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
