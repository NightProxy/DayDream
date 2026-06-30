
import type { ExtensionContext } from '../../extfs/types';
import type { OmniboxRegistry } from './registry';

export class OmniboxHandlers {
  constructor(private readonly registry: OmniboxRegistry) {}

  setDefaultSuggestion = async (ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const suggestion = (args[0] ?? {}) as { description?: string };
    if (typeof suggestion.description !== 'string') return;
    this.registry.setDefaultSuggestion(ctx.id, { description: suggestion.description });
  };
}
