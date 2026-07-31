use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodecError(pub String);

impl CodecError {
	pub fn new(message: impl Into<String>) -> Self {
		CodecError(message.into())
	}
}

impl fmt::Display for CodecError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		write!(f, "DaylightCodecError: {}", self.0)
	}
}

impl std::error::Error for CodecError {}

pub type Result<T> = std::result::Result<T, CodecError>;
