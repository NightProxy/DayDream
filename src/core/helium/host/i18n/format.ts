// src/core/helium/host/i18n/format.ts

import type { MessageEntry } from './negotiate';

export function formatMessage(
  entry: MessageEntry | undefined,
  substitutions: string[] | string | undefined,
): string {
  if (!entry) return '';
  let msg = entry.message;
  if (entry.placeholders) {
    for (const [name, p] of Object.entries(entry.placeholders)) {
      msg = msg.replace(new RegExp(`\\$${name}\\$`, 'gi'), p.content);
    }
  }
  const subs = Array.isArray(substitutions) ? substitutions : substitutions ? [substitutions] : [];
  for (let i = 0; i < 9; i++) {
    msg = msg.replace(new RegExp(`\\$${i + 1}`, 'g'), subs[i] ?? '');
  }
  return msg;
}
