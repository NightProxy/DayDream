
import type { ExtensionContext } from '../../extfs/types';
import type { ContextMenuRegistry, MenuEntry } from './registry';

export class ContextMenusHandlers {
  constructor(private readonly registry: ContextMenuRegistry) {}

  create = async (ctx: ExtensionContext, args: unknown[]): Promise<string> => {
    const props = (args[0] ?? {}) as Omit<MenuEntry, 'id'> & { id?: string | number };
    return this.registry.create(ctx.id, props);
  };

  update = async (ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const id = String(args[0]);
    const changes = (args[1] ?? {}) as Partial<MenuEntry>;
    await this.registry.update(ctx.id, id, changes);
  };

  remove = async (ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const id = String(args[0]);
    await this.registry.remove(ctx.id, id);
  };

  removeAll = async (ctx: ExtensionContext, _args: unknown[]): Promise<void> => {
    await this.registry.removeAll(ctx.id);
  };
}
