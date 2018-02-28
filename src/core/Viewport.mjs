import {Frame} from './Frame.mjs';

/**
 * @typdef {{
 *   text: !Array<!TextDecorator>|undefined,
 *   background: !Array<!TextDecorator>|undefined,
 *   scrollbar: !Array<!ScrollbarDecorator>|undefined
 * }} FrameDecorationResult
 */

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
    this._decorateCallbacks = [];

    this.hScrollbar = new Scrollbar(offset => this.setScrollLeft(offset));
    this.vScrollbar = new Scrollbar(offset => this.setScrollTop(offset));

    this._revealCallback = () => {};
  }

  /**
   * @return {!Document}
   */
  document() {
    return this._document;
  }

  /**
   * @param {function()} revealCallback
   */
  setRevealCallback(revealCallback) {
    this._revealCallback = revealCallback;
  }

  /**
   * @param {function(!Frame):!FrameDecorationResult} callback
   */
  addFrameDecorationCallback(callback) {
    this._decorateCallbacks.push(callback);
  }

  /**
   * @param {function(!Frame):!FrameDecorationResult} callback
   */
  removeFrameDecorationCallback(callback) {
    let index = this._decorateCallbacks.indexOf(callback);
    if (index !== -1)
      this._decorateCallbacks.splice(index, 1);
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
   * @param {!Range} range
   */
  reveal(range) {
    if (this._frozen)
      throw 'Cannot reveal while building frame';

    let from = this.documentPointToViewPoint(this._document.offsetToPoint(range.from));
    let to = this.documentPointToViewPoint(this._document.offsetToPoint(range.to));
    to.y += this._document.measurer().defaultHeight;

    if (this._scrollTop > from.y) {
      this._scrollTop = from.y;
    } else if (this._scrollTop + this._height < to.y) {
      this._scrollTop = to.y - this._height;
    }
    if (this._scrollLeft > from.x) {
      this._scrollLeft = from.x;
    } else if (this._scrollLeft + this._width < to.x) {
      this._scrollLeft = to.x - this._width;
    }
    this._recompute();
    this._revealCallback.call(null);
  }

  /**
   * @return {!{frame: !Frame, text: !Array<!TextDecorator>, background: !Array<!TextDecorator>, scrollbar: !Array<!ScrollbarDecorator>}}
   */
  createFrame() {
    this._frozen = true;
    this._document.freeze(Viewport._frameFreeze);
    let frameOrigin = this.viewportPointToDocumentPoint({x: 0, y: 0});
    const frame = new Frame(this._document, frameOrigin, this._width, this._height);
    const text = [];
    const background = [];
    const scrollbar = [];
    for (let decorateCallback of this._decorateCallbacks) {
      let result = decorateCallback(frame);
      text.push(...(result.text || []));
      background.push(...(result.background || []));
      scrollbar.push(...(result.scrollbar || []));
    }
    this._document.unfreeze(Viewport._frameFreeze);
    this._frozen = false;
    return {frame, text, background, scrollbar};
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

Viewport._frameFreeze = Symbol('Viewport.frame');
