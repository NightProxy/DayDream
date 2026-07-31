export const DDX_CHROME_BASELINE = 137;

export function isSupportedMinimumChromeVersion(minimumChromeVersion: string): boolean {
  const major = Number.parseInt(minimumChromeVersion.split('.')[0] ?? '0', 10);
  return !Number.isFinite(major) || major <= DDX_CHROME_BASELINE;
}
