import { describe, it, expect } from 'vitest';
import { buildManifest } from './terbium-tapp';

describe('buildManifest', () => {
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

  it('uses package.json version as the manifest version', () => {
    const m = buildManifest(pkg);
    expect(m.version).toBe('3.0.0');
  });

  it('uses terbium.display-name as the manifest name', () => {
    const m = buildManifest(pkg);
    expect(m.name).toBe('Daydream');
  });

  it('uses terbium.pkg-name as the pkg-name', () => {
    const m = buildManifest(pkg);
    expect(m['pkg-name']).toBe('daydream');
  });

  it('fills wmArgs.src with ./index.html', () => {
    const m = buildManifest(pkg);
    expect(m.wmArgs.src).toBe('./index.html');
  });

  it('fills wmArgs.icon with ./icon.png', () => {
    const m = buildManifest(pkg);
    expect(m.wmArgs.icon).toBe('./icon.png');
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
});
