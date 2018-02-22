export let Unicode = {};

Unicode.bmpRegex = /^[\u{0000}-\u{d7ff}]*$/u;
Unicode.asciiRegex = /^[\u{0020}-\u{007e}]*$/u;
Unicode.whitespaceRegex = /\s/u;

/**
 * Measurer converts code points to widths (and default height).
 * It is designed to work exclusively with an additive metric.
 *
 * @interface
 */
Unicode.Measurer = class {
  constructor() {
    /**
     * The default width of a code point. Note that code points from Supplementary Planes
     * cannot be given default width.
     * Total width of a |string| with all default width code points will be
     * |string.length * measurer.defaultWidth|.
     */
    this.defaultWidth = 1;

    /**
     * The default height of a code point. Note that we only support fixed height,
     * so any code point height equals to default.
     */
    this.defaultHeight = 1;
  }

  /**
   * Returns the total width of a substring. It is guaranteed that string does not
   * contain line breaks.
   * Return zero when measured width is equal to |defaultWidth * (to - from)|
   * to save some memory and computation.
   * @param {string} chunk
   * @return {number}
   */
  measureString(s, from, to) {
  }

  /**
   * Returns the width of a single code point from the Unicode Basic Multilingual Plane.
   * This method should not return zero even for default width.
   * Note that |codePoint| is always less than 0x10000.
   * @param {number} codePoint
   * @return {number}
   */
  measureBMPCodePoint(codePoint) {
  }

  /**
   * Returns the width of a single code point from a Supplemetary Plane.
   * This method should not return zero even for default width.
   * Note that |codePoint| is always greater or equal than 0x10000.
   * @param {number} codePoint
   * @return {number}
   */
  measureSupplementaryCodePoint(codePoint) {
  }
};

/**
 * Returns whether a specific offset does not split a surrogate pair.
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
 * Returns the number of columns (code points) in a given substring.
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
 * Returns an offset for a particular column (code point) in a given substring.
 * Returned offset belongs to [from, to]. If there is not enough columns,
 * offset is |-1| instead, and |column| is the total number of columns (code points)
 * in the given substring.
 * @param {string} s
 * @param {number} from
 * @param {number} to
 * @param {number} column
 * @return {{offset: number, column: number}}
 */
Unicode.columnToOffset = function(s, from, to, column) {
  if (!column)
    return {offset: from, column};
  if (Unicode.bmpRegex.test(s)) {
    if (column > to - from)
      return {offset: -1, column: to - from};
    return {offset: from + column, column};
  }
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
