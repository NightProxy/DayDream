use percent_encoding::{percent_decode_str, percent_encode, AsciiSet, NON_ALPHANUMERIC};
use wasm_bindgen::prelude::*;

/// Characters left unencoded by JavaScript's `encodeURIComponent`.
/// Unreserved (RFC 3986): A-Z a-z 0-9 - _ . ~
const ENCODE_SET: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'~');

const PAD_BYTE: u8 = b'_';

/// Encode a string using the Obscura pipeline:
/// 1. Percent-encode input (encodeURIComponent equivalent)
/// 2. Bytes → pad to multiple of 4 with `_`
/// 3. Z85 encode
/// 4. Percent-encode Z85 output (URL-safe encodeURIComponent)
#[wasm_bindgen]
pub fn encode(input: &str) -> String {
    // Step 1: Percent encode input
    let percent_encoded = percent_encode(input.as_bytes(), ENCODE_SET).to_string();

    // Step 2: Convert to bytes, prepend padding count, pad to multiple of 4
    let payload = percent_encoded.into_bytes();
    let padding = (4 - ((payload.len() + 1) % 4)) % 4;
    let mut bytes = Vec::with_capacity(1 + payload.len() + padding);
    bytes.push(padding as u8);
    bytes.extend_from_slice(&payload);
    for _ in 0..padding {
        bytes.push(PAD_BYTE);
    }

    // Step 3: Z85 encode
    let z85_encoded = z85::encode(&bytes);

    // Step 4: Percent-encode Z85 output — fully URL-safe, no raw special chars
    percent_encode(z85_encoded.as_bytes(), ENCODE_SET).to_string()
}

/// Decode a string using the reverse Obscura pipeline.
/// Returns `Err` for any malformed input.
#[wasm_bindgen]
pub fn decode(input: &str) -> Result<String, String> {
    // Step 1: Percent-decode to get Z85 string
    let z85_encoded = percent_decode_str(input)
        .decode_utf8()
        .map_err(|e| format!("Percent decode error: {}", e))?;

    // Step 2: Z85 decode
    let bytes = z85::decode(&*z85_encoded).map_err(|e| format!("Z85 decode error: {:?}", e))?;

    // Step 3: Read padding count and remove padding safely
    if bytes.is_empty() {
        return Err("Decoded data is empty".into());
    }
    let padding = bytes[0] as usize;
    if padding > 3 {
        return Err(format!("Invalid padding count: {}", padding));
    }
    let data_end = bytes.len().saturating_sub(padding);
    if data_end < 1 {
        return Err("Decoded data too short after removing padding".into());
    }
    if padding > 0 && bytes[data_end..].iter().any(|&b| b != PAD_BYTE) {
        return Err("Invalid padding bytes detected".into());
    }
    let payload = &bytes[1..data_end];

    // Step 4: Convert payload to UTF-8 string (percent-encoded original)
    let percent_encoded = String::from_utf8(payload.to_vec())
        .map_err(|e| format!("Invalid UTF-8 after Z85 decode: {}", e))?;

    // Step 5: Percent-decode original input
    let decoded = percent_decode_str(&percent_encoded)
        .decode_utf8()
        .map_err(|e| format!("Percent decode error: {}", e))?;

    Ok(decoded.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_ascii_roundtrip() {
        let original = "HelloWorld";
        let encoded = encode(original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_spaces_and_symbols() {
        let original = "Hello world! / test?=yes";
        let encoded = encode(original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_unicode_emoji() {
        let original = "Hello 🌍! 你好";
        let encoded = encode(original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_empty_string() {
        let original = "";
        let encoded = encode(original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_trailing_underscore_original() {
        let original = "hello_";
        let encoded = encode(original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_url_safety() {
        let original = "https://www.duckduckgo.com/?q=e";
        let encoded = encode(original);
        // Ensure no raw ? & = / characters in output
        assert!(!encoded.contains('?'));
        assert!(!encoded.contains('&'));
        assert!(!encoded.contains('='));
        assert!(!encoded.contains('/'));
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_invalid_input() {
        let result = decode("not-valid-z85!!!");
        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_z85_length() {
        let result = decode("~~~~");
        assert!(result.is_err());
    }

    #[test]
    fn test_roundtrip_various_lengths() {
        let cases = vec![
            "a",
            "ab",
            "abc",
            "abcd",
            "abcde",
            "abcdef",
            "abcdefg",
            "1234567890",
            "Special: <>[]{}",
            "Unicode: αβγ δεζ",
            "🔒 secret 🗝️",
        ];
        for case in cases {
            let encoded = encode(case);
            let decoded = decode(&encoded).unwrap();
            assert_eq!(decoded, case, "Failed roundtrip for: {}", case);
        }
    }
}
