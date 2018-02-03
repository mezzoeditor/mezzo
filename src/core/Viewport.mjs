import {Frame} from './Frame.mjs';

/**
 * Viewport class abstracts the window that peeks onto a part of the
 * document. Viewport supports padding around text to implement overscrolling.
 *
 *          +--------------------------------------+
 *          |                                      |
 *          |  Padding                             |
 *          |                                      |
 *          |    +------------------------------+  |
 *          |    |                              |  |
 *          |    |   Text                       |  |
 *          |    |                              |  |
 *          |    |      +------------------+    |  |
 *          |    |      |                  |    |  |
 *          |    |      |  Viewport        |    |  |
 *          |    |      |                  |    |  |
 *          |    |      +------------------+    |  |
 *          |    |                              |  |
 *          |    +------------------------------+  |
 *          |                                      |
 *          +--------------------------------------+
 *
 * Viewport class operates "units" and should be supplied with font metrics to do
 * text <-> units conversion.
 *
 * Viewport class operates 3 coordinate systems:
 * - "content" coordinate system holds all the content that is viewported: text and its padding.
 *   Measured in "units".
 * - "viewport" coordinate system is the position of the viewport, measured in "units".
 * - "text" coordinate system is the positions of text, measured in lines/columns.
 *
 * Viewport provides canonical scrollbars.
 */
export class Viewport {
  /**
   * @param {!Documnet} document
   * @param {number} fontLineHeight
   * @param {number} fontCharWidth
   */
  constructor(document, fontLineHeight, fontCharWidth) {
    this._document = document;
    this._metrics = {lineHeight: fontLineHeight, charWidth: fontCharWidth};
    this._width = 0;
    this._height = 0;
    this._scrollTop = 0;
    this._scrollLeft = 0;
    this._maxScrollTop = 0;
    this._maxScrollLeft = 0;
    this._padding = { left: 0, right: 0, top: 0, bottom: 0};

    this.hScrollbar = new Scrollbar(offset => this.setScrollLeft(offset));
    this.vScrollbar = new Scrollbar(offset => this.setScrollTop(offset));

    this._invalidateCallback = () => {};
    this._revealCallback = () => {};
  }

  /**
   * @param {function()} invalidateCallback
   */
  setInvalidateCallback(invalidateCallback) {
    this._invalidateCallback = invalidateCallback;
  }

  /**
   * @param {function()} invalidateCallback
   */
  setRevealCallback(revealCallback) {
    this._revealCallback = revealCallback;
  }

  invalidate() {
    this._invalidateCallback.call(null);
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
   * @param {number} scrollTopDelta
   * @param {number} scrollLeftDelta
   */
  advanceScroll(scrollTopDelta, scrollLeftDelta) {
    this._scrollTop += scrollTopDelta;
    this._scrollLeft += scrollLeftDelta;
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
   * @param {!{x: number, y: number}} position
   * @return {!{line: number, column: number}}
   */
  contentPositionToTextPosition({x, y}) {
    y -= this._padding.top;
    x -= this._padding.left;
    return {
      line: Math.max(Math.floor(y / this._metrics.lineHeight), 0),
      column: Math.max(Math.floor(x / this._metrics.charWidth), 0)
    };
  }

  /**
   * @param {!{x: number, y: number}} position
   * @return {!{x: number, y: number}}
   */
  contentPositionToViewportPosition({x, y}) {
    x -= this._scrollLeft;
    y -= this._scrollTop;
    return {x, y};
  }

  /**
   * @param {!{x: number, y: number}} position
   * @return {!{line: number, column: number}}
   */
  viewportPositionToTextPosition({x, y}) {
    x += this._scrollLeft - this._padding.left;
    y += this._scrollTop - this._padding.top;
    return {
      line: Math.max(Math.floor(y / this._metrics.lineHeight), 0),
      column: Math.max(Math.floor(x / this._metrics.charWidth), 0),
    };
  }

  /**
   * @param {!{x: number, y: number}} position
   * @return {!{x: number, y: number}}
   */
  viewportPositionToContentPosition({x, y}) {
    x += this._scrollLeft;
    y += this._scrollTop;
    return {x, y};
  }

  /**
   * @param {!{line: number, column: number}} position
   * @return {!{x: number, y: number}}
   */
  textPositionToViewportPosition({line, column}) {
    return {
      x: column * this._metrics.charWidth + this._padding.left - this._scrollLeft,
      y: line * this._metrics.lineHeight + this._padding.top - this._scrollTop,
    };
  }

  /**
   * @param {!{line: number, column: number}} position
   * @return {!{x: number, y: number}}
   */
  textPositionToContentPosition({line, column}) {
    return {
      x: column * this._metrics.charWidth + this._padding.left,
      y: line * this._metrics.lineHeight + this._padding.top,
    };
  }

  /**
   * @param {number} offset
   */
  reveal(offset) {
    if (this._document._frozen)
      throw 'Cannot reveal while building frame';

    let {line, column} = this._document.offsetToPosition(offset);
    let scrollTop = line * this._metrics.lineHeight + this._padding.top;
    if (scrollTop < this._scrollTop) {
      this._scrollTop = scrollTop;
    } else if (scrollTop + this._metrics.lineHeight > this._scrollTop + this._height) {
      this._scrollTop = scrollTop + this._metrics.lineHeight - this._height;
    }
    let scrollLeft = column * this._metrics.charWidth + this._padding.left;
    if (scrollLeft < this._scrollLeft) {
      this._scrollLeft = scrollLeft;
    } else if (scrollLeft + this._metrics.charWidth > this._scrollLeft + this._width) {
      this._scrollLeft = scrollLeft + this._metrics.charWidth - this._width;
    }
    this._recompute();
    this._revealCallback.call(null);
  }

  /**
   * @return {!{frame: !Frame, decorators: !Array<!Decorator>}}
   */
  createFrame() {
    this._document.beforeFrame();
    const start = this.viewportPositionToTextPosition({x: 0, y: 0});
    const end = this.viewportPositionToTextPosition({x: this._width + this._metrics.charWidth, y: this._height + this._metrics.lineHeight});
    const frame = new Frame(this._document, start, end.column - start.column, end.line - start.line);
    const decorators = this._document.decorateFrame(frame);
    return {frame, decorators};
  }

  _recompute() {
    // To properly handle input events, we have to update rects synchronously.
    const lineCount = this._document.lineCount();

    this._maxScrollTop = Math.max(0, lineCount * this._metrics.lineHeight - this._height + this._padding.top + this._padding.bottom);
    this._maxScrollLeft = Math.max(0, this._document.longestLineLength() * this._metrics.charWidth - this._width + this._padding.left + this._padding.right);

    this._scrollLeft = Math.max(this._scrollLeft, 0);
    this._scrollLeft = Math.min(this._scrollLeft, this._maxScrollLeft);
    this._scrollTop = Math.max(this._scrollTop, 0);
    this._scrollTop = Math.min(this._scrollTop, this._maxScrollTop);

    this.vScrollbar._setViewportMetrics(this._scrollTop, this._maxScrollTop, this._height);
    this.hScrollbar._setViewportMetrics(this._scrollLeft, this._maxScrollLeft, this._width);
  }
}

class Scrollbar {
  /**
   * @param {function(number)} scrollCallback
   */
  constructor(scrollCallback) {
    this._size = 0;
    this._thumbOffset = 0;
    this._thumbSize = 0;

    this._viewportMaxScroll = 0;
    this._viewportScroll = 0;
    this._viewportSize = 0;
    this._scrollCallback = scrollCallback;
  }

  /**
   * @return {boolean}
   */
  isScrollable() {
    return this._viewportMaxScroll > 0;
  }

  /**
   * @return {number}
   */
  thumbSize() {
    return this._thumbSize;
  }

  /**
   * @return {number}
   */
  thumbOffset() {
    return this._thumbOffset;
  }

  /**
   * @param {number} offset
   */
  setThumbOffset(offset) {
    let contentOffset = (this._viewportMaxScroll + this._viewportSize) * offset / this._size;
    this._scrollCallback.call(null, contentOffset);
  }

  /**
   * @return {number}
   */
  size() {
    return this._size;
  }

  /**
   * @param {number} size
   */
  setSize(size) {
    this._size = size;
    this._recompute();
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  contentOffsetToScrollbarOffset(offset) {
    return this._size * offset / (this._viewportMaxScroll + this._viewportSize);
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  scrollbarOffsetToContentOffset(offset) {
    return offset * (this._viewportMaxScroll + this._viewportSize) / this._size;
  }

  /**
   * @param {number} viewportScroll
   * @param {number} viewportMaxScroll
   * @param {number} viewportSize
   */
  _setViewportMetrics(viewportScroll, viewportMaxScroll, viewportSize) {
    this._viewportMaxScroll = viewportMaxScroll;
    this._viewportScroll = viewportScroll;
    this._viewportSize = viewportSize;
    this._recompute();
  }

  _recompute() {
    let ratio = this._viewportSize / (this._viewportMaxScroll + this._viewportSize);
    this._thumbSize = this._size * ratio;
    this._thumbOffset = this.contentOffsetToScrollbarOffset(this._viewportScroll);
  }
}
