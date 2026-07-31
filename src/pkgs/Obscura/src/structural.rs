use crate::tables::{DOMAIN_TABLE, TLD_TABLE};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HostRef {
	Table { index: usize },
	Inline { tld_index: u8, name: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UrlModel {
	Raw {
		body: String,
	},
	Structured {
		https: bool,
		www: bool,
		host: HostRef,
		remainder: String,
	},
}

/// Splits a URL into a byte-exact, reversible model. `Url::parse` is
/// deliberately avoided — it normalizes (adding trailing slashes, lowercasing,
/// re-encoding) and those rewrites would make the codec lossy.
pub fn tokenize_url(url: &str) -> UrlModel {
	let (https, rest) = if let Some(r) = url.strip_prefix("https://") {
		(true, r)
	} else if let Some(r) = url.strip_prefix("http://") {
		(false, r)
	} else {
		return UrlModel::Raw { body: url.to_string() };
	};

	let (www, rest) = match rest.strip_prefix("www.") {
		Some(r) => (true, r),
		None => (false, rest),
	};

	let end_idx = rest.find(['/', '?', '#']);
	let (host, remainder) = match end_idx {
		Some(i) => (&rest[..i], rest[i..].to_string()),
		None => (rest, String::new()),
	};

	if let Some(index) = DOMAIN_TABLE.iter().position(|&d| d == host) {
		return UrlModel::Structured {
			https,
			www,
			host: HostRef::Table { index },
			remainder,
		};
	}

	// Longest matching suffix wins, so `.co.uk` beats `.uk`. tld_index is
	// 1-based; 0 means "no table TLD, name holds the whole host".
	let mut tld_index: u8 = 0;
	let mut name = host;
	let mut best_len = 0usize;
	for (i, suffix) in TLD_TABLE.iter().enumerate() {
		if suffix.len() > best_len && host.len() > suffix.len() && host.ends_with(suffix) {
			best_len = suffix.len();
			tld_index = (i + 1) as u8;
			name = &host[..host.len() - suffix.len()];
		}
	}

	UrlModel::Structured {
		https,
		www,
		host: HostRef::Inline { tld_index, name: name.to_string() },
		remainder,
	}
}

pub fn detokenize_url(model: &UrlModel) -> String {
	match model {
		UrlModel::Raw { body } => body.clone(),
		UrlModel::Structured { https, www, host, remainder } => {
			let mut out = String::from(if *https { "https://" } else { "http://" });
			if *www {
				out.push_str("www.");
			}
			match host {
				HostRef::Table { index } => out.push_str(DOMAIN_TABLE[*index]),
				HostRef::Inline { tld_index, name } => {
					out.push_str(name);
					if *tld_index > 0 {
						out.push_str(TLD_TABLE[(*tld_index - 1) as usize]);
					}
				}
			}
			out.push_str(remainder);
			out
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn roundtrip(url: &str) {
		assert_eq!(detokenize_url(&tokenize_url(url)), url, "roundtrip failed for {}", url);
	}

	#[test]
	fn folds_scheme_and_www_into_flags() {
		match tokenize_url("https://www.google.com/search?q=x") {
			UrlModel::Structured { https, www, host, remainder } => {
				assert!(https);
				assert!(www);
				assert_eq!(host, HostRef::Table { index: 0 });
				assert_eq!(remainder, "/search?q=x");
			}
			_ => panic!("expected structured"),
		}
	}

	#[test]
	fn non_http_falls_back_to_raw() {
		assert!(matches!(tokenize_url("ftp://example.com"), UrlModel::Raw { .. }));
		assert!(matches!(tokenize_url("not a url"), UrlModel::Raw { .. }));
		assert!(matches!(tokenize_url(""), UrlModel::Raw { .. }));
	}

	#[test]
	fn prefers_the_longest_tld_suffix() {
		match tokenize_url("https://example.co.uk/path") {
			UrlModel::Structured { host: HostRef::Inline { tld_index, name }, .. } => {
				assert_eq!(name, "example");
				assert_eq!(TLD_TABLE[(tld_index - 1) as usize], ".co.uk");
			}
			_ => panic!("expected inline host"),
		}
	}

	#[test]
	fn unknown_tld_keeps_the_whole_host() {
		match tokenize_url("https://example.zzz/") {
			UrlModel::Structured { host: HostRef::Inline { tld_index, name }, .. } => {
				assert_eq!(tld_index, 0);
				assert_eq!(name, "example.zzz");
			}
			_ => panic!("expected inline host"),
		}
	}

	#[test]
	fn host_ends_at_slash_question_or_hash() {
		roundtrip("https://example.com/path");
		roundtrip("https://example.com?q=1");
		roundtrip("https://example.com#frag");
	}

	#[test]
	fn roundtrips_a_realistic_corpus() {
		for url in [
			"https://google.com",
			"http://google.com",
			"https://www.google.com",
			"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			"https://en.wikipedia.org/wiki/Rust_(programming_language)",
			"https://example.co.uk/a/b/c?d=e#f",
			"https://sub.domain.example.org/deep/path",
			"https://localhost",
			"http://192.168.1.1:8080/admin",
			"https://example.com/",
			"https://xn--80ak6aa92e.com/",
			"https://example.com/\u{1f600}",
		] {
			roundtrip(url);
		}
	}

	#[test]
	fn does_not_normalize_away_a_missing_trailing_slash() {
		// `Url::parse` would turn this into "https://google.com/".
		roundtrip("https://google.com");
		assert_ne!(detokenize_url(&tokenize_url("https://google.com")), "https://google.com/");
	}

	#[test]
	fn www_only_stripped_at_the_front() {
		roundtrip("https://notwww.example.com/");
	}
}
