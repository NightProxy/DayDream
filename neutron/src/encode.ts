import { ERROR_SENTINEL } from './constants';
import type { NeutronErrorEnvelope } from './types';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

export const encodeUtf8 = (s: string): Uint8Array => encoder.encode(s);

export const decodeUtf8 = (b: Uint8Array): string => decoder.decode(b);

export const serializeError = (err: unknown): NeutronErrorEnvelope => {
  if (err instanceof Error) {
    const env: NeutronErrorEnvelope = {
      [ERROR_SENTINEL]: true,
      message: err.message,
      name: err.name,
    };
    if (err.stack) env.stack = err.stack;
    const code = (err as Error & { code?: unknown }).code;
    if (typeof code === 'string') env.code = code;
    return env;
  }
  return {
    [ERROR_SENTINEL]: true,
    message: String(err),
  };
};

export const deserializeError = (envelope: NeutronErrorEnvelope): Error => {
  const err = new Error(envelope.message);
  if (envelope.name) err.name = envelope.name;
  if (envelope.stack) err.stack = envelope.stack;
  if (envelope.code) (err as Error & { code?: string }).code = envelope.code;
  return err;
};

export const isErrorEnvelope = (v: unknown): v is NeutronErrorEnvelope => {
  return typeof v === 'object' && v !== null && (v as Record<string, unknown>)[ERROR_SENTINEL] === true;
};
