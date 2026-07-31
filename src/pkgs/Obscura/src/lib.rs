//! Obscura — the Daylight URL codec, compiled to WebAssembly.
//!
//! `encode` / `decode` are the Daylight codec (see `codec`). The previous
//! percent-encode + Z85 implementation is preserved in `legacy` and exported
//! as `legacy_encode` / `legacy_decode`.

use wasm_bindgen::prelude::*;

pub mod base_n;
pub mod codec;
pub mod deflate;
pub mod errors;
pub mod header;
pub mod legacy;
pub mod safety;
pub mod structural;
pub mod tables;
pub mod varint;

use base_n::AlphabetName;
use codec::EncodeOptions;

#[wasm_bindgen]
pub fn encode(input: &str) -> Result<String, String> {
	codec::encode(input).map_err(|e| e.0)
}

#[wasm_bindgen]
pub fn decode(input: &str) -> Result<String, String> {
	codec::decode(input).map_err(|e| e.0)
}

/// `alphabet` accepts "compact" (default) or "readable". Pass `group = 0` to
/// disable grouping.
#[wasm_bindgen]
pub fn encode_with_options(
	input: &str,
	group: Option<usize>,
	separator: Option<String>,
	alphabet: Option<String>,
) -> Result<String, String> {
	let mut opts = EncodeOptions::default();
	if let Some(g) = group {
		opts.group = g;
	}
	if let Some(s) = separator {
		opts.separator = s;
	}
	if let Some(a) = alphabet {
		opts.alphabet = match a.as_str() {
			"readable" => AlphabetName::Readable,
			"compact" => AlphabetName::Compact,
			other => return Err(format!("unknown alphabet '{}'", other)),
		};
	}
	codec::encode_with(input, &opts).map_err(|e| e.0)
}

#[wasm_bindgen]
pub fn is_daylight_token(token: &str) -> bool {
	codec::is_daylight_token(token)
}

#[wasm_bindgen]
pub fn legacy_encode(input: &str) -> String {
	legacy::encode(input)
}

#[wasm_bindgen]
pub fn legacy_decode(input: &str) -> Result<String, String> {
	legacy::decode(input)
}
