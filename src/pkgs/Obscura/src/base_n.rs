use crate::errors::{CodecError, Result};

/// Word-safe alphabets. Both are vowel-free (no `a e i o u`) and exclude the
/// vowel-substitute digits `0 1 3 4`, so no vowel-bearing word can form.
pub const COMPACT_CHARS: &str = "bcdfghjkmnpqrstvwxzCDFHJKMNPQRTVWX256789";
pub const READABLE_CHARS: &str = "bcdfghjkmnpqrstvwxz256789";

/// Marks a token as using the `readable` alphabet. Deliberately a vowel, so it
/// can never collide with a payload symbol.
pub const READABLE_TAG: char = 'o';

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AlphabetName {
	Compact,
	Readable,
}

pub struct Alphabet {
	pub name: AlphabetName,
	pub chars: &'static [u8],
	pub base: u32,
	pub zero: char,
}

pub const COMPACT: Alphabet = Alphabet {
	name: AlphabetName::Compact,
	chars: COMPACT_CHARS.as_bytes(),
	base: COMPACT_CHARS.len() as u32,
	zero: 'b',
};

pub const READABLE: Alphabet = Alphabet {
	name: AlphabetName::Readable,
	chars: READABLE_CHARS.as_bytes(),
	base: READABLE_CHARS.len() as u32,
	zero: 'b',
};

impl Alphabet {
	pub fn label(&self) -> &'static str {
		match self.name {
			AlphabetName::Compact => "compact",
			AlphabetName::Readable => "readable",
		}
	}

	pub fn value_of(&self, c: char) -> Option<u32> {
		if !c.is_ascii() {
			return None;
		}
		self.chars
			.iter()
			.position(|&b| b == c as u8)
			.map(|i| i as u32)
	}

	pub fn contains(&self, c: char) -> bool {
		self.value_of(c).is_some()
	}
}

fn is_allowed(c: char) -> bool {
	COMPACT.contains(c) || READABLE.contains(c) || c == READABLE_TAG
}

/// Big-integer base conversion (the base58 algorithm) over a byte array, so we
/// avoid pulling in a bignum dependency. Leading zero bytes are preserved as
/// leading zero symbols rather than being folded into the number.
pub fn bytes_to_base_n(bytes: &[u8], ab: &Alphabet) -> String {
	let zeros = bytes.iter().take_while(|&&b| b == 0).count();

	let mut digits: Vec<u32> = Vec::new();
	for &byte in bytes {
		let mut carry = byte as u32;
		for digit in digits.iter_mut() {
			let acc = (*digit << 8) | (carry & 0xff);
			*digit = acc % ab.base;
			carry = acc / ab.base;
		}
		while carry > 0 {
			digits.push(carry % ab.base);
			carry /= ab.base;
		}
	}

	let mut out = String::with_capacity(zeros + digits.len());
	for _ in 0..zeros {
		out.push(ab.zero);
	}
	for &d in digits.iter().rev() {
		out.push(ab.chars[d as usize] as char);
	}
	out
}

pub fn base_n_to_bytes(s: &str, ab: &Alphabet) -> Result<Vec<u8>> {
	let zeros = s.chars().take_while(|&c| c == ab.zero).count();

	let mut bytes: Vec<u8> = Vec::new();
	for c in s.chars() {
		let d = ab.value_of(c).ok_or_else(|| {
			CodecError::new(format!("symbol '{}' not in alphabet {}", c, ab.label()))
		})?;
		let mut carry = d;
		for byte in bytes.iter_mut() {
			let acc = (*byte as u32) * ab.base + carry;
			*byte = (acc & 0xff) as u8;
			carry = acc >> 8;
		}
		while carry > 0 {
			bytes.push((carry & 0xff) as u8);
			carry >>= 8;
		}
	}

	let mut out = vec![0u8; zeros];
	out.extend(bytes.iter().rev());
	Ok(out)
}

pub fn group(s: &str, size: usize, separator: &str) -> String {
	if size == 0 {
		return s.to_string();
	}
	let chars: Vec<char> = s.chars().collect();
	chars
		.chunks(size)
		.map(|c| c.iter().collect::<String>())
		.collect::<Vec<_>>()
		.join(separator)
}

pub fn strip_separators(s: &str) -> String {
	s.chars().filter(|&c| is_allowed(c)).collect()
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn alphabets_are_vowel_free() {
		for c in COMPACT_CHARS.chars().chain(READABLE_CHARS.chars()) {
			// Vowels, plus the vowel-substitute digits 0/1/3/4 (o/i/e/a).
			assert!(!"aeiouAEIOU0134".contains(c), "{} is not word-safe", c);
		}
	}

	#[test]
	fn alphabets_have_no_duplicates() {
		for chars in [COMPACT_CHARS, READABLE_CHARS] {
			let mut seen: Vec<char> = chars.chars().collect();
			seen.sort_unstable();
			let before = seen.len();
			seen.dedup();
			assert_eq!(seen.len(), before);
		}
	}

	#[test]
	fn readable_tag_is_not_in_either_alphabet() {
		assert!(!COMPACT.contains(READABLE_TAG));
		assert!(!READABLE.contains(READABLE_TAG));
	}

	#[test]
	fn roundtrips_bytes_through_both_alphabets() {
		let cases: Vec<Vec<u8>> = vec![
			vec![],
			vec![0],
			vec![0, 0, 0],
			vec![1],
			vec![255],
			vec![0, 1, 2, 3, 250, 251],
			(0..=255u8).collect(),
		];
		for ab in [&COMPACT, &READABLE] {
			for case in &cases {
				let encoded = bytes_to_base_n(case, ab);
				assert_eq!(&base_n_to_bytes(&encoded, ab).unwrap(), case);
			}
		}
	}

	#[test]
	fn preserves_leading_zero_bytes() {
		let bytes = vec![0, 0, 42];
		let encoded = bytes_to_base_n(&bytes, &COMPACT);
		assert!(encoded.starts_with("bb"));
		assert_eq!(base_n_to_bytes(&encoded, &COMPACT).unwrap(), bytes);
	}

	#[test]
	fn tokens_are_alphanumeric() {
		let encoded = bytes_to_base_n(&[9, 8, 7, 6, 5], &COMPACT);
		assert!(encoded.chars().all(|c| c.is_ascii_alphanumeric()));
	}

	#[test]
	fn rejects_symbols_outside_the_alphabet() {
		assert!(base_n_to_bytes("aaa", &COMPACT).is_err());
		// compact-only capitals are invalid in the readable alphabet
		assert!(base_n_to_bytes("C", &READABLE).is_err());
	}

	#[test]
	fn grouping_then_stripping_is_identity() {
		let token = bytes_to_base_n(&[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], &COMPACT);
		let grouped = group(&token, 4, "-");
		assert!(grouped.contains('-'));
		assert_eq!(strip_separators(&grouped), token);
	}

	#[test]
	fn group_size_zero_is_a_noop() {
		assert_eq!(group("bcdfg", 0, "-"), "bcdfg");
	}
}
