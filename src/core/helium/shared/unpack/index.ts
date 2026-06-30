/**
 * Public entry point for extension unpacking.
 *
 * Flow:
 *   1. Coerce input to Uint8Array.
 *   2. Detect format from magic bytes (or formatHint).
 *   3. CRX: parseCrx → { publicKey, zipBody }. ZIP/XPI: publicKey=null.
 *   4. unzip(zipBody) → files.
 *   5. parseManifest(files) → { manifestVersion, manifest, isFirefox }.
 *   6. If publicKey is null and manifest.key is a non-empty string,
 *      base64-decode it as the public key.
 *   7. deriveExtensionId(publicKey) → { id, fromKey }.
 *   8. Return UnpackedExtension.
 */

import { parseCrx } from './crx';
import { deriveExtensionId } from './id';
import { parseManifest } from './manifest';
import type {
  ExtensionFormat,
  UnpackOptions,
  UnpackedExtension,
} from './types';
import { unzip } from './zip';

export * from './types';
export { parseCrx } from './crx';
export { unzip } from './zip';
export { parseManifest } from './manifest';
export { deriveExtensionId } from './id';

const ZIP_MAGIC = 0x04034b50;
const CRX_MAGIC = 0x34327243;

const DEFAULT_MAX_FILE = 50 * 1024 * 1024;
const DEFAULT_MAX_TOTAL = 200 * 1024 * 1024;

export async function unpackExtension(
  data: Uint8Array | ArrayBuffer,
  opts: UnpackOptions = {},
): Promise<UnpackedExtension> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  const format: ExtensionFormat =
    opts.formatHint ?? detectFormat(bytes);

  let publicKey: Uint8Array | null = null;
  let zipBody: Uint8Array;

  if (format === 'crx2' || format === 'crx3' || format === 'crx4') {
    const parsed = parseCrx(bytes);
    publicKey = parsed.publicKey;
    zipBody = parsed.zipBody;
  } else {
    zipBody = bytes;
  }

  const files = unzip(zipBody, {
    maxFileSize: opts.maxFileSize ?? DEFAULT_MAX_FILE,
    maxUncompressedSize: opts.maxUncompressedSize ?? DEFAULT_MAX_TOTAL,
  });

  const { manifestVersion, manifest } = parseManifest(files);

  if (!publicKey && typeof manifest.key === 'string' && manifest.key.length > 0) {
    try {
      publicKey = decodeBase64(manifest.key);
    } catch (err) {
      console.warn(
        `[helium/unpack] index: manifest.key present but failed to base64-decode: ${(err as Error).message}`,
      );
    }
  }

  const { id, fromKey } = await deriveExtensionId(publicKey);

  return {
    id,
    idFromKey: fromKey,
    format,
    manifestVersion,
    manifest,
    files,
  };
}

function detectFormat(bytes: Uint8Array): ExtensionFormat {
  if (bytes.byteLength < 4) {
    throw new Error('[helium/unpack] index: buffer too small to detect format');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  if (magic === ZIP_MAGIC) return 'zip';
  if (magic === CRX_MAGIC) {
    if (bytes.byteLength < 8) {
      throw new Error('[helium/unpack] index: CRX header truncated before version field');
    }
    const version = view.getUint32(4, true);
    if (version === 2) return 'crx2';
    if (version === 3) return 'crx3';
    if (version === 4) return 'crx4';
    throw new Error(
      `[helium/unpack] index: CRX magic with unsupported version ${version} (expected 2, 3, or 4)`,
    );
  }
  const head = Array.from(bytes.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ');
  throw new Error(
    `[helium/unpack] index: unknown magic 0x${magic.toString(16)} (bytes: ${head})`,
  );
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}
