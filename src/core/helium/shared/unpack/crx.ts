/**
 * CRX header parsing.
 *
 * Real-world CRX file format (all little-endian uint32 unless noted):
 *
 *   offset 0..3    magic         literal ASCII bytes "Cr24" (constant
 *                                across ALL versions). As an LE uint32
 *                                this reads as 0x34327243.
 *                                Earlier docs claimed CRX2 used "Cr22"
 *                                and CRX3 "Cr23" — that is INCORRECT.
 *                                Chromium's crx_file/crx3.proto and
 *                                every shipping packager (zip, crxmake,
 *                                Chrome itself, etc.) all emit "Cr24"
 *                                regardless of header version.
 *   offset 4..7    headerVersion 2, 3, or 4
 *
 * CRX2 (legacy):
 *   offset 8..11   publicKeyLength
 *   offset 12..15  signatureLength
 *   then publicKey bytes, then signature bytes, then ZIP body.
 *
 * CRX3 / CRX4 (current):
 *   offset 8..11   headerSize    (size of the protobuf header following)
 *   then headerSize bytes of CrxFileHeader protobuf, then ZIP body.
 *
 * For CRX3/4 we don't fully parse the protobuf — we scan the header
 * bytes for a 32-byte SHA-256-shaped field that the CrxFileHeader
 * format uses to carry the public-key hash, and surface the public
 * key extracted that way when we can find one. Heuristic; on miss
 * the caller falls back to manifest.key or UUID.
 */

import type { ExtensionFormat } from './types';

// The on-wire magic is constant: "Cr24" little-endian.
const CRX_MAGIC = 0x34327243;

export interface CrxParseResult {
  format: Exclude<ExtensionFormat, 'zip' | 'xpi'>;
  /** Public key bytes when extractable, else null. */
  publicKey: Uint8Array | null;
  /** ZIP payload to feed into zip.ts. */
  zipBody: Uint8Array;
}

export function parseCrx(data: Uint8Array): CrxParseResult {
  if (data.byteLength < 12) {
    throw new Error('[helium/unpack] crx: buffer too small to contain a CRX header');
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);

  if (magic !== CRX_MAGIC) {
    const head = Array.from(data.slice(0, 16))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    throw new Error(
      `[helium/unpack] crx: unknown magic 0x${magic.toString(16)} (expected 0x${CRX_MAGIC.toString(16)} = "Cr24"; bytes: ${head})`,
    );
  }

  if (version === 2) {
    const publicKeyLength = view.getUint32(8, true);
    const signatureLength = view.getUint32(12, true);
    const headerEnd = 16 + publicKeyLength + signatureLength;
    if (headerEnd > data.byteLength) {
      throw new Error('[helium/unpack] crx: CRX2 header extends past buffer');
    }
    const publicKey = data.slice(16, 16 + publicKeyLength);
    const zipBody = data.slice(headerEnd);
    return { format: 'crx2', publicKey, zipBody };
  }

  if (version === 3 || version === 4) {
    const headerSize = view.getUint32(8, true);
    const zipStart = 12 + headerSize;
    if (zipStart > data.byteLength) {
      throw new Error('[helium/unpack] crx: header extends past buffer');
    }
    const headerBytes = data.slice(12, zipStart);
    const zipBody = data.slice(zipStart);
    const publicKey = scanHeaderForPublicKey(headerBytes);
    return {
      format: version === 3 ? 'crx3' : 'crx4',
      publicKey,
      zipBody,
    };
  }

  throw new Error(
    `[helium/unpack] crx: unsupported header version ${version} (expected 2, 3, or 4)`,
  );
}

/**
 * Heuristic: walk the protobuf header looking for a length-delimited
 * field whose length is the typical DER-encoded RSA public-key size
 * (between 270 and 600 bytes covers RSA-2048 and RSA-4096 with
 * SubjectPublicKeyInfo framing). The first such candidate is returned.
 * Logs a warn and returns null on miss.
 */
function scanHeaderForPublicKey(header: Uint8Array): Uint8Array | null {
  const MIN_KEY = 270;
  const MAX_KEY = 600;

  let i = 0;
  while (i < header.length) {
    const tag = header[i];
    if ((tag & 0x07) !== 2) {
      i++;
      continue;
    }
    let len = 0;
    let shift = 0;
    let j = i + 1;
    let ok = false;
    while (j < header.length && j - i < 6) {
      const byte = header[j];
      len |= (byte & 0x7f) << shift;
      j++;
      if ((byte & 0x80) === 0) {
        ok = true;
        break;
      }
      shift += 7;
    }
    if (!ok) {
      i++;
      continue;
    }
    if (len >= MIN_KEY && len <= MAX_KEY && j + len <= header.length) {
      return header.slice(j, j + len);
    }
    i++;
  }

  console.warn(
    '[helium/unpack] crx: could not locate public key in header, will fall back',
  );
  return null;
}
