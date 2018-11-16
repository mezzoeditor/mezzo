/**
 * @typedef {number} Offset
 * The zero-based offset of a code unit inside a string.
 *
 *
 * @typedef {{line: number, column: number}} Position
 * A 2-dimensional position in a text. Both dimensions zero-based.
 * Note that column measures code points, not code units.
 *
 *
 * @typedef {{
 *   offset: number|undefined,
 *   x: number|undefined,
 *   y: number|undefined,
 * }} TextLookupKey
 * A key used to lookup in a tree - either by |offset|, or by |x| and |y|.
 *
 *
 * @typedef {{
 *   length: number,
 *   lineBreaks: number|undefined,
 *   firstWidth: number,
 *   lastWidth: number,
 *   longestWidth: number,
 * }} TextMetrics
 *
 * Represents metrics of a text chunk. This can be used
 * not only for text, but for any entities interleaving with text.
 *   - |length| is a total number of UTF-16 code units.
 *   - |lineBreaks| is a total number of line break characters (\n).
 *   - |firstWidth| is a number of code points in the first line.
 *   - |lastWidth| is a number of code points in the last line.
 *   - |longestWidth| is a number of code points in the longest line.
 * Note that we only support fixed height equal to one.
 */


/**
 * @implements OrderedMonoid<TextMetrics, TextLookupKey>
 */
export class TextMetricsMonoid {
  /**
   * @override
   * @return {TextMetrics}
   */
  identityValue() {
    return {length: 0, firstWidth: 0, lastWidth: 0, longestWidth: 0};
  }

  /**
   * @override
   * @param {TextMetrics} a
   * @param {TextMetrics} b
   * @return {TextMetrics}
   */
  combineValues(a, b) {
    const result = {
      longestWidth: Math.max(Math.max(a.longestWidth, a.lastWidth + b.firstWidth), b.longestWidth),
      firstWidth: a.firstWidth + (a.lineBreaks ? 0 : b.firstWidth),
      lastWidth: b.lastWidth + (b.lineBreaks ? 0 : a.lastWidth),
      length: a.length + b.length
    }
    if (a.lineBreaks || b.lineBreaks)
      result.lineBreaks = (a.lineBreaks || 0) + (b.lineBreaks || 0);
    return result;
  }

  /**
   * @override
   * @param {TextMetrics} e
   * @param {TextLookupKey} k
   * @return {boolean}
   */
  valueGreaterThanKey(e, k) {
    if (k.offset !== undefined)
      return e.length > k.offset;
    const line = e.lineBreaks || 0;
    return line > k.y || (line + 1 > k.y && e.lastWidth > k.x);
  }

  /**
   * @override
   * @param {TextMetrics} e
   * @param {TextLookupKey} k
   * @return {boolean}
   */
  valueGreaterOrEqualThanKey(e, k) {
    if (k.offset !== undefined)
      return e.length >= k.offset;
    const line = e.lineBreaks || 0;
    return line > k.y || (line + 1 > k.y && e.lastWidth >= k.x);
  }
};
