import { Decorator } from './Decorator.mjs';
import { Document } from './Document.mjs';
import { Frame } from './Frame.mjs';
import { RoundMode, Metrics } from './Metrics.mjs';
import { EventEmitter } from './EventEmitter.mjs';
import { Markup } from './Markup.mjs';

/**
 * Viewport class abstracts the window that peeks into document.
 * It supports padding around text to implement overscrolling and
 * requires Measurer to convert text into pixel metrics.
 *
 * Viewport operates two coordinate systems:
 *   - content points measured relative to text origin;
 *   - viewport points measured relative to viewport origin.
 *
 * Internally it has a tree of chunks which store metrics in
 * virtual cooridnate system, which is content coordinate system scaled by
 * measurer's |defaultWidth| and |lineHeight|. This makes common
 * case monospace metrics integer numbers.
 *
 * Viewport also provides canonical scrollbars.
 *
 *    +------------------+
 *    | Padding          |
 *    |   +------------+ |
 *    |   | Text       | |
 *    | +-+----------+ | |
 *    | | |          | | |
 *    | | | Viewport | | |
 *    | | |          | | |
 *    | +-+----------+ | |
 *    |   +------------+ |
 *    +------------------+
 */
export class Viewport extends EventEmitter {
  /**
   * @param {!Document} document
   * @param {!Markup} markup
   */
  constructor(document, markup) {
    super();
    this._document = document;

    this._width = 0;
    this._height = 0;
    this._scrollTop = 0;
    this._scrollLeft = 0;
    this._maxScrollTop = 0;
    this._maxScrollLeft = 0;
    this._padding = { left: 0, right: 0, top: 0, bottom: 0};

    this._markup = markup;
    this._markup.on(Markup.Events.Changed, () => {
      this._recompute();
    });
    this._recompute();
  }

  /**
   * @return {!Document}
   */
  document() {
    return this._document;
  }

  /**
   * @return {number}
   */
  lineHeight() {
    return this._markup.lineHeight();
  }

  /**
   * @return {number}
   */
  width() {
    return this._width;
  }

  /**
   * @return {number}
   */
  height() {
    return this._height;
  }

  /**
   * @return {number}
   */
  scrollLeft() {
    return this._scrollLeft;
  }

  /**
   * @return {number}
   */
  scrollTop() {
    return this._scrollTop;
  }

  /**
   * @return {number}
   */
  maxScrollLeft() {
    return this._maxScrollLeft;
  }

  /**
   * @return {number}
   */
  maxScrollTop() {
    return this._maxScrollTop;
  }

  /**
   * @param {number} width
   * @param {number} height
   */
  setSize(width, height) {
    this._width = width;
    this._height = height;
    this._recompute();
  }

  /**
   * @param {number} scrollTopDelta
   * @param {number} scrollLeftDelta
   */
  advanceScroll(scrollTopDelta, scrollLeftDelta) {
    this._scrollTop += scrollTopDelta;
    this._scrollLeft += scrollLeftDelta;
    this._recompute();
  }

  /**
   * @param {number} scrollLeft
   */
  setScrollLeft(scrollLeft) {
    this._scrollLeft = scrollLeft;
    this._recompute();
  }

  /**
   * @param {number} scrollTop
   */
  setScrollTop(scrollTop) {
    this._scrollTop = scrollTop;
    this._recompute();
  }

  /**
   * @param {!{left: number, right: number, top: number, bottom: number}} padding
   */
  setPadding(padding) {
    this._padding = Object.assign({
      left: 0,
      right: 0,
      top: 0,
      bottom: 0
    }, padding);
    this._recompute();
  }

  /**
   * @return {number}
   */
  contentWidth() {
    return this._markup.contentWidth();
  }

  /**
   * @return {number}
   */
  contentHeight() {
    return this._markup.contentHeight();
  }

  /**
   * @param {!Point} point
   * @param {RoundMode} roundMode
   * @param {boolean} strict
   * @return {number}
   */
  viewportPointToOffset(point, roundMode = RoundMode.Floor, strict = false) {
    return this._markup.pointToOffset({
      x: point.x + this._scrollLeft - this._padding.left,
      y: point.y + this._scrollTop - this._padding.top
    }, roundMode, strict);
  }

  /**
   * @param {number} offset
   * @return {?Point}
   */
  offsetToViewportPoint(offset) {
    let point = this._markup.offsetToPoint(offset);
    return point === null ? null : {
      x: point.x - this._scrollLeft + this._padding.left,
      y: point.y - this._scrollTop + this._padding.top
    };
  }

  /**
   * @param {!Array<DecorationCallback>} decorationCallbacks
   * @return {!Frame}
   */
  decorate(decorationCallbacks) {
    const frame = new Frame();
    frame.translateLeft = -this._scrollLeft + this._padding.left;
    frame.translateTop = -this._scrollTop + this._padding.top;

    frame.lineLeft = this._scrollLeft - Math.min(this._scrollLeft, this._padding.left);
    frame.lineRight = this._scrollLeft - this._padding.left + this._width
        + Math.min(this._maxScrollLeft - this._scrollLeft - this._padding.right, 0);

    const contentRect = {
      left: this._scrollLeft - this._padding.left,
      top: this._scrollTop - this._padding.top,
      width: this._width,
      height: this._height
    };
    const scrollbar = {
      ratio: this._height / (this._maxScrollTop + this._height),
      minDecorationHeight: kMinScrollbarDecorationHeight
    }
    this._markup.buildFrame(frame, contentRect, scrollbar, decorationCallbacks);

    return frame;
  }

  _recompute() {
    this._maxScrollTop = Math.max(0, this._markup.contentHeight() - this._height + this._padding.top + this._padding.bottom);
    this._maxScrollLeft = Math.max(0, this._markup.contentWidth() - this._width + this._padding.left + this._padding.right);
    this._scrollLeft = Math.max(this._scrollLeft, 0);
    this._scrollLeft = Math.min(this._scrollLeft, this._maxScrollLeft);
    this._scrollTop = Math.max(this._scrollTop, 0);
    this._scrollTop = Math.min(this._scrollTop, this._maxScrollTop);
    this.emit(Viewport.Events.Changed);
  }
}

Viewport.Events = {
  Changed: 'changed',
};

let kMinScrollbarDecorationHeight = 5;

Viewport.test = {};

Viewport.test.setMinScrollbarDecorationHeight = function(value) {
  const result = kMinScrollbarDecorationHeight;
  kMinScrollbarDecorationHeight = value;
  return result;
};
