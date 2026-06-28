// src/core/helium/host/alarms/handlers.ts

import type { ExtensionContext } from '../../extfs/types';
import type { Alarm, AlarmScheduler } from './scheduler';

export class AlarmsHandlers {
  constructor(private readonly scheduler: AlarmScheduler) {}

  create = async (ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    let name = '';
    let info: { when?: number; delayInMinutes?: number; periodInMinutes?: number };
    if (typeof args[0] === 'string') {
      name = args[0];
      info = (args[1] ?? {}) as typeof info;
    } else {
      info = (args[0] ?? {}) as typeof info;
    }
    await this.scheduler.create(ctx.id, name, info);
  };

  get = async (ctx: ExtensionContext, args: unknown[]): Promise<Alarm | undefined> => {
    const name = (args[0] as string | undefined) ?? '';
    return this.scheduler.get(ctx.id, name);
  };

  getAll = async (ctx: ExtensionContext, _args: unknown[]): Promise<Alarm[]> =>
    this.scheduler.getAll(ctx.id);

  clear = async (ctx: ExtensionContext, args: unknown[]): Promise<boolean> => {
    const name = (args[0] as string | undefined) ?? '';
    return this.scheduler.clear(ctx.id, name);
  };

  clearAll = async (ctx: ExtensionContext, _args: unknown[]): Promise<boolean> =>
    this.scheduler.clearAll(ctx.id);
}
