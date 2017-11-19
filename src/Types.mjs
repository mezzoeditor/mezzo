/**
 * @typedef {{
 *   lineNumber: number,
 *   columnNumber: number
 * }}
 */
TextPosition;

/**
 * @typedef {number}
 */
TextOffset;

/**
 * @typedef {{
 *   x: number,
 *   y: number
 * }}
 */
TextPoint;

/**
 * @typedef {{
 *   x: number,
 *   y: number
 * }}
 */
ViewportPoint;

/**
 * @typedef {{
 *   width: number,
 *   height: number
 * }}
 */
Size;

/**
 * @typedef {{
 *   x: number,
 *   y: number
 * }}
 */
Delta;

/**
 * @typedef {{
 *   origin: !TextPoint,
 *   size: !Size
 * }}
 */
TextRect;
