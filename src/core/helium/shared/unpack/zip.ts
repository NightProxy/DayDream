/**
 * ZIP central-directory walker.
 *
 * Algorithm:
 *   1. Find End-of-Central-Directory (EOCD) by scanning backward from
 *      the end of the buffer for the 0x06054b50 magic.
 *   2. Read CD offset and entry count from EOCD.
 *   3. For each Central Directory entry, read the Local File Header
 *      offset and the file name.
 *   4. Skip directory entries (name ends in /).
 *   5. Skip encrypted entries (flag bit 0).
 *   6. Read the file data at LFH offset + 30 + nameLen + extraLen.
 *   7. Inflate (compression 8) or copy (compression 0).
 *   8. Reject anything else.
 *
 * Hardening over a naive walk:
 *   - Reject multi-disk archives (numberOfThisDisk != 0).
 *   - Reject ZIP64 (any 0xFFFFFFFF sentinel in size/offset fields).
 *   - Reject path traversal (normalized name contains a `..` segment).
 *   - Reject when per-file or total uncompressed size exceeds caller limits.
 */

import { inflateSync } from 'fflate';

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;
const ZIP64_EOCD_LOCATOR_SIG = 0x07064b50;

export interface UnzipOptions {
  maxFileSize: number;
  maxUncompressedSize: number;
}

export function unzip(
  data: Uint8Array,
  opts: UnzipOptions,
): Map<string, Uint8Array> {
  if (data.byteLength < 22) {
    throw new Error('[helium/unpack] zip: buffer too small to contain EOCD');
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();

  let eocdOffset = -1;
  const minEocd = Math.max(0, data.byteLength - 65557);
  for (let i = data.byteLength - 22; i >= minEocd; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('[helium/unpack] zip: no EOCD record found');
  }

  const numberOfThisDisk = view.getUint16(eocdOffset + 4, true);
  if (numberOfThisDisk !== 0) {
    throw new Error('[helium/unpack] zip: multi-disk archives not supported');
  }

  const cdEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  if (cdEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error('[helium/unpack] zip: ZIP64 archives not supported');
  }
  if (
    eocdOffset >= 20 &&
    view.getUint32(eocdOffset - 20, true) === ZIP64_EOCD_LOCATOR_SIG
  ) {
    throw new Error('[helium/unpack] zip: ZIP64 archives not supported');
  }

  const result = new Map<string, Uint8Array>();
  let cdPos = cdOffset;
  let totalUncompressed = 0;

  for (let i = 0; i < cdEntries; i++) {
    if (cdPos + 46 > data.byteLength) {
      throw new Error('[helium/unpack] zip: CD entry extends past buffer');
    }
    if (view.getUint32(cdPos, true) !== CD_SIG) {
      throw new Error(`[helium/unpack] zip: bad CD signature at offset ${cdPos}`);
    }

    const flags = view.getUint16(cdPos + 8, true);
    const compression = view.getUint16(cdPos + 10, true);
    const compressedSize = view.getUint32(cdPos + 20, true);
    const uncompressedSize = view.getUint32(cdPos + 24, true);
    const fnLen = view.getUint16(cdPos + 28, true);
    const extraLen = view.getUint16(cdPos + 30, true);
    const commentLen = view.getUint16(cdPos + 32, true);
    const lfhOffset = view.getUint32(cdPos + 42, true);

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      lfhOffset === 0xffffffff
    ) {
      throw new Error('[helium/unpack] zip: ZIP64 archives not supported');
    }

    const rawName = decoder.decode(data.subarray(cdPos + 46, cdPos + 46 + fnLen));
    cdPos += 46 + fnLen + extraLen + commentLen;

    if (rawName.endsWith('/')) continue;

    if (flags & 0x1) {
      console.warn(`[helium/unpack] zip: skipping encrypted entry "${rawName}"`);
      continue;
    }

    const normalized = normalizePath(rawName);

    if (uncompressedSize > opts.maxFileSize) {
      throw new Error(
        `[helium/unpack] zip: "${normalized}" exceeds max file size (${uncompressedSize} > ${opts.maxFileSize})`,
      );
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > opts.maxUncompressedSize) {
      throw new Error(
        `[helium/unpack] zip: total exceeds max uncompressed size (${totalUncompressed} > ${opts.maxUncompressedSize})`,
      );
    }

    if (lfhOffset + 30 > data.byteLength) {
      throw new Error(`[helium/unpack] zip: LFH for "${normalized}" past buffer`);
    }
    if (view.getUint32(lfhOffset, true) !== LFH_SIG) {
      throw new Error(`[helium/unpack] zip: bad LFH signature for "${normalized}"`);
    }
    const lfhFnLen = view.getUint16(lfhOffset + 26, true);
    const lfhExtraLen = view.getUint16(lfhOffset + 28, true);
    const dataOffset = lfhOffset + 30 + lfhFnLen + lfhExtraLen;

    if (dataOffset + compressedSize > data.byteLength) {
      throw new Error(`[helium/unpack] zip: data for "${normalized}" past buffer`);
    }
    const compressed = data.subarray(dataOffset, dataOffset + compressedSize);

    if (compression === 0) {
      result.set(normalized, compressed.slice());
    } else if (compression === 8) {
      try {
        result.set(normalized, inflateSync(compressed));
      } catch (e) {
        throw new Error(
          `[helium/unpack] zip: inflate failed for "${normalized}": ${(e as Error).message}`,
        );
      }
    } else {
      throw new Error(
        `[helium/unpack] zip: unsupported compression ${compression} for "${normalized}"`,
      );
    }
  }

  return result;
}

/**
 * Normalize an archive path:
 *   - Backslashes → forward slashes.
 *   - Collapse `.` segments.
 *   - Reject `..` segments anywhere (path traversal).
 *   - Reject absolute paths.
 *   - Return without leading slash.
 */
function normalizePath(rawName: string): string {
  const slashed = rawName.replace(/\\/g, '/');
  if (slashed.startsWith('/')) {
    throw new Error(`[helium/unpack] zip: absolute path in archive: "${rawName}"`);
  }
  const parts = slashed.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      throw new Error(`[helium/unpack] zip: path traversal in archive: "${rawName}"`);
    }
    out.push(part);
  }
  return out.join('/');
}
