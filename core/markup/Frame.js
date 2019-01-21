import { Document } from '../text/Document.js';

export class FrameContent {
  /**
   * @param {Document} document
   */
  constructor(document) {
    /** @type {Document} */
    this.document = document;

    /**
     * The total range of frame contents.
     * @type {Mezzo.Range}
     */
    this.range = {from: 0, to: 0};

    /**
     * Continuous ranges of visible text in the frame.
     * @type {Array<VisibleRange>}
     */
    this.ranges = [];

    /**
     * Ranges with styles used to decorate the text.
     * @type {Array<Mezzo.RangeTree<string>>}
     */
    this.textDecorations = [];

    /**
     * Ranges with styles used to decorate the text background.
     * @type {Array<Mezzo.RangeTree<string>>}
     */
    this.backgroundDecorations = [];

    /**
     * Ranges with styles used to decorate the lines.
     * Note that ranges should be grouped by style for
     * efficient processing, as opposite to text/background.
     * @type {Array<{style: string, ranges: Mezzo.RangeTree<string>}>}
     */
    this.lineDecorations = [];
  }
};

/**
 * @typedef {{
 *   metrics: Mezzo.TextMetrics
 * }} Widget
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
   * @param {Document} document
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
 * @param {{content?: string, left?: number, right?: number}} cache
 * @param {number} left
 * @param {number} right
 * @return {string}
 */
function cachedContent(document, from, to, cache, left, right) {
  left = Math.min(left, from);
  right = Math.min(right, document.text().length() - to);
  if (cache.content === undefined || cache.left < left || cache.right < right) {
    cache.left = Math.max(left, cache.left || 0);
    cache.right = Math.max(right, cache.right || 0);
    cache.content = document.text().content(from - cache.left, to + cache.right);
  }
  return cache.content.substring(cache.left - left,
                                  cache.content.length - (cache.right - right));
}
