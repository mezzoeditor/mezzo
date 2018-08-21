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
   * @param {!Measurer} measurer
   */
  constructor(document, measurer) {
    super();
    this._document = document;

    this._width = 0;
    this._height = 0;
    this._contentWidth = 0;
    this._contentHeight = 0;
    this._scrollTop = 0;
    this._scrollLeft = 0;
    this._maxScrollTop = 0;
    this._maxScrollLeft = 0;
    this._padding = { left: 0, right: 0, top: 0, bottom: 0};
    this._frozen = false;
    this._decorateCallbacks = [];

    this._markup = new Markup(measurer, this._document);
    this._markup.on(Markup.Events.Changed, (contentWidth, contentHeight) => {
      this._contentWidth = contentWidth;
      this._contentHeight = contentHeight;
      this._recompute();
    });
    this._recompute();
  }

  raf() {
    this.emit(Viewport.Events.Raf);
  }

  /**
   * @return {!Document}
   */
  document() {
    return this._document;
  }

  /**
   * @param {!Measurer} measurer
   */
  setMeasurer(measurer) {
    this._markup.setMeasurer(measurer);
  }

  /**
   * @return {number}
   */
  lineHeight() {
    return this._markup.lineHeight();
  }

  /**
   * @param {DecorationCallback} callback
   */
  addDecorationCallback(callback) {
    this._decorateCallbacks.push(callback);
    this.raf();
  }

  /**
   * @param {DecorationCallback} callback
   */
  removeDecorationCallback(callback) {
    let index = this._decorateCallbacks.indexOf(callback);
    if (index !== -1)
      this._decorateCallbacks.splice(index, 1);
    this.raf();
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
    return this._contentWidth;
  }

  /**
   * @return {number}
   */
  contentHeight() {
    return this._contentHeight;
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
   * @param {!Point} point
   * @param {RoundMode} roundMode
   * @param {boolean} strict
   * @return {number}
   */
  contentPointToOffset(point, roundMode = RoundMode.Floor, strict = false) {
    return this._markup.pointToOffset(point, roundMode, strict);
  }

  /**
   * @param {number} offset
   * @return {?Point}
   */
  offsetToContentPoint(offset) {
    return this._markup.offsetToPoint(offset);
  }

  /**
   * @param {!Range} range
   * @param {!{left: number, right: number, top: number, bottom: number}=} rangePadding
   */
  reveal(range, rangePadding) {
    if (this._frozen)
      throw new Error('Cannot reveal while decorating');

    rangePadding = Object.assign({
      left: 10,
      right: 10,
      top: 0,
      bottom: 0
    }, rangePadding);

    let from = this.offsetToViewportPoint(range.from);
    from.x += this._scrollLeft;
    from.y += this._scrollTop;
    let to = this.offsetToViewportPoint(range.to);
    to.x += this._scrollLeft;
    to.y += this._scrollTop + this.lineHeight();

    if (this._scrollTop > from.y) {
      this._scrollTop = Math.max(from.y - rangePadding.top, 0);
    } else if (this._scrollTop + this._height < to.y) {
      this._scrollTop = Math.min(to.y - this._height + rangePadding.bottom, this._maxScrollTop);
    }
    if (this._scrollLeft > from.x) {
      this._scrollLeft = Math.max(from.x - rangePadding.left, 0);
    } else if (this._scrollLeft + this._width < to.x) {
      this._scrollLeft = Math.min(to.x - this._width + rangePadding.right, this._maxScrollLeft);
    }
    this._recompute();
  }

  /**
   * @return {!Frame}
   */
  decorate() {
    this._frozen = true;
    const frame = new Frame();
    const paddingLeft = Math.max(this._padding.left - this._scrollLeft, 0);
    const paddingTop = Math.max(this._padding.top - this._scrollTop, 0);

    frame.translateLeft = -this._scrollLeft + paddingLeft;
    frame.translateTop = -this._scrollTop + paddingTop;

    frame.lineLeft = this._scrollLeft;
    const paddingRight = Math.max(this._padding.right - (this._maxScrollLeft - this._scrollLeft), 0);
    frame.lineRight = Math.max(0, this._width - paddingRight - paddingLeft) + this._scrollLeft;

    const contentRect = {
      left: this._scrollLeft - paddingLeft,
      top: this._scrollTop - paddingTop,
      width: this._width,
      height: this._height
    };
    const scrollbar = {
      ratio: this._height / (this._maxScrollTop + this._height),
      minDecorationHeight: kMinScrollbarDecorationHeight
    }
    this._markup.buildFrame(frame, contentRect, scrollbar, this._decorateCallbacks);

    this._frozen = false;
    return frame;
  }

  _recompute() {
    this._maxScrollTop = Math.max(0, this._contentHeight - this._height + this._padding.top + this._padding.bottom);
    this._maxScrollLeft = Math.max(0, this._contentWidth - this._width + this._padding.left + this._padding.right);
    this._scrollLeft = Math.max(this._scrollLeft, 0);
    this._scrollLeft = Math.min(this._scrollLeft, this._maxScrollLeft);
    this._scrollTop = Math.max(this._scrollTop, 0);
    this._scrollTop = Math.min(this._scrollTop, this._maxScrollTop);
    this.emit(Viewport.Events.Changed);
  }
}

Viewport.Events = {
  Raf: 'raf',
  Changed: 'changed',
};

let kMinScrollbarDecorationHeight = 5;

Viewport.test = {};

/**
 * @param {!Viewport} viewport
 * @param {number} chunkSize
 */
Viewport.test.rechunk = function(viewport, chunkSize) {
  Markup.test.rechunk(viewport._markup, chunkSize);
};

Viewport.test.setMinScrollbarDecorationHeight = function(value) {
  const result = kMinScrollbarDecorationHeight;
  kMinScrollbarDecorationHeight = value;
  return result;
};
