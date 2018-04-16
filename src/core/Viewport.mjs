import { Start, End } from './Anchor.mjs';
import { RoundMode, Metrics } from './Metrics.mjs';
import { Tree } from './Tree.mjs';
import { trace } from './Trace.mjs';
import { EventEmitter } from './EventEmitter.mjs';

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
 *   lines: !Array<!LineDecorator>|undefined
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
 *   first: number,
 *   last: number,
 *   y: number,
 *   styles: !Array<string>
 * }} Viewport.LineInfo
 */

/**
 * @typedef {{
 *   widget: undefined
 * }} Chunk
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
export class Viewport extends EventEmitter {
  /**
   * @param {!Document} document
   * @param {!Measurer} measurer
   */
  constructor(document, measurer) {
    super();
    this._document = document;
    this._document.addReplaceCallback(this._onReplace.bind(this));

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

    this._measurer = null;

    this.setMeasurer(measurer);
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
    if (this._measurer === measurer)
      return;
    this._measurer = measurer;
    this._lineHeight = measurer.lineHeight();
    this._defaultWidth = measurer.defaultWidth();
    let measure = s => measurer.measureString(s) / this._defaultWidth;
    this._metrics = new Metrics(measurer.defaultWidthRegex(), measure, measure);
    let nodes = this._createNodes(this._document.text(), 0, this._document.length(), kDefaultChunkSize);
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
    this.emit(Viewport.Events.Reveal);
  }

  /**
   * @return {!{
   *   text: !Array<!Viewport.TextInfo>,
   *   background: !Array<!Viewport.BackgroundInfo>,
   *   scrollbar: !Array<!Viewport.ScrollbarInfo>,
   *   lines: !Array<!Viewport.LineInfo>,
   *   paddingLeft: number,
   *   paddingRight: number,
   * }}
   */
  decorate() {
    this._frozen = true;

    let y = this.offsetToViewportPoint(this.viewportPointToOffset({x: 0, y: 0})).y;
    let lines = [];
    for (; y <= this._height; y += this._lineHeight) {
      let from = this.viewportPointToOffset({x: 0, y: y});
      let to = this.viewportPointToOffset({x: this._width, y: y}, RoundMode.Ceil);
      let start = this.viewportPointToOffset({x: -this._scrollLeft, y: y});
      let end = this.viewportPointToOffset({x: this._maxScrollLeft + this._width - this._scrollLeft, y: y});
      let point = this.offsetToViewportPoint(from);
      if (point.y < y)
        break;
      lines.push({
        from: from,
        to: to,
        x: point.x,
        y: point.y,
        start: start,
        end: end
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
    let lineDecorators = [];
    for (let decorateCallback of this._decorateCallbacks) {
      let result = decorateCallback(visibleContent);
      if (!result)
        continue;
      textDecorators.push(...(result.text || []));
      backgroundDecorators.push(...(result.background || []));
      lineDecorators.push(...(result.lines || []));
    }

    let {text, background, lineInfos, paddingLeft, paddingRight} = this._buildTextBackgroundAndLines(lines, textDecorators, backgroundDecorators, lineDecorators);
    let scrollbar = this._buildScrollbar(lineDecorators);

    this._frozen = false;
    return {text, background, scrollbar, lines: lineInfos, paddingLeft, paddingRight};
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
   * @param {!Array<!{from: number, to: number, x: number, y: number, start: number, end: number}>} lines
   * @param {!Array<!TextDecorator>} textDecorators
   * @param {!Array<!TextDecorator>} backgroundDecorators
   * @param {!Array<!LineDecorator>} lineDecorators
   * @return {!{
   *    text: !Array<!Viewport.TextInfo>,
   *    background: !Array<!Viewport.BackgroundInfo>,
   *    lineInfos: !Array<!Viewport.LineInfo>,
   *    paddingLeft: number,
   *    paddingRight: number,
   * }}
   */
  _buildTextBackgroundAndLines(lines, textDecorators, backgroundDecorators, lineDecorators) {
    const paddingLeft = Math.max(this._padding.left - this._scrollLeft, 0);
    const paddingRight = Math.max(this._padding.right - (this._maxScrollLeft - this._scrollLeft), 0);
    const text = [];
    const background = [];
    const lineInfos = [];

    for (let line of lines) {
      let lineContent = this._document.content(line.from, line.to);
      let offsetToX = this._metrics.buildXMap(lineContent);

      let lineStyles = [];
      for (let decorator of lineDecorators) {
        if (decorator.countTouching(End(line.start), End(line.end)) > 0)
          lineStyles.push(decorator.style());
      }
      lineInfos.push({
        first: this._document.offsetToPosition(line.start).line,
        last: this._document.offsetToPosition(line.end).line,
        y: line.y,
        styles: lineStyles
      });

      for (let decorator of textDecorators) {
        decorator.visitTouching(Start(line.from), End(line.to), decoration => {
          trace.count('decorations');
          let from = Math.max(line.from, decoration.from.offset);
          let to = Math.min(line.to, decoration.to.offset);
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
        decorator.visitTouching(Start(line.from - 1), End(line.to + 1), decoration => {
          trace.count('decorations');
          // TODO: note that some editors only show selection up to line length. Setting?
          let from = decoration.from.offset < line.from
            ? paddingLeft
            : line.x + offsetToX[decoration.from.offset - line.from] * this._defaultWidth;
          let to = decoration.to.offset > line.to
            ? this._width - paddingRight
            : line.x + offsetToX[decoration.to.offset - line.from] * this._defaultWidth;
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

    return {text, background, lineInfos, paddingLeft, paddingRight};
  }

  /**
   * @param {!Array<!LineDecorator>} lineDecorators
   * @return {!Array<!Viewport.ScrollbarInfo>}
   */
  _buildScrollbar(lineDecorators) {
    const lineHeight = this._lineHeight;
    const ratio = this._height / (this._maxScrollTop + this._height);
    let scrollbar = [];
    for (let decorator of lineDecorators) {
      let lastTop = -1;
      let lastBottom = -1;
      decorator.sparseVisitAll(decoration => {
        trace.count('decorations');
        const from = this.offsetToContentPoint(decoration.from.offset).y;
        const to = this.offsetToContentPoint(decoration.to.offset).y;

        let top = from * ratio;
        let bottom = (to + lineHeight) * ratio;
        bottom = Math.max(bottom, top + kMinScrollbarDecorationHeight);

        if (top <= lastBottom) {
          lastBottom = bottom;
        } else {
          if (lastTop >= 0)
            scrollbar.push({y: lastTop, height: lastBottom - lastTop, style: decorator.style()});
          lastTop = top;
          lastBottom = bottom;
        }

        let nextOffset = this.contentPointToOffset({x: 0, y: bottom / ratio + lineHeight});
        return Math.max(decoration.to.offset, nextOffset);
      });
      if (lastTop >= 0)
        scrollbar.push({y: lastTop, height: lastBottom - lastTop, style: decorator.style()});
    }
    return scrollbar;
  }

  _recompute() {
    this._maxScrollTop = Math.max(0, this._contentHeight - this._height + this._padding.top + this._padding.bottom);
    this._maxScrollLeft = Math.max(0, this._contentWidth - this._width + this._padding.left + this._padding.right);
    this._scrollLeft = Math.max(this._scrollLeft, 0);
    this._scrollLeft = Math.min(this._scrollLeft, this._maxScrollLeft);
    this._scrollTop = Math.max(this._scrollTop, 0);
    this._scrollTop = Math.min(this._scrollTop, this._maxScrollTop);
  }

  /**
   * @param {!Point} point
   * @param {RoundMode} roundMode
   * @param {boolean} strict
   * @return {number}
   */
  _virtualPointToOffset(point, roundMode = RoundMode.Floor, strict) {
    let iterator = this._tree.iterator();
    let clamped = iterator.locateByPoint(point, !!strict);
    if (clamped === null)
      throw 'Point does not belong to viewport';
    if (iterator.data === undefined)
      return iterator.before ? iterator.before.offset : 0;
    let from = iterator.before.offset;
    let textChunk = this._document.content(from, from + iterator.metrics.length);
    return this._metrics.locateByPoint(textChunk, iterator.before, clamped, roundMode, strict).offset;
  }

  /**
   * @param {number} offset
   * @return {?Point}
   */
  _offsetToVirtualPoint(offset) {
    let iterator = this._tree.iterator();
    if (iterator.locateByOffset(offset, true /* strict */) === null)
      return null;
    if (iterator.data === undefined)
      return iterator.before || {x: 0, y: 0};
    let from = iterator.before.offset;
    let textChunk = this._document.content(from, from + iterator.metrics.length);
    return this._metrics.locateByOffset(textChunk, iterator.before, offset);
  }

  /**
   * @param {!Tree<!Chunk>} tree
   */
  _setTree(tree) {
    this._tree = tree;
    let metrics = tree.metrics();
    this._contentWidth = metrics.longestWidth * this._defaultWidth;
    this._contentHeight = (1 + (metrics.lineBreaks || 0)) * this._lineHeight;
    this._recompute();
  }

  /**
   * @param {!Text} text
   * @param {number} from
   * @param {number} to
   * @param {number} chunkSize
   * @param {number=} firstChunkSize
   * @return {!Array<!{metrics: !TextMetrics, data: !Chunk}>}
   */
  _createNodes(text, from, to, chunkSize, firstChunkSize) {
    let iterator = text.iterator(from, 0, text.length());
    let nodes = [];
    while (iterator.offset < to) {
      let offset = iterator.offset;
      let size = Math.min(to - iterator.offset, chunkSize);
      if (offset === from && firstChunkSize != undefined)
        size = firstChunkSize;
      let chunk = iterator.read(size);
      if (Metrics.isSurrogate(chunk.charCodeAt(chunk.length - 1))) {
        chunk += iterator.current;
        iterator.next();
      }
      nodes.push({metrics: this._metrics.forString(chunk), data: {}});
    }
    return nodes;
  }

  /**
   * @param {!Replacements} replacements
   */
  _onReplace(replacements) {
    if (this._frozen)
      throw new Error('Document modification during decoration is prohibited');

    for (let replacement of replacements) {
      let from = replacement.offset;
      let to = from + replacement.removed.length();
      let inserted = replacement.inserted.length();
      let text = replacement.after;
      let split = this._tree.split(from, to);
      let newFrom = split.left.metrics().length;
      let newTo = text.length() - split.right.metrics().length;

      let nodes;
      if (newFrom - from + inserted + to - newTo > kDefaultChunkSize &&
          newFrom - from + inserted <= kDefaultChunkSize) {
        // For typical editing scenarios, we are most likely to replace at the
        // end of insertion next time.
        nodes = this._createNodes(text, newFrom, newTo, kDefaultChunkSize, newFrom - from + inserted);
      } else {
        nodes = this._createNodes(text, newFrom, newTo, kDefaultChunkSize);
      }

      this._setTree(Tree.merge(split.left, Tree.merge(Tree.build(nodes), split.right)));
    }
  }
}

Viewport.Events = {
  Raf: 'raf',
  Reveal: 'reveal'
};

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

let kDefaultChunkSize = 1000;
const kMinScrollbarDecorationHeight = 5;

Viewport.test = {};

/**
 * @param {!Viewport} viewport
 * @param {number} chunkSize
 */
Viewport.test.rechunk = function(viewport, chunkSize) {
  let nodes = viewport._createNodes(viewport._document.text(), 0, viewport._document.length(), chunkSize);
  viewport._setTree(Tree.build(nodes));
};
