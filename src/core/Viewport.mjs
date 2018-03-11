import {RoundMode} from './Unicode.mjs';
import {trace} from './Trace.mjs';

/**
 * @typedef {{
 *   document: !Document,
 *   range: !Range,
 *   ranges: !Array<!Viewport.VisibleRange>,
 *   firstLine: number,
 *   lastLine: number,
 * }} Viewport.VisibleContent
 */

/**
 * @typdef {{
 *   text: !Array<!TextDecorator>|undefined,
 *   background: !Array<!TextDecorator>|undefined,
 *   scrollbar: !Array<!ScrollbarDecorator>|undefined
 * }} Viewport.DecorationResult
 */

 /**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   content: string,
 *   style: string
 * }} Viewport.TextInfo
 */

/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   width: number,
 *   style: string
 * }} Viewport.BackgroundInfo
 */

/**
 * @typedef {{
 *   y: number,
 *   height: number,
 *   style: string
 * }} Viewport.ScrollbarInfo
 */

/**
 * @typedef {{
 *   line: number,
 *   y: number,
 * }} Viewport.LineInfo
 */

const kMinScrollbarDecorationHeight = 5;

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

    this.hScrollbar = new Viewport.Scrollbar(offset => this.setScrollLeft(offset));
    this.vScrollbar = new Viewport.Scrollbar(offset => this.setScrollTop(offset));

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
   * @param {function(!Viewport.VisibleContent):!Viewport.DecorationResult} callback
   */
  addDecorationCallback(callback) {
    this._decorateCallbacks.push(callback);
  }

  /**
   * @param {function(!Viewport.VisibleContent):!Viewport.DecorationResult} callback
   */
  removeDecorationCallback(callback) {
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
      throw 'Cannot reveal while decorating';

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
   * @return {!{
   *     text: !Array<!Viewport.TextInfo>,
   *     background: !Array<!Viewport.BackgroundInfo>,
   *     scrollbar: !Array<!Viewport.ScrollbarInfo>,
   *     lines: !Array<!Viewport.LineInfo>
   * }}
   */
  decorate() {
    this._frozen = true;
    this._document.freeze(Viewport._decorateFreeze);

    let origin = this.viewportPointToDocumentPoint({x: 0, y: 0});
    let start = this._document.pointToLocation(origin);
    let end = this._document.pointToLocation({x: origin.x + this._width, y: origin.y + this._height}, RoundMode.Ceil);

    let lines = [];
    let totalVisibleRange = 0;
    for (let line = end.line; line >= start.line; line--) {
      let start = this._document.positionToLocation({line, column: 0});
      let end = this._document.lastLocation();
      if (line + 1 < this._document.lineCount()) {
        let nextStartOffset = lines.length
            ? lines[lines.length - 1].start.offset
            : this._document.positionToOffset({line: line + 1, column: 0});
        end = this._document.offsetToLocation(nextStartOffset - 1);
      }
      let from = this._document.pointToLocation({x: origin.x, y: start.y});
      let to = this._document.pointToLocation({x: origin.x + this._width, y: start.y}, RoundMode.Ceil);
      lines.push({line, start, end, from, to});
      totalVisibleRange += to.offset - from.offset;
    }
    lines.reverse();

    let diffs = [];
    for (let i = 0; i < lines.length - 1; i++)
      diffs[i] = {i, len: lines[i + 1].from.offset - lines[i].to.offset};
    diffs.sort((a, b) => a.len - b.len || a.i - b.i);
    let join = new Array(lines.length).fill(false);
    let remaining = totalVisibleRange * 0.5;
    for (let diff of diffs) {
      remaining -= diff.len;
      if (remaining < 0)
        break;
      join[diff.i] = true;
    }

    let ranges = [];
    for (let i = 0; i < lines.length; i++) {
      if (i && join[i - 1])
        ranges[ranges.length - 1].to = lines[i].to.offset;
      else
        ranges.push(new Viewport.VisibleRange(this._document, lines[i].from.offset, lines[i].to.offset));
    }
    let range = ranges.length ? {from: ranges[0].from, to: Math.min(this._document.length(), ranges[ranges.length - 1].to)} : {from: 0, to: 0};

    let visibleContent = {
      document: this._document,
      range: range,
      ranges: ranges,
      firstLine: start.line,
      lastLine: end.line
    };

    let textDecorators = [];
    let backgroundDecorators = [];
    let scrollbarDecorators = [];
    for (let decorateCallback of this._decorateCallbacks) {
      let result = decorateCallback(visibleContent);
      textDecorators.push(...(result.text || []));
      backgroundDecorators.push(...(result.background || []));
      scrollbarDecorators.push(...(result.scrollbar || []));
    }

    let {text, background} = this._buildTextAndBackground(origin, lines, textDecorators, backgroundDecorators);
    let lineInfos = [];
    for (let line of lines) {
      lineInfos.push({
        line: line.line,
        y: line.start.y - this._scrollTop + this._padding.top
      });
    }

    let scrollbar = this._buildScrollbar(scrollbarDecorators);
    this._document.unfreeze(Viewport._decorateFreeze);
    this._frozen = false;
    return {text, background, scrollbar, lines: lineInfos};
  }

  _buildTextAndBackground(origin, lines, textDecorators, backgroundDecorators) {
    const measurer = this._document.measurer();
    const viewportRight = origin.x + this._width;
    const text = [];
    const background = [];
    const dx = -this._scrollLeft + this._padding.left;
    const dy = -this._scrollTop + this._padding.top;
    for (let line of lines) {
      let lineContent = this._document.content(line.from.offset, line.to.offset);
      let offsetToX = new Float32Array(line.to.offset - line.from.offset + 1);
      for (let x = line.from.x, i = 0; i <= line.to.offset - line.from.offset; ) {
        offsetToX[i] = x;
        if (i < lineContent.length) {
          let charCode = lineContent.charCodeAt(i);
          if (charCode >= 0xD800 && charCode <= 0xDBFF && i + 1 < lineContent.length) {
            offsetToX[i + 1] = x;
            x += measurer.measureSupplementaryCodePoint(lineContent.codePointAt(i));
            i += 2;
          } else {
            x += measurer.measureBMPCodePoint(charCode);
            i++;
          }
        } else {
          i++;
        }
      }

      for (let decorator of textDecorators) {
        decorator.visitTouching(line.from.offset, line.to.offset, decoration => {
          trace.count('decorations');
          let from = Math.max(line.from.offset, decoration.from);
          let to = Math.min(line.to.offset, decoration.to);
          if (from < to) {
            text.push({
              x: offsetToX[from - line.from.offset] + dx,
              y: line.start.y + dy,
              content: lineContent.substring(from - line.from.offset, to - line.from.offset),
              style: decoration.data
            });
          }
        });
      }

      for (let decorator of backgroundDecorators) {
        decorator.visitTouching(line.from.offset, line.to.offset, decoration => {
          trace.count('decorations');
          // TODO: note that some editors only show selection up to line length. Setting?
          let from = decoration.from < line.from.offset ? line.from.x - 1 : offsetToX[decoration.from - line.from.offset];
          let to = decoration.to > line.to.offset ? viewportRight + 1 : offsetToX[decoration.to - line.from.offset];
          if (from <= to) {
            background.push({
              x: from + dx,
              y: line.start.y + dy,
              width: to - from,
              style: decoration.data
            });
          }
        });
      }
    }

    return {text, background};
  }

  _buildScrollbar(scrollbarDecorators) {
    const defaultHeight = this._document.measurer().defaultHeight;
    let scrollbar = [];
    for (let decorator of scrollbarDecorators) {
      let lastTop = -1;
      let lastBottom = -1;
      decorator.sparseVisitAll(decoration => {
        trace.count('decorations');
        const from = this._document.offsetToLocation(decoration.from);
        const to = this._document.offsetToLocation(decoration.to);

        let top = this.vScrollbar.contentOffsetToScrollbarOffset(from.y + this._padding.top);
        let bottom = this.vScrollbar.contentOffsetToScrollbarOffset(to.y + defaultHeight + this._padding.top);
        bottom = Math.max(bottom, top + kMinScrollbarDecorationHeight);

        if (top <= lastBottom) {
          lastBottom = bottom;
        } else {
          if (lastTop >= 0)
            scrollbar.push({y: lastTop, height: lastBottom - lastTop, style: decorator.style()});
          lastTop = top;
          lastBottom = bottom;
        }

        let nextY = this.vScrollbar.scrollbarOffsetToContentOffset(bottom) - this._padding.top;
        let line = this._document.pointToPosition({x: 0, y: nextY}).line;
        line = Math.max(to.line, line);
        return Math.max(decoration.to, this._document.positionToOffset({line, column: 0}));
      });
      if (lastTop >= 0)
        scrollbar.push({y: lastTop, height: lastBottom - lastTop, style: decorator.style()});
    }
    return scrollbar;
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

Viewport.Scrollbar = class {
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

Viewport.VisibleRange = class {
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
  right = Math.min(right, document.length() - to);
  if (cache._content === undefined || cache._left < left || cache._right < right) {
    cache._left = Math.max(left, cache._left || 0);
    cache._right = Math.max(right, cache._right || 0);
    cache._content = document.content(from - cache._left, to + cache._right);
  }
  return cache._content.substring(cache._left - left,
                                  cache._content.length - (cache._right - right));
}

Viewport._decorateFreeze = Symbol('Viewport.decorate');
