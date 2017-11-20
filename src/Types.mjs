/**
 * @typedef {{
 *   lineNumber: number,
 *   columnNumber: number
 * }} TextPosition;
 */

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

/**
 * @param {!TextPosition} a
 * @param {!TextPosition} b
 * @return {number}
 */
export function compareTextPositions(a, b) {
  return (a.lineNumber - b.lineNumber) || (a.columnNumber - b.columnNumber);
}
