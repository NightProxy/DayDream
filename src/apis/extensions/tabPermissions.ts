import type { TabInfo } from '@apis/nyxBridge/api';

type ManifestLike = { permissions?: unknown };

const SENSITIVE_TAB_FIELDS = ['url', 'title', 'favIconUrl'] as const;

function manifestHasTabsPermission(manifest: ManifestLike): boolean {
  return Array.isArray(manifest.permissions) && manifest.permissions.includes('tabs');
}

export function sanitizeTabsForExtension(
  tabs: TabInfo[],
  manifest: ManifestLike,
  hasActiveTabGrant: (tabId: number) => boolean,
): TabInfo[] {
  const hasTabs = manifestHasTabsPermission(manifest);
  return tabs.map((tab) => {
    if (hasTabs || hasActiveTabGrant(tab.id)) return tab;

    const limited: TabInfo = { ...tab };
    for (const field of SENSITIVE_TAB_FIELDS) {
      delete limited[field];
    }
    return limited;
  });
}
