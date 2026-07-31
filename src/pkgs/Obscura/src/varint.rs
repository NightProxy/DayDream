use crate::errors::{CodecError, Result};

pub fn write_varint(value: u64, out: &mut Vec<u8>) {
	let mut v = value;
	loop {
		let mut byte = (v & 0x7f) as u8;
		v >>= 7;
		if v > 0 {
			byte |= 0x80;
		}
		out.push(byte);
		if v == 0 {
			break;
		}
	}
}

pub struct VarintRead {
	pub value: u64,
	pub next: usize,
}

pub fn read_varint(bytes: &[u8], offset: usize) -> Result<VarintRead> {
	let mut result: u64 = 0;
	let mut shift: u32 = 0;
	let mut pos = offset;
	loop {
		if pos >= bytes.len() {
			return Err(CodecError::new("truncated varint"));
		}
		let b = bytes[pos];
		pos += 1;
		let chunk = (b & 0x7f) as u64;
		result |= chunk
			.checked_shl(shift)
			.ok_or_else(|| CodecError::new("varint overflow"))?;
		if b & 0x80 == 0 {
			break;
		}
		shift += 7;
		if shift >= 64 {
			return Err(CodecError::new("varint overflow"));
		}
	}
	Ok(VarintRead { value: result, next: pos })
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn roundtrip_small() {
		for v in 0u64..1000 {
			let mut buf = Vec::new();
			write_varint(v, &mut buf);
			let r = read_varint(&buf, 0).unwrap();
			assert_eq!(r.value, v);
			assert_eq!(r.next, buf.len());
		}
	}

	#[test]
	fn single_byte_below_128() {
		let mut buf = Vec::new();
		write_varint(127, &mut buf);
		assert_eq!(buf.len(), 1);
	}

	#[test]
	fn multi_byte_at_128() {
		let mut buf = Vec::new();
		write_varint(128, &mut buf);
		assert_eq!(buf.len(), 2);
	}

	#[test]
	fn roundtrip_large() {
		for v in [12345u64, 1 << 20, 1 << 35, u32::MAX as u64] {
			let mut buf = Vec::new();
			write_varint(v, &mut buf);
			assert_eq!(read_varint(&buf, 0).unwrap().value, v);
		}
	}

	#[test]
	fn reads_at_offset() {
		let mut buf = vec![0xaa, 0xbb];
		write_varint(300, &mut buf);
		let r = read_varint(&buf, 2).unwrap();
		assert_eq!(r.value, 300);
		assert_eq!(r.next, buf.len());
	}

	#[test]
	fn truncated_varint_errors() {
		assert!(read_varint(&[0x80], 0).is_err());
		assert!(read_varint(&[], 0).is_err());
	}
}
