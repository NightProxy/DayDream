/**
 * Base class for content setting entries (e.g. contentSettings.cookies).
 * Provides get/set/clear/getResourceIdentifiers.
 */
export class ContentSetting {
  private rules: Array<{ primaryPattern: string; setting: string; scope?: string }> = [];

  /**
   * Gets the current content setting for a given pair of URLs.
   */
  get(
    details: { primaryUrl: string; secondaryUrl?: string; resourceIdentifier?: object },
    callback?: (details: { setting: string }) => void
  ): void {
    const result = { setting: 'allow' };
    if (callback) {
      callback(result);
    }
  }

  /**
   * Applies a new content setting rule.
   */
  set(
    details: { primaryPattern: string; secondaryPattern?: string; setting: string; scope?: string; resourceIdentifier?: object },
    callback?: () => void
  ): void {
    this.rules.push({
      primaryPattern: details.primaryPattern,
      setting: details.setting,
      scope: details.scope,
    });
    if (callback) {
      callback();
    }
  }

  /**
   * Clears all content setting rules set by this extension.
   */
  clear(details: { scope?: string }, callback?: () => void): void {
    this.rules = [];
    if (callback) {
      callback();
    }
  }

  /**
   * Returns resource identifiers for this content type.
   */
  getResourceIdentifiers(callback?: (identifiers: Array<{ id: string; description?: string }>) => void): void {
    if (callback) {
      callback([]);
    }
  }
}
