use crate::errors::{CodecError, Result};

pub const VERSION: u8 = 1;
pub const MODE_STRUCTURED: u8 = 0;
pub const MODE_RAW: u8 = 1;

pub const SALTED_BYTE_MASK: u8 = 0x20;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Header {
	pub mode: u8,
	pub https: bool,
	pub www: bool,
	pub host_from_table: bool,
	pub deflated: bool,
}

pub fn pack_header(h: &Header) -> u8 {
	(VERSION << 6)
		| ((h.mode & 0x03) << 4)
		| ((h.https as u8) << 3)
		| ((h.www as u8) << 2)
		| ((h.host_from_table as u8) << 1)
		| (h.deflated as u8)
}

pub fn unpack_header(byte: u8) -> Result<Header> {
	let version = (byte >> 6) & 0x03;
	if version != VERSION {
		return Err(CodecError::new(format!(
			"unsupported codec version {}",
			version
		)));
	}
	Ok(Header {
		mode: (byte >> 4) & 0x03,
		https: (byte >> 3) & 1 == 1,
		www: (byte >> 2) & 1 == 1,
		host_from_table: (byte >> 1) & 1 == 1,
		deflated: byte & 1 == 1,
	})
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn roundtrips_every_flag_combination() {
		for mode in [MODE_STRUCTURED, MODE_RAW] {
			for https in [false, true] {
				for www in [false, true] {
					for host_from_table in [false, true] {
						for deflated in [false, true] {
							let h = Header { mode, https, www, host_from_table, deflated };
							assert_eq!(unpack_header(pack_header(&h)).unwrap(), h);
						}
					}
				}
			}
		}
	}

	#[test]
	fn encodes_version_in_high_bits() {
		let h = Header {
			mode: MODE_STRUCTURED,
			https: true,
			www: false,
			host_from_table: true,
			deflated: false,
		};
		assert_eq!((pack_header(&h) >> 6) & 0x03, VERSION);
	}

	#[test]
	fn rejects_unknown_version() {
		assert!(unpack_header(0b1100_0000).is_err());
	}

	#[test]
	fn salt_mask_is_within_the_header_byte() {
		assert_eq!(SALTED_BYTE_MASK & 0xc0, 0);
	}
}
