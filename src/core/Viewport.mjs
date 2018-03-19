import {RoundMode, Metrics} from './Metrics.mjs';
import { Tree } from './Tree.mjs';
import {trace} from './Trace.mjs';

/**
 * @typedef {{
 *   document: !Document,
 *   range: !Range,
 *   ranges: !Array<!Viewport.VisibleRange>,
 * }} Viewport.VisibleContent
 */

/**
 * @typedef {{
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

/**
 * @typedef {{
 *   metrics: !TextMetrics
 * }} TextChunk
 */

/**
 * Measurer converts strings to widths and provides line height.
 *
 * @interface
 */
export class Measurer {
  /**
   * The default width of a code point. Note that code points from Supplementary Planes
   * cannot be given default width.
   * Total width of a |string| with all default width code points will be
   * |string.length * defaultWidth|.
   *
   * @return {number}
   */
  defaultWidth() {
  }

  /**
   * Regex for strings which consist only of characters with default width and height.
   * Used for fast-path calculations.
   *
   * @return {?RegExp}
   */
  defaultRegex() {
  }

  /**
   * Measures the width of a string.
   * @param {string} s
   */
  measureString(s) {
  }
};

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
export class Viewport {
  /**
   * @param {!Document} document
   * @param {!Measurer} measurer
   * @param {function()} revealCallback
   */
  constructor(document, measurer, revealCallback) {
    this._document = document;
    this._document.addReplaceCallback(this._onReplace.bind(this));
    this._revealCallback = revealCallback;

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

    this.setMeasurer(measurer);
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
    this._lineHeight = measurer.lineHeight();
    this._defaultWidth = measurer.defaultWidth();
    let measure = s => measurer.measureString(s) / this._defaultWidth;
    this._metrics = new Metrics(measurer.defaultWidthRegex(), measure, measure);
    let nodes = this._wrapChunks(this._createChunks(0, this._document.length(), kDefaultChunkSize));
    this._setTree(Tree.build(nodes));
  }

  /**
   * @return {number}
   */
  lineHeight() {
    return this._lineHeight;
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
   * @param {RoundMode=} roundMode
   * @param {boolean=} strict
   * @return {number}
   */
  viewportPointToOffset(point, roundMode = RoundMode.Floor, strict) {
    return this._virtualPointToOffset({
      x: (point.x + this._scrollLeft - this._padding.left) / this._defaultWidth,
      y: (point.y + this._scrollTop - this._padding.top) / this._lineHeight
    }, roundMode, !!strict);
  }

  /**
   * @param {number} offset
   * @return {?Point}
   */
  offsetToViewportPoint(offset) {
    let point = this._offsetToVirtualPoint(offset);
    return point === null ? null : {
      x: point.x * this._defaultWidth - this._scrollLeft + this._padding.left,
      y: point.y * this._lineHeight - this._scrollTop + this._padding.top
    };
  }

  /**
   * @param {!Point} point
   * @param {RoundMode=} roundMode
   * @param {boolean=} strict
   * @return {number}
   */
  contentPointToOffset(point, roundMode = RoundMode.Floor, strict) {
    return this._virtualPointToOffset({
      x: point.x / this._defaultWidth,
      y: point.y / this._lineHeight
    }, roundMode, !!strict);
  }

  /**
   * @param {number} offset
   * @return {?Point}
   */
  offsetToContentPoint(offset) {
    let point = this._offsetToVirtualPoint(offset);
    return point === null ? null : {
      x: point.x * this._defaultWidth,
      y: point.y * this._lineHeight
    };
  }

  /**
   * @param {!Point} point
   * @param {RoundMode} roundMode
   * @param {boolean} strict
   * @return {number}
   */
  _virtualPointToOffset(point, roundMode = RoundMode.Floor, strict) {
    let found = this._tree.findByPoint(point, !!strict);
    if (found.data === null)
      return found.location.offset;
    let from = found.location.offset;
    let chunk = this._document.content(from, from + found.data.metrics.length);
    return this._metrics.locateByPoint(chunk, found.location, found.clampedPoint, roundMode, strict).offset;
  }

  /**
   * @param {number} offset
   * @return {?Point}
   */
  _offsetToVirtualPoint(offset) {
    let found = this._tree.findByOffset(offset);
    if (found.location === null || found.data === null)
      return found.location;
    let from = found.location.offset;
    let chunk = this._document.content(from, from + found.data.metrics.length);
    return this._metrics.locateByOffset(chunk, found.location, offset);
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
   * @param {!Range} range
   * @param {!{left: number, right: number, top: number, bottom: number}=} rangePadding
   */
  reveal(range, rangePadding) {
    if (this._frozen)
      throw 'Cannot reveal while decorating';

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
    to.y += this._scrollTop + this._lineHeight;

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
    this._revealCallback.call(null);
  }

  /**
   * @return {!{
   *   text: !Array<!Viewport.TextInfo>,
   *   background: !Array<!Viewport.BackgroundInfo>,
   *   scrollbar: !Array<!Viewport.ScrollbarInfo>,
   *   lines: !Array<!Viewport.LineInfo>
   * }}
   */
  decorate() {
    this._frozen = true;
    this._document.freeze(Viewport._decorateFreeze);

    let y = this.offsetToViewportPoint(this.viewportPointToOffset({x: 0, y: 0})).y;
    let lines = [];
    for (; y <= this._height; y += this._lineHeight) {
      let from = this.viewportPointToOffset({x: 0, y: y});
      let to = this.viewportPointToOffset({x: this._width, y: y}, RoundMode.Ceil);
      let point = this.offsetToViewportPoint(from);
      if (point.y < y)
        break;
      lines.push({
        from: from,
        to: to,
        x: point.x,
        y: point.y,
      });
    }

    let ranges = this._joinRanges(lines);
    let totalRange = ranges.length ? {from: ranges[0].from, to: ranges[ranges.length - 1].to} : {from: 0, to: 0};
    let visibleContent = {
      document: this._document,
      range: totalRange,
      ranges: ranges,
    };

    let textDecorators = [];
    let backgroundDecorators = [];
    let scrollbarDecorators = [];
    for (let decorateCallback of this._decorateCallbacks) {
      let result = decorateCallback(visibleContent);
      if (!result)
        continue;
      textDecorators.push(...(result.text || []));
      backgroundDecorators.push(...(result.background || []));
      scrollbarDecorators.push(...(result.scrollbar || []));
    }

    let {text, background} = this._buildTextAndBackground(lines, textDecorators, backgroundDecorators);
    let lineInfos = [];
    for (let line of lines) {
      lineInfos.push({
        // TODO: this should be a range of lines, measured by start/end rather than from/to.
        line: this._document.offsetToPosition(line.from).line,
        y: line.y
      });
    }
    let scrollbar = this._buildScrollbar(scrollbarDecorators);

    this._document.unfreeze(Viewport._decorateFreeze);
    this._frozen = false;
    return {text, background, scrollbar, lines: lineInfos};
  }

  /**
   * @param {!Array<!Range>} ranges
   * @return {!Array<!Viewport.VisibleRange>}
   */
  _joinRanges(ranges) {
    let totalRange = 0;
    for (let range of ranges)
    totalRange += range.to - range.from;
    let diffs = [];
    for (let i = 0; i < ranges.length - 1; i++)
      diffs[i] = {i, len: ranges[i + 1].from - ranges[i].to};
    diffs.sort((a, b) => a.len - b.len || a.i - b.i);
    let join = new Array(ranges.length).fill(false);
    let remaining = totalRange * 0.5;
    for (let diff of diffs) {
      remaining -= diff.len;
      if (remaining < 0)
        break;
      join[diff.i] = true;
    }

    let result = [];
    for (let i = 0; i < ranges.length; i++) {
      if (i && join[i - 1])
        result[result.length - 1].to = ranges[i].to;
      else
        result.push(new Viewport.VisibleRange(this._document, ranges[i].from, ranges[i].to));
    }
    return result;
  }

  /**
   * @param {!Array<!{from: number, to: number, x: number, y: number}>} lines
   * @param {!Array<!TextDecorator>} textDecorators
   * @param {!Array<!TextDecorator>} backgroundDecorators
   * @return {!{text: !Viewport.TextInfo, background: !Viewport.BackgroundInfo}}
   */
  _buildTextAndBackground(lines, textDecorators, backgroundDecorators) {
    const decorationMinLeft = Math.max(this._padding.left - this._scrollLeft, 0);
    const scrollRight = this._maxScrollLeft - this._scrollLeft;
    const decorationMaxRight = this._width - Math.max(this._padding.right - scrollRight, 0);
    const text = [];
    const background = [];
    for (let line of lines) {
      let lineContent = this._document.content(line.from, line.to);
      let offsetToX = this._metrics.buildXMap(lineContent, line.to - line.from + 1);

      for (let decorator of textDecorators) {
        decorator.visitTouching(line.from, line.to, decoration => {
          trace.count('decorations');
          let from = Math.max(line.from, decoration.from);
          let to = Math.min(line.to, decoration.to);
          if (from < to) {
            text.push({
              x: line.x + offsetToX[from - line.from] * this._defaultWidth,
              y: line.y,
              content: lineContent.substring(from - line.from, to - line.from),
              style: decoration.data
            });
          }
        });
      }

      for (let decorator of backgroundDecorators) {
        decorator.visitTouching(line.from, line.to, decoration => {
          trace.count('decorations');
          // TODO: note that some editors only show selection up to line length. Setting?
          let from = decoration.from < line.from
            ? decorationMinLeft
            : line.x + offsetToX[decoration.from - line.from] * this._defaultWidth;
          let to = decoration.to > line.to
            ? decorationMaxRight
            : line.x + offsetToX[decoration.to - line.from] * this._defaultWidth;
          if (from <= to) {
            background.push({
              x: from,
              y: line.y,
              width: to - from,
              style: decoration.data
            });
          }
        });
      }
    }

    return {text, background};
  }

  /**
   * @param {!Array<!ScrollbaDecorator>} scrollbarDecorators
   * @return {!Array<!Viewport.ScrollbarInfo>}
   */
  _buildScrollbar(scrollbarDecorators) {
    const lineHeight = this._lineHeight;
    let scrollbar = [];
    for (let decorator of scrollbarDecorators) {
      let lastTop = -1;
      let lastBottom = -1;
      decorator.sparseVisitAll(decoration => {
        trace.count('decorations');
        const from = this.offsetToViewportPoint(decoration.from);
        const to = this.offsetToViewportPoint(decoration.to);

        let top = this.vScrollbar.contentOffsetToScrollbarOffset(from.y);
        let bottom = this.vScrollbar.contentOffsetToScrollbarOffset(to.y + lineHeight);
        bottom = Math.max(bottom, top + kMinScrollbarDecorationHeight);

        if (top <= lastBottom) {
          lastBottom = bottom;
        } else {
          if (lastTop >= 0)
            scrollbar.push({y: lastTop, height: lastBottom - lastTop, style: decorator.style()});
          lastTop = top;
          lastBottom = bottom;
        }

        let nextY = this.vScrollbar.scrollbarOffsetToContentOffset(bottom);
        let nextOffset = this.viewportPointToOffset({x: 0, y: nextY + lineHeight});
        return Math.max(decoration.to, nextOffset);
      });
      if (lastTop >= 0)
        scrollbar.push({y: lastTop, height: lastBottom - lastTop, style: decorator.style()});
    }
    return scrollbar;
  }

  _recompute() {
    // To properly handle input events, we have to update rects synchronously.
    this._maxScrollTop = Math.max(0, this._contentHeight - this._height + this._padding.top + this._padding.bottom);
    this._maxScrollLeft = Math.max(0, this._contentWidth - this._width + this._padding.left + this._padding.right);

    this._scrollLeft = Math.max(this._scrollLeft, 0);
    this._scrollLeft = Math.min(this._scrollLeft, this._maxScrollLeft);
    this._scrollTop = Math.max(this._scrollTop, 0);
    this._scrollTop = Math.min(this._scrollTop, this._maxScrollTop);

    this.vScrollbar._setViewportMetrics(this._scrollTop, this._maxScrollTop, this._height);
    this.hScrollbar._setViewportMetrics(this._scrollLeft, this._maxScrollLeft, this._width);
  }

  /**
   * @param {!Tree<!TreeChunk>} tree
   */
  _setTree(tree) {
    this._tree = tree;
    let metrics = tree.metrics();
    this._contentWidth = metrics.longestWidth * this._defaultWidth;
    this._contentHeight = (1 + (metrics.lineBreaks || 0)) * this._lineHeight;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {number} chunkSize
   * @param {number=} firstChunk
   * @return {!Array<!TextChunk>}
   */
  _createChunks(from, to, chunkSize, firstChunk) {
    let iterator = this._document.iterator(from);
    let chunks = [];
    while (iterator.offset < to) {
      let offset = iterator.offset;
      let size = Math.min(to - iterator.offset, chunkSize);
      if (offset === from && firstChunk != undefined)
        size = firstChunk;
      let chunk = iterator.read(size);
      if (Metrics.isSurrogate(chunk.charCodeAt(chunk.length - 1))) {
        chunk += iterator.current;
        iterator.next();
      }
      chunks.push({metrics: this._metrics.forString(chunk)});
    }
    return chunks;
  }

  /**
   * @param {!Array<!TextChunk>} chunks
   * @return {!Array<!{metrics: !TextMetrics, data: !TextChunk}>}
   */
  _wrapChunks(chunks) {
    return chunks.map(chunk => ({metrics: chunk.metrics, data: chunk}));
  }

  /**
   * @param {!Replacement} replacement
   */
  _onReplace(replacement) {
    let {from, to, inserted} = replacement;
    let split = this._tree.split(from, to);
    let newFrom = split.left.metrics().length;
    let newTo = this._document.length() - split.right.metrics().length;

    let chunks;
    if (newFrom - from + inserted + to - newTo > kDefaultChunkSize &&
        newFrom - from + inserted <= kDefaultChunkSize) {
      // For typical editing scenarios, we are most likely to replace at the
      // end of |insertion| next time.
      chunks = this._createChunks(newFrom, newTo, kDefaultChunkSize, newFrom - from + inserted);
    } else {
      chunks = this._createChunks(newFrom, newTo, kDefaultChunkSize);
    }

    let nodes = this._wrapChunks(chunks);
    this._setTree(Tree.build(nodes, split.left, split.right));
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

let kDefaultChunkSize = 1000;
const kMinScrollbarDecorationHeight = 5;

Viewport.test = {};

/**
 * @param {!Viewport} viewport
 * @param {number} chunkSize
 */
Viewport.test.rechunk = function(viewport, chunkSize) {
  let nodes = viewport._wrapChunks(viewport._createChunks(0, viewport._document.length(), chunkSize));
  viewport._setTree(Tree.build(nodes));
};
