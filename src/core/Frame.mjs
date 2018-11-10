import { Document } from './Document.mjs';

/**
 * @typedef {{
 *   text: !Array<!TextDecorator>|undefined,
 *   background: !Array<!TextDecorator>|undefined,
 *   lines: !Array<!LineDecorator>|undefined
 * }} DecorationResult
 */

/**
 * @typedef {{
 *   document: !Document,
 *   range: !Range,
 *   ranges: !Array<!VisibleRange>
 * }} VisibleContent
 */

 /**
 * @typedef {function(!VisibleContent):?DecorationResult} DecorationCallback
 */

export class Frame {
  constructor() {
    /**
     * These are the X-coordinates of left-most and right-most visible
     * points of any line.
     */
    this.lineLeft = 0;
    this.lineRight = 0;

    this.lineHeight = 0;

    /** @type {!Array<{x: number, y: number, content: string, style: string}>} */
    this.text = [];
    /** @type {!Array<{x: number, y: number, width: number, style: string}>} */
    this.background = [];
    /** @type {!Array<{x: number, y: number, widget: !Widget}>} */
    this.widgets = [];
    /** @type {!Array<{y: number, height: number, style: string}>} */
    this.scrollbar = [];
    /** @type {!Array<{first: number, last: number, y: number, styles: !Array<string>}>} */
    this.lines = [];
  }
};

export class VisibleRange {
  /**
   * @param {!Document} document
   * @param {number} from
   * @param {number} to
   */
  constructor(document, from, to) {
    this._document = document;
    this.from = from;
    this.to = to;
  }

  /**
   * @param {number=} paddingLeft
   * @param {number=} paddingRight
   * @return {string}
   */
  content(paddingLeft = 0, paddingRight = 0) {
    if (!this._cache)
      this._cache = {};
    return cachedContent(this._document, this.from, this.to, this._cache, paddingLeft, paddingRight);
  }
};

/**
 * @param {!Document} document
 * @param {number} from
 * @param {number} to
 * @param {{content: string, left: number, right: number}} cache
 * @param {number} left
 * @param {number} right
 * @return {string}
 */
function cachedContent(document, from, to, cache, left, right) {
  left = Math.min(left, from);
  right = Math.min(right, document.text().length() - to);
  if (cache._content === undefined || cache._left < left || cache._right < right) {
    cache._left = Math.max(left, cache._left || 0);
    cache._right = Math.max(right, cache._right || 0);
    cache._content = document.text().content(from - cache._left, to + cache._right);
  }
  return cache._content.substring(cache._left - left,
                                  cache._content.length - (cache._right - right));
}
