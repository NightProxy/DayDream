import { describe, expect, it } from 'vitest';
import { isSupportedMinimumChromeVersion } from './extensions/versionGate';

describe('extension minimum Chrome version gate', () => {
  it('accepts extensions that require Chrome 137', () => {
    expect(isSupportedMinimumChromeVersion('137.0')).toBe(true);
  });

  it('rejects extensions above the DDX compatibility baseline', () => {
    expect(isSupportedMinimumChromeVersion('138.0')).toBe(false);
  });
});
