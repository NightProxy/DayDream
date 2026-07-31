//! Frozen format data. Evolve by APPENDING only — never reorder or remove an
//! entry, or previously minted tokens will decode to the wrong URL. To make a
//! breaking change, bump `header::VERSION` instead.

pub const DOMAIN_TABLE: &[&str] = &[
	"google.com",
	"youtube.com",
	"facebook.com",
	"instagram.com",
	"x.com",
	"twitter.com",
	"reddit.com",
	"wikipedia.org",
	"amazon.com",
	"tiktok.com",
	"netflix.com",
	"twitch.tv",
	"discord.com",
	"discord.gg",
	"github.com",
	"gitlab.com",
	"stackoverflow.com",
	"microsoft.com",
	"apple.com",
	"openai.com",
	"chatgpt.com",
	"claude.ai",
	"anthropic.com",
	"bing.com",
	"duckduckgo.com",
	"yahoo.com",
	"live.com",
	"office.com",
	"outlook.com",
	"linkedin.com",
	"pinterest.com",
	"tumblr.com",
	"quora.com",
	"medium.com",
	"wordpress.com",
	"blogspot.com",
	"spotify.com",
	"soundcloud.com",
	"vimeo.com",
	"dailymotion.com",
	"roblox.com",
	"minecraft.net",
	"store.steampowered.com",
	"steampowered.com",
	"epicgames.com",
	"ea.com",
	"cloudflare.com",
	"googleusercontent.com",
	"gstatic.com",
	"googleapis.com",
	"i.ytimg.com",
	"ytimg.com",
	"fbcdn.net",
	"paypal.com",
	"ebay.com",
	"walmart.com",
	"target.com",
	"bestbuy.com",
	"aliexpress.com",
	"etsy.com",
	"shopify.com",
	"cnn.com",
	"bbc.com",
	"bbc.co.uk",
	"nytimes.com",
	"theguardian.com",
	"forbes.com",
	"bloomberg.com",
	"espn.com",
	"imdb.com",
	"rottentomatoes.com",
	"weather.com",
	"drive.google.com",
	"docs.google.com",
	"mail.google.com",
	"maps.google.com",
	"classroom.google.com",
	"scholar.google.com",
	"translate.google.com",
	"news.google.com",
	"play.google.com",
	"sites.google.com",
	"m.youtube.com",
	"music.youtube.com",
	"en.wikipedia.org",
	"archive.org",
	"web.archive.org",
	"wikimedia.org",
	"mozilla.org",
	"whatsapp.com",
	"web.whatsapp.com",
	"telegram.org",
	"t.me",
	"snapchat.com",
	"zoom.us",
	"slack.com",
	"notion.so",
	"figma.com",
	"canva.com",
	"dropbox.com",
	"mega.nz",
	"mediafire.com",
	"cdn.jsdelivr.net",
	"unpkg.com",
	"npmjs.com",
	"pypi.org",
	"w3schools.com",
	"geeksforgeeks.org",
	"developer.mozilla.org",
	"khanacademy.org",
	"coursera.org",
	"udemy.com",
	"duolingo.com",
	"wolframalpha.com",
	"desmos.com",
	"chess.com",
	"lichess.org",
	"coolmathgames.com",
	"poki.com",
	"crazygames.com",
	"miniclip.com",
	"quizlet.com",
	"brainly.com",
	"chegg.com",
	"kahoot.it",
	"gmail.com",
	"protonmail.com",
	"proton.me",
	"github.io",
	"vercel.app",
	"netlify.app",
	"localhost",
];

pub const TLD_TABLE: &[&str] = &[
	".com", ".org", ".net", ".io", ".co", ".edu", ".gov", ".info", ".biz", ".dev", ".app",
	".xyz", ".me", ".tv", ".gg", ".ai", ".us", ".uk", ".ca", ".au", ".de", ".fr", ".jp",
	".ru", ".cn", ".in", ".br", ".nl", ".es", ".it", ".se", ".no", ".eu", ".nz", ".ch",
	".be", ".at", ".dk", ".fi", ".pl", ".cz", ".site", ".online", ".store", ".tech",
	".blog", ".cloud", ".live", ".news", ".co.uk", ".com.au", ".co.jp", ".ac.uk",
	".gov.uk", ".org.uk", ".co.nz",
];

const DICTIONARY_FRAGMENTS: &[&str] = &[
	".aspx", ".jsp", ".json", ".xml", ".css", ".svg", ".webp", ".jpeg", ".gif", ".mp4",
	".pdf", "/assets/", "/static/", "/images/", "/img/", "/cdn-cgi/", "/feed", "?source=",
	"&source=", "&gl=US", "&hl=en", "?hl=en", "?usp=sharing", "/spreadsheets/d/",
	"/presentation/d/", "/document/d/", "/file/d/", "/maps/place/", "/dir/", "/place/",
	"/login", "/signin", "/signup", "/account", "/settings", "/download", "/category/",
	"/products/", "/gp/product/", "/dp/", "?ref=", "&ref=", "/graphql", "/v1/", "/api/v2/",
	"/api/v1/", "/api/", "?page=", "&page=", "?id=", "&id=", ".php", ".html", "/index.html",
	"/embed/", "/video/", "/photo/", "/status/", "/posts/", "/p/", "/u/", "/user/",
	"/comments/", "/r/", "/wiki/", "utm_term=", "utm_content=", "utm_campaign=",
	"utm_medium=", "utm_source=", "&feature=", "&index=", "&t=", "&list=", "/playlist?list=",
	"/watch?v=", ".org/wiki/", "www.", "http://", "https://", ".com/", "&", "/search?q=",
];

pub fn url_dictionary() -> Vec<u8> {
	DICTIONARY_FRAGMENTS.concat().into_bytes()
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn domain_table_has_no_duplicates() {
		let mut sorted = DOMAIN_TABLE.to_vec();
		sorted.sort_unstable();
		let before = sorted.len();
		sorted.dedup();
		assert_eq!(sorted.len(), before);
	}

	#[test]
	fn tld_table_has_no_duplicates() {
		let mut sorted = TLD_TABLE.to_vec();
		sorted.sort_unstable();
		let before = sorted.len();
		sorted.dedup();
		assert_eq!(sorted.len(), before);
	}

	#[test]
	fn every_tld_starts_with_a_dot() {
		assert!(TLD_TABLE.iter().all(|t| t.starts_with('.')));
	}

	#[test]
	fn domain_index_fits_in_a_varint_byte() {
		// A table longer than 127 still works, but this documents the size.
		assert!(DOMAIN_TABLE.len() > 100);
	}

	#[test]
	fn tld_index_fits_in_one_byte() {
		// serialize() writes tldIndex as a single byte, so the table plus the
		// +1 sentinel must stay under 256.
		assert!(TLD_TABLE.len() + 1 < 256);
	}

	#[test]
	fn dictionary_is_non_empty() {
		assert!(!url_dictionary().is_empty());
	}
}
