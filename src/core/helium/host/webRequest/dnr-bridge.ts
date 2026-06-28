// src/core/helium/host/webRequest/dnr-bridge.ts
//
// Thin type seam between the WebRequestPlugin (Task 26) and the DNR
// engine (Task 29). Lives in the webRequest dir to avoid a circular
// import: the plugin pulls in only the seam, and the real DNR
// implementation lives under ../dnr/ and provides the facade.
//
// The plugin invokes `evaluate(details)` at fetch.intercept time;
// the engine returns one of:
//   { kind: 'block' }
//   { kind: 'redirect', url }
//   { kind: 'upgradeScheme' }
//   { kind: 'allow' }
//   { kind: 'allowAllRequests' }
//   { kind: 'modifyHeaders', requestHeaders?, responseHeaders? }
//   null (no match)

import type { RequestDetails } from './events';

export type DnrHeaderOperation = 'append' | 'set' | 'remove';

export interface DnrHeaderOp {
  header: string;
  operation: DnrHeaderOperation;
  value?: string;
}

export type DnrModifyHeadersQueue = DnrHeaderOp[];

export type DnrEvaluationResult =
  | { kind: 'block' }
  | { kind: 'redirect'; url: string }
  | { kind: 'upgradeScheme' }
  | { kind: 'allow' }
  | { kind: 'allowAllRequests' }
  | {
      kind: 'modifyHeaders';
      requestHeaders?: DnrModifyHeadersQueue;
      responseHeaders?: DnrModifyHeadersQueue;
    };

export interface DnrEngineFacade {
  evaluate(details: RequestDetails): Promise<DnrEvaluationResult | null>;
}
