pub const FLAGGED_SUBSTRINGS: &[&str] = &[
	"sex", "porn", "anal", "cum", "fuck", "shit", "rape", "nude", "boob", "dick", "cock", "slut",
	"xxx", "kkk", "fck", "sht", "prn", "thc", "pcp", "dmt", "ghb",
];

pub fn has_flagged(token: &str, blocklist: &[&str]) -> bool {
	if blocklist.is_empty() {
		return false;
	}
	let haystack = token.to_lowercase();
	blocklist
		.iter()
		.any(|word| !word.is_empty() && haystack.contains(&word.to_lowercase()))
}

/// Deterministic LCG keystream, byte-for-byte identical to the reference
/// implementation's `keystreamXor`. All arithmetic is mod 2^32.
pub fn keystream_xor(data: &[u8], salt: u8) -> Vec<u8> {
	let mut state: u32 = (salt as u32).wrapping_add(1).wrapping_mul(0x9e37_79b1);
	data
		.iter()
		.map(|b| {
			state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
			b ^ ((state >> 24) & 0xff) as u8
		})
		.collect()
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn detects_flagged_case_insensitively() {
		assert!(has_flagged("abcSEXdef", FLAGGED_SUBSTRINGS));
		assert!(has_flagged("xxx", FLAGGED_SUBSTRINGS));
		assert!(!has_flagged("bcdfgh", FLAGGED_SUBSTRINGS));
	}

	#[test]
	fn empty_blocklist_flags_nothing() {
		assert!(!has_flagged("sex", &[]));
	}

	#[test]
	fn xor_is_an_involution() {
		let data = b"the quick brown fox jumps over the lazy dog";
		for salt in [0u8, 1, 7, 128, 255] {
			let once = keystream_xor(data, salt);
			assert_eq!(keystream_xor(&once, salt), data.to_vec());
		}
	}

	#[test]
	fn different_salts_give_different_streams() {
		let data = [0u8; 32];
		assert_ne!(keystream_xor(&data, 1), keystream_xor(&data, 2));
	}

	#[test]
	fn xor_is_deterministic() {
		let data = b"stable";
		assert_eq!(keystream_xor(data, 9), keystream_xor(data, 9));
	}

	#[test]
	fn handles_empty_input() {
		assert!(keystream_xor(&[], 5).is_empty());
	}
}
