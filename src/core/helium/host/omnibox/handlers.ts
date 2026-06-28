// src/core/helium/host/omnibox/handlers.ts
//
// chrome.omnibox.* handlers. Only `setDefaultSuggestion` is a real
// method; the rest of the surface is events (fired from the omnibox UI
// dispatcher into the registered extension via fireEventOn).

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
