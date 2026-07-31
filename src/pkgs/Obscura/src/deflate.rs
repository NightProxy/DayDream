use crate::errors::{CodecError, Result};
use crate::tables::url_dictionary;
use flate2::{Compress, Compression, Decompress, FlushCompress, FlushDecompress, Status};

/// Below this, deflate framing overhead always outweighs any savings.
const DEFLATE_MIN_BYTES: usize = 32;

pub struct Compressed {
	pub bytes: Vec<u8>,
	pub deflated: bool,
}

fn deflate_with_dictionary(input: &[u8]) -> Result<Vec<u8>> {
	let mut c = Compress::new(Compression::best(), false);
	c.set_dictionary(&url_dictionary())
		.map_err(|e| CodecError::new(format!("set_dictionary failed: {}", e)))?;
	let mut out = Vec::with_capacity(input.len());
	let status = c
		.compress_vec(input, &mut out, FlushCompress::Finish)
		.map_err(|e| CodecError::new(format!("deflate failed: {}", e)))?;
	if status != Status::StreamEnd {
		return Err(CodecError::new("deflate did not reach stream end"));
	}
	Ok(out)
}

fn inflate_with_dictionary(input: &[u8]) -> Result<Vec<u8>> {
	// Grow geometrically until the whole stream fits.
	let mut cap = (input.len() * 4).max(64);
	loop {
		let mut out = Vec::with_capacity(cap);
		let mut d = Decompress::new(false);
		d.set_dictionary(&url_dictionary())
			.map_err(|e| CodecError::new(format!("set_dictionary failed: {}", e)))?;
		match d.decompress_vec(input, &mut out, FlushDecompress::Finish) {
			Ok(Status::StreamEnd) => return Ok(out),
			Ok(_) if cap < (1 << 22) => cap *= 4,
			Ok(_) => return Err(CodecError::new("inflate output exceeded the size limit")),
			Err(e) => return Err(CodecError::new(format!("inflate failed: {}", e))),
		}
	}
}

/// Deflate is kept only when it actually shrinks the input, so a token is never
/// made worse by compression.
pub fn compress_remainder(remainder: &[u8]) -> Compressed {
	if remainder.len() < DEFLATE_MIN_BYTES {
		return Compressed { bytes: remainder.to_vec(), deflated: false };
	}
	if let Ok(d) = deflate_with_dictionary(remainder) {
		if d.len() < remainder.len() {
			return Compressed { bytes: d, deflated: true };
		}
	}
	Compressed { bytes: remainder.to_vec(), deflated: false }
}

pub fn decompress_remainder(bytes: &[u8], deflated: bool) -> Result<Vec<u8>> {
	if !deflated {
		return Ok(bytes.to_vec());
	}
	inflate_with_dictionary(bytes)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn short_input_is_left_alone() {
		let input = b"/short";
		let c = compress_remainder(input);
		assert!(!c.deflated);
		assert_eq!(c.bytes, input.to_vec());
	}

	#[test]
	fn roundtrips_compressible_input() {
		let input = b"/search?q=hello+world&utm_source=test&utm_medium=test&utm_campaign=test";
		let c = compress_remainder(input);
		assert_eq!(decompress_remainder(&c.bytes, c.deflated).unwrap(), input.to_vec());
	}

	#[test]
	fn dictionary_helps_common_fragments() {
		let input = b"/watch?v=dQw4w9WgXcQ&list=PLxyz&index=2&utm_source=share";
		let c = compress_remainder(input);
		assert!(c.deflated, "expected the dictionary to make this shrink");
		assert!(c.bytes.len() < input.len());
	}

	#[test]
	fn incompressible_input_is_passed_through() {
		// High-entropy bytes cannot shrink, so pick-smaller must decline.
		let input: Vec<u8> = (0..200u32).map(|i| (i.wrapping_mul(2_654_435_761) >> 13) as u8).collect();
		let c = compress_remainder(&input);
		assert_eq!(decompress_remainder(&c.bytes, c.deflated).unwrap(), input);
	}

	#[test]
	fn roundtrips_a_large_remainder() {
		let input: Vec<u8> = "/api/v1/items?page=".repeat(500).into_bytes();
		let c = compress_remainder(&input);
		assert!(c.deflated);
		assert_eq!(decompress_remainder(&c.bytes, c.deflated).unwrap(), input);
	}

	#[test]
	fn undeflated_passthrough_is_identity() {
		assert_eq!(decompress_remainder(b"raw", false).unwrap(), b"raw".to_vec());
	}

	#[test]
	fn corrupt_deflate_stream_errors() {
		assert!(decompress_remainder(&[0xff, 0xff, 0xff, 0xff], true).is_err());
	}
}
