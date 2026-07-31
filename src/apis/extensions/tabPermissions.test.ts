import { describe, expect, it } from 'vitest';
import { sanitizeTabsForExtension } from './tabPermissions';

const tab = {
  id: 1,
  index: 0,
  active: true,
  url: 'https://example.com/',
  title: 'Example',
  favIconUrl: 'https://example.com/favicon.ico',
  pinned: false,
  highlighted: true,
  discarded: false,
  windowId: 1,
  groupId: -1,
  incognito: false,
};

describe('extension tab permissions', () => {
  it('returns iterable limited tabs without the tabs permission', () => {
    const result = sanitizeTabsForExtension([tab], { permissions: [] }, () => false);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 1, active: true, windowId: 1 });
    expect(result[0]).not.toHaveProperty('url');
    expect(result[0]).not.toHaveProperty('title');
    expect(result[0]).not.toHaveProperty('favIconUrl');
  });

  it('preserves sensitive tab fields with the tabs permission', () => {
    const result = sanitizeTabsForExtension([tab], { permissions: ['tabs'] }, () => false);

    expect(result[0]).toMatchObject({
      url: 'https://example.com/',
      title: 'Example',
      favIconUrl: 'https://example.com/favicon.ico',
    });
  });
});
