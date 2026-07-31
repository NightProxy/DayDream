import { decodeUtf8, deserializeError, isErrorEnvelope } from './encode';
import type { NeutronInit } from './types';

let lengthTyped: Int32Array | undefined;
let valueTyped: Uint8Array | undefined;
let initialized = false;

export const init = (initMessage: NeutronInit): void => {
  if (initialized) {
    throw new Error('Neutron worker already initialized');
  }
  if (!initMessage || !initMessage.lengthBuffer || !initMessage.valueBuffer) {
    throw new Error('Invalid Neutron init message: missing lengthBuffer or valueBuffer');
  }
  lengthTyped = new Int32Array(initMessage.lengthBuffer);
  valueTyped = new Uint8Array(initMessage.valueBuffer);
  initialized = true;
};

export const isInitialized = (): boolean => initialized;

const ensureInit = (): void => {
  if (!initialized || !lengthTyped || !valueTyped) {
    throw new Error('Neutron worker not initialized. Call init() with the message received from the host.');
  }
};

const waitForReply = (): unknown => {
  ensureInit();
  Atomics.wait(lengthTyped!, 0, 0);
  const len = Atomics.load(lengthTyped!, 0);
  if (len === 0) {
    Atomics.store(lengthTyped!, 0, 0);
    return undefined;
  }
  const bytes = valueTyped!.slice(0, len);
  Atomics.store(lengthTyped!, 0, 0);
  const text = decodeUtf8(bytes);
  if (text.length === 0) return undefined;
  const parsed: unknown = JSON.parse(text);
  if (isErrorEnvelope(parsed)) {
    throw deserializeError(parsed);
  }
  return parsed;
};

export function send(request: unknown, blocking: true): unknown;
export function send(request: unknown, blocking: false): undefined;
export function send(request: unknown, blocking?: boolean): unknown;
export function send(request: unknown, blocking: boolean = true): unknown {
  ensureInit();
  if (blocking && typeof request === 'object' && request !== null) {
    postMessage({ ...(request as Record<string, unknown>), __neutron_blocking__: true });
  } else {
    postMessage(request);
  }
  if (!blocking) return undefined;
  return waitForReply();
}

export const post = (message: unknown): void => {
  ensureInit();
  postMessage(message);
};

export function recv(blocking: true): unknown;
export function recv(blocking: false): unknown;
export function recv(blocking?: boolean): unknown;
export function recv(blocking: boolean = true): unknown {
  ensureInit();
  if (!blocking) {
    const len = Atomics.load(lengthTyped!, 0);
    if (len === 0) return undefined;
  }
  return waitForReply();
}

export interface RequestEnvelope extends Record<string, unknown> {
  __neutron_request_id__: string;
}

export const isRequest = (msg: unknown): msg is RequestEnvelope => {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    typeof (msg as Record<string, unknown>).__neutron_request_id__ === 'string'
  );
};

export const respond = (requestId: string, value: unknown): void => {
  postMessage({ __neutron_response_id__: requestId, value });
};

export const respondError = (requestId: string, error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  postMessage({ __neutron_response_id__: requestId, error: message });
};

export type { NeutronInit };
