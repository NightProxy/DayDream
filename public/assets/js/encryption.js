class crypts {
  encode(str) {
    return encodeURIComponent(
      str
        .toString()
        .split("")
        .map((char, ind) =>
          ind % 2 ? String.fromCharCode(char.charCodeAt() ^ 2) : char,
        )
        .join(""),
    );
  }

  decode(str) {
    try {
      if (str.charAt(str.length - 1) === "/") {
        str = str.slice(0, -1);
      }
      return decodeURIComponent(
        str
          .split("")
          .map((char, ind) =>
            ind % 2 ? String.fromCharCode(char.charCodeAt() ^ 2) : char,
          )
          .join(""),
      );
    } catch (e) {
      console.error("Error decoding URI component:", e);
      return null;
    }
  }
}
