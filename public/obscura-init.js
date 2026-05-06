(() => {
	const encodeUrl = function encode(str) {
		if (!str) return str;
		return encodeURIComponent(
			str
				.toString()
				.split('')
				.map((char, ind) =>
					ind % 2 ? String.fromCharCode(char.charCodeAt() ^ 3) : char
				)
				.join('')
		);
	};

	const decodeUrl = function decode(str) {
		if (!str) return str;
		let [input, ...search] = str.split('?');

		return (
			decodeURIComponent(input)
				.split('')
				.map((char, ind) =>
					ind % 2 ? String.fromCharCode(char.charCodeAt(0) ^ 3) : char
				)
				.join('') + (search.length ? '?' + search.join('?') : '')
		);
	};

	self.__obscura = {
		encode: encodeUrl,
		decode: decodeUrl
	};

	if (self.__scramjet$config) {
		self.__scramjet$config.codec = {
			encode: encodeUrl,
			decode: decodeUrl
		};
	}
})();
