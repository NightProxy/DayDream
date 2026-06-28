/**
 * Extension ID derivation.
 *
 * Chrome's deterministic algorithm:
 *   1. SHA-256 the public key (DER-encoded SubjectPublicKeyInfo)
 *   2. Take the first 16 bytes
 *   3. For each nibble, emit char (nibble + 'a'.charCodeAt(0))
 *   4. Result: 32 lowercase chars in a..p
 *
 * When no key is available we generate a UUID and run the same
 * transformation on its SHA-256 so callers always see the same shape.
 */

const A_CODE = 'a'.charCodeAt(0);

function bytesToApAlphabet(bytes: Uint8Array): string {
  if (bytes.length < 16) {
    throw new Error('[helium/unpack] id: need at least 16 bytes');
  }
  let out = '';
  for (let i = 0; i < 16; i++) {
    const b = bytes[i];
    out += String.fromCharCode(A_CODE + ((b >> 4) & 0xf));
    out += String.fromCharCode(A_CODE + (b & 0xf));
  }
  return out;
}

async function sha256(input: Uint8Array): Promise<Uint8Array> {
  const ab = input.buffer.slice(
    input.byteOffset,
    input.byteOffset + input.byteLength,
  ) as ArrayBuffer;
  const buf = await crypto.subtle.digest('SHA-256', ab);
  return new Uint8Array(buf);
}

export async function deriveExtensionId(
  publicKey: Uint8Array | null,
): Promise<{ id: string; fromKey: boolean }> {
  if (publicKey && publicKey.length > 0) {
    const hash = await sha256(publicKey);
    return { id: bytesToApAlphabet(hash), fromKey: true };
  }
  const uuid = crypto.randomUUID();
  const hash = await sha256(new TextEncoder().encode(uuid));
  return { id: bytesToApAlphabet(hash), fromKey: false };
}
