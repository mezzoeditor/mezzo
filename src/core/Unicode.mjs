export let Unicode = {};

Unicode.bmpRegex = /^[\u{0000}-\u{d7ff}]*$/u;
Unicode.asciiRegex = /^[\u{0020}-\u{007e}]*$/u;
Unicode.whitespaceRegex = /\s/u;

/**
 * @param {string} s
 * @param {number} offset
 * @return {boolean}
 */
Unicode.isValidOffset = function(s, offset) {
  if (offset <= 0 || offset >= s.length)
    return true;
  let charCode = s.charCodeAt(offset - 1);
  return charCode < 0xD800 || charCode > 0xDBFF;
};

/**
 * @param {string} s
 * @param {number} from
 * @param {number} to
 * @return {number}
 */
Unicode.columnCount = function(s, from, to) {
  if (Unicode.bmpRegex.test(s))
    return to - from;
  let result = 0;
  for (let i = from; i < to; ) {
    let charCode = s.charCodeAt(i);
    if (charCode >= 0xD800 && charCode <= 0xDBFF && i + 1 < to) {
      result++;
      i += 2;
    } else {
      result++;
      i++;
    }
  }
  return result;
};

/**
 * @param {string} s
 * @param {number} from
 * @param {number} to
 * @param {number} index
 * @return {{offset: number, column: number}}
 */
Unicode.columnToOffset = function(s, from, to, column) {
  if (!column)
    return {offset: from, column};
  if (Unicode.bmpRegex.test(s))
    return {offset: from + column, column};
  let totalColumns = 0;
  for (let offset = from; offset < to; ) {
    let charCode = s.charCodeAt(offset);
    if (charCode >= 0xD800 && charCode <= 0xDBFF && offset + 1 < to) {
      totalColumns++;
      offset += 2;
    } else {
      totalColumns++;
      offset++;
    }
    if (totalColumns === column)
      return {offset, column};
  }
  return {offset: -1, column: totalColumns};
};
