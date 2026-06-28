// src/core/helium/host/dnr/manifest.ts
//
// Parse the `declarative_net_request.rule_resources` block out of a
// manifest. Schema (Chrome MV3):
//
//   "declarative_net_request": {
//     "rule_resources": [
//       { "id": "ruleset_1", "enabled": true, "path": "rules.json" },
//       { "id": "ruleset_2", "enabled": false, "path": "rules2.json" }
//     ]
//   }
//
// We do best-effort coercion; entries missing `id` or `path` are
// skipped. Returns an empty array if the block is absent.

import type { ExtensionContext } from '../../extfs/types';

export interface ManifestRuleset {
  id: string;
  path: string;
  enabled: boolean;
}

export function parseManifestRulesets(ctx: ExtensionContext): ManifestRuleset[] {
  const m = ctx.manifest as {
    declarative_net_request?: {
      rule_resources?: Array<{ id?: unknown; path?: unknown; enabled?: unknown }>;
    };
  };
  const list = m.declarative_net_request?.rule_resources;
  if (!Array.isArray(list)) return [];
  const out: ManifestRuleset[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof entry.id === 'string' ? entry.id : null;
    const path = typeof entry.path === 'string' ? entry.path : null;
    if (!id || !path) continue;
    out.push({
      id,
      path,
      enabled: entry.enabled === true,
    });
  }
  return out;
}
