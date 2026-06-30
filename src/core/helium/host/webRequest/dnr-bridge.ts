
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
