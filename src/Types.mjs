/**
 * @typedef {{
 *   lineNumber: number,
 *   columnNumber: number
 * }} TextPosition;
 */
export let TextPosition = {};

/**
 * @param {!TextPosition} a
 * @param {!TextPosition} b
 * @return {number}
 */
TextPosition.compare = function(a, b) {
  return (a.lineNumber - b.lineNumber) || (a.columnNumber - b.columnNumber);
};

/**
 * @param {!TextPosition} a
 * @param {!TextPosition} b
 * @return {!TextPosition}
 */
TextPosition.larger = function(a, b) {
  return TextPosition.compare(a, b) >= 0 ? a : b;
};

/**
 * @param {!TextPosition} a
 * @param {!TextPosition} b
 * @return {!TextPosition}
 */
TextPosition.smaller = function(a, b) {
  return TextPosition.compare(a, b) >= 0 ? b : a;
};

/**
 * @typedef {number} TextOffset;
 */

/**
 * @typedef {{
 *   lineDelta: number,
 *   columnDelta: number,
 *   startLine: number,
 *   startColumn: number
 * }} TextDelta;
 */

/**
 * @typedef {{
 *   from: !TextPosition,
 *   to: !TextPosition
 * }} TextRange;
 */
export let TextRange = {};

/**
 * @param {!TextRange} a
 * @param {!TextRange} b
 * @return {number}
 */
TextRange.compare = function(a, b) {
  return TextPosition.compare(a.from, b.from) || TextPosition.compare(a.to, b.to);
};

/**
 * @param {!TextRange} a
 * @param {!TextRange} b
 * @return {?TextRange}
 */
TextRange.join = function(a, b) {
  return {from: TextPosition.smaller(a.from, b.from), to: TextPosition.larger(a.to, b.to)};
};

/**
 * @param {!TextRange} r
 * @return {boolean}
 */
TextRange.isEmpty = function(r) {
  return TextPosition.compare(r.from, r.to) === 0;
};

/**
 * @param {!TextRange} a
 * @param {!TextRange} b
 * @return {boolean}
 */
TextRange.intersects = function(a, b) {
  return !(TextPosition.compare(a.from, b.to) > 0 || TextPosition.compare(b.from, a.to) > 0);
};

/**
 * @typedef {{
 *   x: number,
 *   y: number
 * }} TextPoint;
 */

/**
 * @typedef {{
 *   x: number,
 *   y: number
 * }} ViewportPoint;
 */

/**
 * @typedef {{
 *   width: number,
 *   height: number
 * }} Size;
 */

/**
 * @typedef {{
 *   x: number,
 *   y: number
 * }} Delta;
 */

/**
 * @typedef {{
 *   origin: !TextPoint,
 *   size: !Size
 * }} TextRect;
 */
