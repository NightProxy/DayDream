
import type { ExtensionContext } from '../../extfs/types';
import type {
  NotificationOptions,
  NotificationManager,
} from '@pkgs/Nightmare/notifications';

export interface NotificationsHandlerDeps {
  getManager: () => NotificationManager | null;
  fireEventOn: (extId: string, method: string, args: unknown[]) => void;
}

interface ChromeCreateOptions {
  type?: 'basic' | 'image' | 'list' | 'progress';
  iconUrl?: string;
  appIconMaskUrl?: string;
  title?: string;
  message?: string;
  contextMessage?: string;
  priority?: number;
  eventTime?: number;
  buttons?: Array<{ title: string; iconUrl?: string }>;
  imageUrl?: string;
  items?: Array<{ title: string; message: string }>;
  progress?: number;
  isClickable?: boolean;
  requireInteraction?: boolean;
  silent?: boolean;
}

let nextAutoId = 0;

export class NotificationsHandlers {
  private byId = new Map<string, string>();

  constructor(private readonly deps: NotificationsHandlerDeps) {}

  create = async (ctx: ExtensionContext, args: unknown[]): Promise<string> => {
    let id: string;
    let opts: ChromeCreateOptions;
    if (typeof args[0] === 'string') {
      id = args[0];
      opts = (args[1] ?? {}) as ChromeCreateOptions;
    } else {
      id = `${ctx.id}::auto-${++nextAutoId}`;
      opts = (args[0] ?? {}) as ChromeCreateOptions;
    }
    if (!id) id = `${ctx.id}::auto-${++nextAutoId}`;

    const mgr = this.deps.getManager();
    if (!mgr) {
      this.byId.set(id, ctx.id);
      return id;
    }

    const normalized = this.toNormalized(opts);
    this.byId.set(id, ctx.id);
    mgr.show(normalized, {
      onClicked: () => {
        this.deps.fireEventOn(ctx.id, 'chrome.notifications.onClicked', [id]);
      },
      onClosed: (byUser: boolean) => {
        this.deps.fireEventOn(ctx.id, 'chrome.notifications.onClosed', [id, byUser]);
        this.byId.delete(id);
      },
      onButtonClicked: (buttonIndex: number) => {
        this.deps.fireEventOn(ctx.id, 'chrome.notifications.onButtonClicked', [id, buttonIndex]);
      },
    }, id);

    return id;
  };

  update = async (_ctx: ExtensionContext, args: unknown[]): Promise<boolean> => {
    const id = args[0] as string;
    const opts = (args[1] ?? {}) as ChromeCreateOptions;
    const mgr = this.deps.getManager();
    if (!mgr) return false;
    return mgr.update(id, this.toNormalizedPartial(opts));
  };

  clear = async (_ctx: ExtensionContext, args: unknown[]): Promise<boolean> => {
    const id = args[0] as string;
    const mgr = this.deps.getManager();
    if (!mgr) return false;
    const ok = mgr.clear(id, false);
    if (ok) this.byId.delete(id);
    return ok;
  };

  getAll = async (ctx: ExtensionContext, _args: unknown[]): Promise<Record<string, true>> => {
    const out: Record<string, true> = {};
    for (const [id, extId] of this.byId) {
      if (extId === ctx.id) out[id] = true;
    }
    return out;
  };

  getPermissionLevel = async (_ctx: ExtensionContext, _args: unknown[]): Promise<'granted' | 'denied'> => {
    const mgr = this.deps.getManager();
    return mgr ? mgr.getPermissionLevel() : 'granted';
  };

  private toNormalized(opts: ChromeCreateOptions): NotificationOptions {
    const out: NotificationOptions = {
      title: opts.title ?? '',
      message: opts.message ?? '',
    };
    if (opts.type) out.type = opts.type;
    if (opts.iconUrl) out.iconUrl = opts.iconUrl;
    if (opts.contextMessage) out.contextMessage = opts.contextMessage;
    if (typeof opts.priority === 'number') out.priority = opts.priority;
    if (typeof opts.eventTime === 'number') out.eventTime = opts.eventTime;
    if (opts.buttons) out.buttons = opts.buttons;
    if (opts.imageUrl) out.imageUrl = opts.imageUrl;
    if (opts.items) out.items = opts.items;
    if (typeof opts.progress === 'number') out.progress = opts.progress;
    if (opts.requireInteraction) out.requireInteraction = true;
    if (opts.silent) out.silent = true;
    return out;
  }

  private toNormalizedPartial(opts: ChromeCreateOptions): Partial<NotificationOptions> {
    const out: Partial<NotificationOptions> = {};
    if (opts.type) out.type = opts.type;
    if (opts.iconUrl) out.iconUrl = opts.iconUrl;
    if (typeof opts.title === 'string') out.title = opts.title;
    if (typeof opts.message === 'string') out.message = opts.message;
    if (opts.contextMessage) out.contextMessage = opts.contextMessage;
    if (typeof opts.priority === 'number') out.priority = opts.priority;
    if (opts.buttons) out.buttons = opts.buttons;
    if (opts.imageUrl) out.imageUrl = opts.imageUrl;
    if (opts.items) out.items = opts.items;
    if (typeof opts.progress === 'number') out.progress = opts.progress;
    return out;
  }
}
