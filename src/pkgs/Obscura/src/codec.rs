//! Daylight URL codec.
//!
//! Three stages, applied in order:
//!   1. Structural model  — fold scheme/`www.` into header bits, map known
//!                          hosts and TLDs to small indices (`structural`).
//!   2. Deflate           — raw deflate primed with a URL dictionary, kept
//!                          only when it shrinks (`deflate`).
//!   3. Word-safe base-N  — big-integer base conversion over a vowel-free
//!                          alphabet (`base_n`).
//!
//! A salt-retry guard rewrites the payload if the rendered token happens to
//! spell a flagged substring.

use crate::base_n::{
	base_n_to_bytes, bytes_to_base_n, group, strip_separators, Alphabet, AlphabetName, COMPACT,
	READABLE, READABLE_TAG,
};
use crate::deflate::{compress_remainder, decompress_remainder};
use crate::errors::{CodecError, Result};
use crate::header::{
	pack_header, unpack_header, Header, MODE_RAW, MODE_STRUCTURED, SALTED_BYTE_MASK,
};
use crate::safety::{has_flagged, keystream_xor, FLAGGED_SUBSTRINGS};
use crate::structural::{detokenize_url, tokenize_url, HostRef, UrlModel};
use crate::tables::{DOMAIN_TABLE, TLD_TABLE};
use crate::varint::{read_varint, write_varint};

const MAX_SALT: u16 = 255;

#[derive(Debug, Clone)]
pub struct EncodeOptions {
	pub group: usize,
	pub separator: String,
	pub alphabet: AlphabetName,
	pub blocklist: Option<Vec<String>>,
}

impl Default for EncodeOptions {
	fn default() -> Self {
		EncodeOptions {
			group: 0,
			separator: "-".to_string(),
			alphabet: AlphabetName::Compact,
			blocklist: None,
		}
	}
}

fn serialize(model: &UrlModel) -> Vec<u8> {
	match model {
		UrlModel::Raw { body } => {
			let rem = compress_remainder(body.as_bytes());
			let header = pack_header(&Header {
				mode: MODE_RAW,
				https: false,
				www: false,
				host_from_table: false,
				deflated: rem.deflated,
			});
			let mut out = vec![header];
			out.extend_from_slice(&rem.bytes);
			out
		}
		UrlModel::Structured { https, www, host, remainder } => {
			let rem = compress_remainder(remainder.as_bytes());
			let host_from_table = matches!(host, HostRef::Table { .. });
			let mut out = vec![pack_header(&Header {
				mode: MODE_STRUCTURED,
				https: *https,
				www: *www,
				host_from_table,
				deflated: rem.deflated,
			})];

			match host {
				HostRef::Table { index } => write_varint(*index as u64, &mut out),
				HostRef::Inline { tld_index, name } => {
					out.push(*tld_index);
					let name_bytes = name.as_bytes();
					write_varint(name_bytes.len() as u64, &mut out);
					out.extend_from_slice(name_bytes);
				}
			}

			out.extend_from_slice(&rem.bytes);
			out
		}
	}
}

fn deserialize(bytes: &[u8]) -> Result<UrlModel> {
	if bytes.is_empty() {
		return Err(CodecError::new("empty payload"));
	}
	let header = unpack_header(bytes[0])?;

	if header.mode == MODE_RAW {
		let body = decompress_remainder(&bytes[1..], header.deflated)?;
		return Ok(UrlModel::Raw {
			body: String::from_utf8(body)
				.map_err(|e| CodecError::new(format!("invalid UTF-8 in body: {}", e)))?,
		});
	}
	if header.mode != MODE_STRUCTURED {
		return Err(CodecError::new(format!("unknown mode {}", header.mode)));
	}

	let mut pos = 1usize;
	let host = if header.host_from_table {
		let r = read_varint(bytes, pos)?;
		pos = r.next;
		if r.value as usize >= DOMAIN_TABLE.len() {
			return Err(CodecError::new("domain index out of range"));
		}
		HostRef::Table { index: r.value as usize }
	} else {
		if pos >= bytes.len() {
			return Err(CodecError::new("truncated host"));
		}
		let tld_index = bytes[pos];
		pos += 1;
		if tld_index as usize > TLD_TABLE.len() {
			return Err(CodecError::new("tld index out of range"));
		}
		let len_r = read_varint(bytes, pos)?;
		pos = len_r.next;
		let end = pos
			.checked_add(len_r.value as usize)
			.ok_or_else(|| CodecError::new("host name length overflow"))?;
		if end > bytes.len() {
			return Err(CodecError::new("truncated host name"));
		}
		let name = String::from_utf8(bytes[pos..end].to_vec())
			.map_err(|e| CodecError::new(format!("invalid UTF-8 in host: {}", e)))?;
		pos = end;
		HostRef::Inline { tld_index, name }
	};

	let remainder = decompress_remainder(&bytes[pos..], header.deflated)?;
	Ok(UrlModel::Structured {
		https: header.https,
		www: header.www,
		host,
		remainder: String::from_utf8(remainder)
			.map_err(|e| CodecError::new(format!("invalid UTF-8 in remainder: {}", e)))?,
	})
}

fn apply_salt(payload: &[u8], salt: u8) -> Vec<u8> {
	let data = keystream_xor(&payload[1..], salt);
	let mut out = Vec::with_capacity(2 + data.len());
	out.push(payload[0] | SALTED_BYTE_MASK);
	out.push(salt);
	out.extend_from_slice(&data);
	out
}

fn remove_salt(bytes: &[u8]) -> Result<Vec<u8>> {
	if bytes.len() < 2 {
		return Err(CodecError::new("truncated salted token"));
	}
	let data = keystream_xor(&bytes[2..], bytes[1]);
	let mut out = Vec::with_capacity(1 + data.len());
	out.push(bytes[0] & !SALTED_BYTE_MASK);
	out.extend_from_slice(&data);
	Ok(out)
}

fn pick_alphabet(opts: &EncodeOptions) -> (&'static Alphabet, &'static str) {
	match opts.alphabet {
		AlphabetName::Readable => (&READABLE, "o"),
		AlphabetName::Compact => (&COMPACT, ""),
	}
}

fn validate_separator(separator: &str, ab: &Alphabet) -> Result<()> {
	if separator.is_empty() {
		return Err(CodecError::new("separator must be non-empty"));
	}
	for c in separator.chars() {
		if ab.contains(c) || c == READABLE_TAG {
			return Err(CodecError::new(format!(
				"separator '{}' collides with the alphabet",
				separator
			)));
		}
	}
	Ok(())
}

pub fn encode_with(url: &str, opts: &EncodeOptions) -> Result<String> {
	let (ab, tag) = pick_alphabet(opts);

	let owned_blocklist: Vec<&str> = match &opts.blocklist {
		Some(list) => list.iter().map(|s| s.as_str()).collect(),
		None => FLAGGED_SUBSTRINGS.to_vec(),
	};

	let model = tokenize_url(url);
	let payload = serialize(&model);

	let mut core = format!("{}{}", tag, bytes_to_base_n(&payload, ab));
	if has_flagged(&core, &owned_blocklist) {
		let mut found = None;
		for salt in 1..=MAX_SALT {
			let candidate = format!(
				"{}{}",
				tag,
				bytes_to_base_n(&apply_salt(&payload, salt as u8), ab)
			);
			if !has_flagged(&candidate, &owned_blocklist) {
				found = Some(candidate);
				break;
			}
		}
		core = found.ok_or_else(|| {
			CodecError::new("could not render a filter-safe token for this input")
		})?;
	}

	if opts.group > 0 {
		validate_separator(&opts.separator, ab)?;
		return Ok(group(&core, opts.group, &opts.separator));
	}
	Ok(core)
}

pub fn encode(url: &str) -> Result<String> {
	encode_with(url, &EncodeOptions::default())
}

pub fn decode(token: &str) -> Result<String> {
	if token.is_empty() {
		return Err(CodecError::new("token must be a non-empty string"));
	}

	let mut t = strip_separators(token);
	let mut ab = &COMPACT;
	if t.starts_with(READABLE_TAG) {
		ab = &READABLE;
		t = t[READABLE_TAG.len_utf8()..].to_string();
	}
	if t.is_empty() {
		return Err(CodecError::new("token has no payload"));
	}

	let mut bytes = base_n_to_bytes(&t, ab)?;
	if bytes.is_empty() {
		return Err(CodecError::new("empty payload"));
	}
	if bytes[0] & SALTED_BYTE_MASK != 0 {
		bytes = remove_salt(&bytes)?;
	}

	Ok(detokenize_url(&deserialize(&bytes)?))
}

pub fn is_daylight_token(token: &str) -> bool {
	let stripped = strip_separators(token);
	let is_readable = stripped.starts_with(READABLE_TAG);
	let body = if is_readable {
		&stripped[READABLE_TAG.len_utf8()..]
	} else {
		&stripped[..]
	};
	if body.is_empty() {
		return false;
	}
	let ab = if is_readable { &READABLE } else { &COMPACT };
	if !body.chars().all(|c| ab.contains(c)) {
		return false;
	}
	match base_n_to_bytes(body, ab) {
		Ok(bytes) if !bytes.is_empty() => unpack_header(bytes[0]).is_ok(),
		_ => false,
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	const CORPUS: &[&str] = &[
		"https://google.com",
		"http://google.com",
		"https://www.google.com",
		"https://www.google.com/search?q=rust+lang",
		"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		"https://en.wikipedia.org/wiki/Rust_(programming_language)",
		"https://github.com/rust-lang/rust/issues/12345",
		"https://example.co.uk/a/b/c?d=e#f",
		"https://sub.domain.example.org/deep/path?x=1&y=2",
		"http://192.168.1.1:8080/admin",
		"https://localhost",
		"ftp://example.com/file.txt",
		"not a url at all",
		"",
		"https://example.com/\u{1f600}/unicode",
		"https://example.com/very/long/path/that/goes/on?and=on&and=on&utm_source=x&utm_medium=y",
	];

	#[test]
	fn roundtrips_the_corpus() {
		for url in CORPUS {
			let token = encode(url).unwrap();
			assert_eq!(&decode(&token).unwrap(), url, "roundtrip failed for {:?}", url);
		}
	}

	#[test]
	fn roundtrips_under_the_readable_alphabet() {
		let opts = EncodeOptions { alphabet: AlphabetName::Readable, ..Default::default() };
		for url in CORPUS {
			let token = encode_with(url, &opts).unwrap();
			assert!(token.starts_with(READABLE_TAG));
			assert_eq!(&decode(&token).unwrap(), url);
		}
	}

	#[test]
	fn is_deterministic() {
		for url in CORPUS {
			assert_eq!(encode(url).unwrap(), encode(url).unwrap());
		}
	}

	#[test]
	fn tokens_are_url_safe() {
		for url in CORPUS {
			let token = encode(url).unwrap();
			assert!(
				token.chars().all(|c| c.is_ascii_alphanumeric()),
				"token {:?} is not path-safe",
				token
			);
		}
	}

	#[test]
	fn tokens_are_filter_safe() {
		for url in CORPUS {
			assert!(!has_flagged(&encode(url).unwrap(), FLAGGED_SUBSTRINGS));
		}
	}

	#[test]
	fn salt_guard_rewrites_a_flagged_token() {
		// Force the guard by blocking whatever the unsalted token renders as.
		let url = "https://google.com";
		let plain = encode(url).unwrap();
		let opts = EncodeOptions {
			blocklist: Some(vec![plain.clone()]),
			..Default::default()
		};
		let salted = encode_with(url, &opts).unwrap();
		assert_ne!(salted, plain);
		assert_eq!(decode(&salted).unwrap(), url);
	}

	#[test]
	fn common_hosts_compress_hard() {
		let token = encode("https://google.com").unwrap();
		assert!(token.len() < 8, "expected a short token, got {:?}", token);
	}

	#[test]
	fn grouping_roundtrips() {
		let opts = EncodeOptions { group: 4, ..Default::default() };
		let url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
		let token = encode_with(url, &opts).unwrap();
		assert!(token.contains('-'));
		assert_eq!(decode(&token).unwrap(), url);
	}

	#[test]
	fn rejects_a_separator_that_collides_with_the_alphabet() {
		let opts = EncodeOptions { group: 4, separator: "b".to_string(), ..Default::default() };
		assert!(encode_with("https://google.com", &opts).is_err());
	}

	#[test]
	fn rejects_an_empty_separator() {
		let opts = EncodeOptions { group: 4, separator: String::new(), ..Default::default() };
		assert!(encode_with("https://google.com", &opts).is_err());
	}

	#[test]
	fn decode_rejects_malformed_input() {
		assert!(decode("").is_err());
		// 'a' is a vowel, so it strips to nothing.
		assert!(decode("aaa").is_err());
	}

	#[test]
	fn recognizes_its_own_tokens() {
		for url in CORPUS {
			assert!(is_daylight_token(&encode(url).unwrap()));
		}
	}

	#[test]
	fn rejects_non_tokens() {
		assert!(!is_daylight_token(""));
		assert!(!is_daylight_token("hello world"));
		assert!(!is_daylight_token("https://google.com"));
	}

	#[test]
	fn beats_raw_length_on_common_urls() {
		// The headline claim from the spec: common sites compress hardest.
		for url in [
			"https://google.com",
			"https://www.youtube.com",
			"https://en.wikipedia.org",
		] {
			assert!(encode(url).unwrap().len() < url.len());
		}
	}

	#[test]
	fn handles_long_and_repetitive_urls() {
		let url = format!("https://example.com/{}", "segment/".repeat(300));
		assert_eq!(decode(&encode(&url).unwrap()).unwrap(), url);
	}
}
