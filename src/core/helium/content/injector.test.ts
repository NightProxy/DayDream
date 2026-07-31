import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionContext } from '../extfs/types';
import type { ChromeManifest } from '../shared/unpack/types';

const entries: Array<{ id: string; match: (url: URL) => boolean; scripts: Array<{ kind: string; code?: string }> }> = [];
const files = new Map<string, string>();

vi.mock('@apis/scriptInjection', () => ({
  scriptInjectionRegistry: {
    register: vi.fn((entry) => { entries.push(entry); }),
    unregister: vi.fn((id: string) => {
      const idx = entries.findIndex((entry) => entry.id === id);
      if (idx < 0) return false;
      entries.splice(idx, 1);
      return true;
    }),
    list: vi.fn(() => entries.slice()),
  },
}));

vi.mock('../extfs/install', () => ({
  readExtensionFile: vi.fn(async (_extId: string, rel: string) => {
    const text = files.get(rel);
    return text === undefined ? null : new TextEncoder().encode(text);
  }),
}));

const { installContentScripts } = await import('./injector');

const ctx: ExtensionContext = {
  id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  manifestVersion: 3,
  manifest: { manifest_version: 3, name: 'Test', version: '1' },
  origin: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.ddx',
};

describe('installContentScripts', () => {
  beforeEach(() => {
    entries.length = 0;
    files.clear();
    vi.clearAllMocks();
  });

  it('keeps same-rule isolated JS files in one ordered execution context', async () => {
    files.set('vapi.js', 'globalThis.vAPI = { defer: { once: () => Promise.resolve() } };');
    files.set('contentscript.js', 'globalThis.vAPI.defer.once(250);');

    const manifest: ChromeManifest = {
      manifest_version: 3,
      name: 'uBlock-style fixture',
      version: '1',
      content_scripts: [{
        matches: ['https://example.com/*'],
        run_at: 'document_start',
        js: ['vapi.js', 'contentscript.js'],
      }],
    };

    await installContentScripts(ctx.id, ctx, manifest);

    const contentEntries = entries.filter((entry) => entry.id.startsWith(`helium-content-${ctx.id}-`));
    expect(contentEntries).toHaveLength(1);
    expect(contentEntries[0]!.scripts).toHaveLength(1);
    const code = contentEntries[0]!.scripts[0]!.code ?? '';
    expect(code.indexOf('globalThis.vAPI =')).toBeGreaterThanOrEqual(0);
    expect(code.indexOf('globalThis.vAPI.defer.once')).toBeGreaterThan(code.indexOf('globalThis.vAPI ='));
    expect(code).toContain('__helium_isolation__');
  });
});
