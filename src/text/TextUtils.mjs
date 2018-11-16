export const TextUtils = {};

TextUtils.bmpRegex = /^[\u{0000}-\u{d7ff}]*$/u;
TextUtils.asciiRegex = /^[\u{0020}-\u{007e}]*$/u;
TextUtils.asciiRegexWithNewLines = /^[\n\u{0020}-\u{007e}]*$/u;
TextUtils.whitespaceRegex = /\s/u;
TextUtils.nonWordCharacterRegex = /^\W$/u;
TextUtils.lineBreakCharCode = '\n'.charCodeAt(0);

/**
 * Returns whether a specific offset does not split a surrogate pair.
 * @param {string} s
 * @param {number} offset
 * @return {boolean}
 */
TextUtils.isValidOffset = function(s, offset) {
  if (offset <= 0 || offset >= s.length)
    return true;
  const codeUnit = s.charCodeAt(offset - 1);
  return codeUnit < 0xD800 || codeUnit > 0xDBFF;
};

/**
 * Returns  whether a specific code point is RTL.
 *
 * @param {number} codePoint
 * @return {boolean}
 */
TextUtils.isRtlCodePoint = function(codePoint) {
  return (codePoint >= 0x0590 && codePoint <= 0x089F) ||
      (codePoint === 0x200F) ||
      (codePoint >= 0xFB1D && codePoint <= 0xFDFF) ||
      (codePoint >= 0xFE70 && codePoint <= 0xFEFF) ||
      (codePoint >= 0x10800 && codePoint <= 0x10FFF) ||
      (codePoint >= 0x1E800 && codePoint <= 0x1EFFF);
};

/**
 * Returns whether a specific code unit is a surrogate.
 *
 * @param {number} codeUnit
 * @return {boolean}
 */
TextUtils.isSurrogate = function(codeUnit) {
  return codeUnit >= 0xD800 && codeUnit <= 0xDBFF;
};
