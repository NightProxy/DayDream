import type { ERROR_SENTINEL } from './constants';

export interface NeutronInit {
  lengthBuffer: SharedArrayBuffer;
  valueBuffer: SharedArrayBuffer;
  bootstrap?: unknown;
}

export interface NeutronOptions {
  bufferSize?: number;
  worker?: Worker;
  workerUrl?: string | URL;
  workerOptions?: WorkerOptions;
  bootstrap?: unknown;
}

export type NeutronRequest = Record<string, unknown> & { type: string };

export interface NeutronHandlerContext {
  push: (message: unknown) => void;
}

export type NeutronHandler = (
  request: NeutronRequest,
  ctx: NeutronHandlerContext,
) => unknown | Promise<unknown>;

export interface NeutronErrorEnvelope {
  [ERROR_SENTINEL]: true;
  message: string;
  stack?: string;
  code?: string;
  name?: string;
}

export class NeutronTerminatedError extends Error {
  override readonly name = 'NeutronTerminatedError';
  constructor(message = 'Neutron worker was terminated') {
    super(message);
  }
}
