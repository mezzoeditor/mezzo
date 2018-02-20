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
 * Viewport class operates 3 coordinate systems:
 * - viewport points, this is measured relative to viewport origin;
 * - view points, this is measured relative to padding origin, includes padding and text;
 * - document locations, this is measured relative to document origin.
 *
 * Viewport provides canonical scrollbars.
 */
export class Viewport {
  /**
   * @param {!Documnet} document
   */
  constructor(document) {
    this._document = document;
    this._width = 0;
    this._height = 0;
    this._scrollTop = 0;
    this._scrollLeft = 0;
    this._maxScrollTop = 0;
    this._maxScrollLeft = 0;
    this._padding = { left: 0, right: 0, top: 0, bottom: 0};
    this._frozen = false;

    this.hScrollbar = new Scrollbar(offset => this.setScrollLeft(offset));
    this.vScrollbar = new Scrollbar(offset => this.setScrollTop(offset));

    this._invalidateCallback = () => {};
    this._revealCallback = () => {};
  }

  /**
   * @return {!Document}
   */
  document() {
    return this._document;
  }

  /**
   * @param {function()} invalidateCallback
   */
  setInvalidateCallback(invalidateCallback) {
    this._invalidateCallback = invalidateCallback;
  }

  /**
   * @param {function()} revealCallback
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
   * @param {!Point} point
   * @return {!Point}
   */
  viewPointToDocumentPoint(point) {
    return {x: point.x - this._padding.left, y: point.y - this._padding.top};
  }

  /**
   * @param {!Point} point
   * @return {!Point}
   */
  documentPointToViewPoint(point) {
    return {x: point.x + this._padding.left, y: point.y + this._padding.top};
  }

  /**
   * @param {!Point} point
   * @return {!Point}
   */
  viewportPointToDocumentPoint(point) {
    return {
      x: point.x + this._scrollLeft - this._padding.left,
      y: point.y + this._scrollTop - this._padding.top
    };
  }

  /**
   * @param {!Point} point
   * @return {!Point}
   */
  documentPointToViewportPoint(point) {
    return {
      x: point.x - this._scrollLeft + this._padding.left,
      y: point.y - this._scrollTop + this._padding.top
    };
  }

  /**
   * @param {number} offset
   */
  reveal(offset) {
    if (this._frozen)
      throw 'Cannot reveal while building frame';

    let {x, y} = this.documentPointToViewPoint(this._document.offsetToPoint(offset));
    if (y < this._scrollTop) {
      this._scrollTop = y;
    } else if (y + this._document.measurer().defaultHeight > this._scrollTop + this._height) {
      this._scrollTop = y + this._document.measurer().defaultHeight - this._height;
    }
    if (x < this._scrollLeft) {
      this._scrollLeft = x;
    } else if (x > this._scrollLeft + this._width) {
      this._scrollLeft = x - this._width;
    }
    this._recompute();
    this._revealCallback.call(null);
  }

  /**
   * @return {!{frame: !Frame, text: !Array<!TextDecorator>, scrollbar: !Array<!ScrollbarDecorator>}}
   */
  createFrame() {
    this._document.beforeFrame();
    this._frozen = true;
    let frameOrigin = this.viewportPointToDocumentPoint({x: 0, y: 0});
    const frame = new Frame(this._document, frameOrigin, this._width, this._height);
    const {text, scrollbar} = this._document.decorateFrame(frame);
    this._frozen = false;
    return {frame, text, scrollbar};
  }

  _recompute() {
    // To properly handle input events, we have to update rects synchronously.
    this._maxScrollTop = Math.max(0, this._document.height() - this._height + this._padding.top + this._padding.bottom);
    this._maxScrollLeft = Math.max(0, this._document.longestLineWidth() - this._width + this._padding.left + this._padding.right);

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
    this._scrolledPercentage = 0;
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
  scrolledPercentage() {
    return this._scrolledPercentage;
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
    this._scrolledPercentage = viewportScroll / viewportMaxScroll;
    this._recompute();
  }

  _recompute() {
    let ratio = this._viewportSize / (this._viewportMaxScroll + this._viewportSize);
    this._thumbSize = this._size * ratio;
    this._thumbOffset = this.contentOffsetToScrollbarOffset(this._viewportScroll);
  }
}
