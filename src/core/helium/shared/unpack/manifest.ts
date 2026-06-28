/**
 * Manifest JSON parsing and validation.
 *
 * Pulls `manifest.json` out of the unpacked file map, decodes UTF-8,
 * parses JSON, runs minimal validation, and classifies MV2 vs MV3
 * plus Chrome vs Firefox.
 *
 * Validation rules (all throw on failure):
 *   - manifest.json must exist in the file map.
 *   - Decoded text must parse as JSON.
 *   - Parsed value must be an object.
 *   - manifest.name must be a non-empty string.
 *   - manifest.version must be a non-empty string.
 *   - manifest.manifest_version must be literal 2 or 3.
 *
 * Firefox detection: presence of `browser_specific_settings.gecko`
 * or the legacy `applications` key.
 */

import type {
  ChromeManifest,
  FirefoxManifest,
  ManifestVersion,
} from './types';

export interface ManifestParseResult {
  manifestVersion: ManifestVersion;
  manifest: ChromeManifest | FirefoxManifest;
  isFirefox: boolean;
}

export function parseManifest(
  files: Map<string, Uint8Array>,
): ManifestParseResult {
  const bytes = files.get('manifest.json');
  if (!bytes) {
    throw new Error('[helium/unpack] manifest: manifest.json missing from archive');
  }

  const text = new TextDecoder('utf-8').decode(bytes);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `[helium/unpack] manifest: invalid JSON: ${(err as Error).message}`,
    );
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('[helium/unpack] manifest: must be a JSON object');
  }
  const m = parsed as Record<string, unknown>;

  if (typeof m.name !== 'string' || m.name.length === 0) {
    throw new Error('[helium/unpack] manifest: name must be a non-empty string');
  }
  if (typeof m.version !== 'string' || m.version.length === 0) {
    throw new Error('[helium/unpack] manifest: version must be a non-empty string');
  }
  if (m.manifest_version !== 2 && m.manifest_version !== 3) {
    throw new Error(
      `[helium/unpack] manifest: manifest_version must be 2 or 3 (got ${String(m.manifest_version)})`,
    );
  }

  const manifestVersion = m.manifest_version as ManifestVersion;
  const isFirefox = detectFirefox(m);

  return {
    manifestVersion,
    manifest: m as unknown as ChromeManifest | FirefoxManifest,
    isFirefox,
  };
}

function detectFirefox(m: Record<string, unknown>): boolean {
  const bss = m.browser_specific_settings;
  if (bss && typeof bss === 'object' && (bss as Record<string, unknown>).gecko) {
    return true;
  }
  const apps = m.applications;
  if (apps && typeof apps === 'object' && (apps as Record<string, unknown>).gecko) {
    return true;
  }
  return false;
}
