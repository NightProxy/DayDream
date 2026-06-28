// src/core/helium/host/i18n/handlers.ts

import type { ExtensionContext } from '../../extfs/types';
import { negotiateLocale, loadMessages } from './negotiate';
import { formatMessage } from './format';

export class I18nHandlers {
  getMessage = async (ctx: ExtensionContext, args: unknown[]): Promise<string> => {
    const messageName = String(args[0] ?? '');
    const substitutions = args[1] as string[] | string | undefined;
    if (messageName === '@@extension_id') return ctx.id;
    if (messageName === '@@ui_locale') {
      return typeof navigator !== 'undefined' ? navigator.language.replace('-', '_') : 'en';
    }
    if (messageName === '@@bidi_dir') return 'ltr';
    if (messageName === '@@bidi_reversed_dir') return 'rtl';
    if (messageName === '@@bidi_start_edge') return 'left';
    if (messageName === '@@bidi_end_edge') return 'right';

    const defaultLocale = (ctx.manifest as { default_locale?: string }).default_locale;
    const locale = await negotiateLocale(ctx.id, defaultLocale);
    if (!locale) return '';
    const messages = await loadMessages(ctx.id, locale);
    return formatMessage(messages[messageName], substitutions);
  };

  getUILanguage = async (_ctx: ExtensionContext, _args: unknown[]): Promise<string> =>
    typeof navigator !== 'undefined' ? navigator.language : 'en';

  getAcceptLanguages = async (_ctx: ExtensionContext, _args: unknown[]): Promise<string[]> =>
    typeof navigator !== 'undefined' ? [...navigator.languages] : ['en'];

  detectLanguage = async (_ctx: ExtensionContext, _args: unknown[]): Promise<unknown> => ({
    isReliable: false,
    languages: [{ language: 'und', percentage: 100 }],
  });
}
