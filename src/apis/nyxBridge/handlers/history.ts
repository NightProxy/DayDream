// src/apis/nyxBridge/handlers/history.ts
//
// V1: read-only stub returning empty arrays. DDX has no centralised
// history module yet; the contract methods are wired so NyxAI can
// feature-detect via host.capabilities() but writes reject.

import { register } from './index';
import { DDXError } from '../types';

register('history.search', async () => []);
register('history.getVisits', async () => []);
register('history.addUrl', async () => { throw new DDXError('not_supported', 'history.addUrl unavailable in v1'); });
register('history.deleteUrl', async () => { throw new DDXError('not_supported', 'history.deleteUrl unavailable in v1'); });
register('history.deleteRange', async () => { throw new DDXError('not_supported', 'history.deleteRange unavailable in v1'); });
register('history.deleteAll', async () => { throw new DDXError('not_supported', 'history.deleteAll unavailable in v1'); });
