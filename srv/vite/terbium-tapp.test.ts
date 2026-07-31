import { describe, it, expect } from 'vitest';
import { buildManifest } from './terbium-tapp';

describe('buildManifest (runtime .tbconfig)', () => {
  const pkg = {
    name: 'daydreamx',
    version: '3.0.0',
    description: 'Your favorite Browser in a browser',
    terbium: {
      'pkg-name': 'daydream',
      'display-name': 'Daydream',
      developer: 'Night Network',
      wmArgs: {
        title: { text: 'Daydream', weight: 600 },
        size: { width: 1200, height: 800 },
        single: false,
        resizable: true,
      },
    },
  };

  it('uses terbium.display-name as the title', () => {
    const m = buildManifest(pkg);
    expect(m.title).toBe('Daydream');
  });

  it('falls back to package.json name when display-name is missing', () => {
    const noDisplay = {
      ...pkg,
      terbium: { ...pkg.terbium, 'display-name': '' as unknown as string },
    };
    const m = buildManifest(noDisplay);
    expect(m.title).toBe('daydreamx');
  });

  it('sets top-level icon to ./icon.png', () => {
    const m = buildManifest(pkg);
    expect(m.icon).toBe('./icon.png');
  });

  it('fills wmArgs.src with ./index.html', () => {
    const m = buildManifest(pkg);
    expect(m.wmArgs.src).toBe('./index.html');
  });

  it('fills wmArgs.icon with ./icon.png', () => {
    const m = buildManifest(pkg);
    expect(m.wmArgs.icon).toBe('./icon.png');
  });

  it('derives wmArgs.app_id as com.tb.<pkg-name>', () => {
    const m = buildManifest(pkg);
    expect(m.wmArgs.app_id).toBe('com.tb.daydream');
  });

  it('throws if package.json.version is missing', () => {
    const bad = { ...pkg, version: undefined as unknown as string };
    expect(() => buildManifest(bad)).toThrow(/missing "version"/);
  });

  it('throws if terbium config block is missing', () => {
    const bad = { ...pkg, terbium: undefined as unknown as typeof pkg.terbium };
    expect(() => buildManifest(bad)).toThrow(/missing the "terbium" config/);
  });

  it('throws if terbium.pkg-name is missing', () => {
    const bad = {
      ...pkg,
      terbium: { ...pkg.terbium, 'pkg-name': '' },
    };
    expect(() => buildManifest(bad)).toThrow(/pkg-name/i);
  });

  it('passes through user-defined wmArgs fields', () => {
    const m = buildManifest(pkg);
    expect(m.wmArgs.title).toEqual({ text: 'Daydream', weight: 600 });
    expect(m.wmArgs.size).toEqual({ width: 1200, height: 800 });
    expect(m.wmArgs.single).toBe(false);
    expect(m.wmArgs.resizable).toBe(true);
  });

  it('produces only top-level title/icon/wmArgs (no tb-repo fields)', () => {
    const m = buildManifest(pkg) as Record<string, unknown>;
    // .tbconfig has 3 fields; tb-repo manifest fields like name, pkg-name,
    // version, description, developer should NOT appear here.
    expect(Object.keys(m).sort()).toEqual(['icon', 'title', 'wmArgs']);
  });
});
