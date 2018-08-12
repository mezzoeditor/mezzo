import { Start, End, Before, After, Offset } from './Anchor.mjs';
import { Decorator } from './Decorator.mjs';
import { Document } from './Document.mjs';
import { RoundMode, Metrics } from './Metrics.mjs';
import { Tree } from './Tree.mjs';
import { trace } from './Trace.mjs';
import { EventEmitter } from './EventEmitter.mjs';
import { TextView } from './TextView.mjs';

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
 *   x: number,
 *   y: number,
 *   widget: !Viewport.InlineWidget,
 * }} Viewport.InlineWidgetInfo
 */

/**
 * @typedef {{
 *   width: number,
 * }} Viewport.InlineWidget
 */

/**
 * Measurer converts strings to widths and provides line height.
 *
 * @interface
 */
export class Measurer {
  /**
   * The default width of a code point, should be a positive number.
   * Note that code points from Supplementary Planes cannot be given default width.
   * The total width of a |string| with all code points of default width will be
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
  defaultWidthRegex() {
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
    this._document.on(Document.Events.Changed, this._onDocumentChanged.bind(this));

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

    this._onTextViewChanged = () => {
      let metrics = this._textView.metrics();
      this._contentWidth = metrics.longestWidth * this._defaultWidth;
      this._contentHeight = (1 + (metrics.lineBreaks || 0)) * this._lineHeight;
      this._recompute();
    };
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
    if (this._textView)
      this._textView.off(TextView.Events.Changed, this._onTextViewChanged);
    this._textView = new TextView(this._metrics, this._document.text());
    this._textView.on(TextView.Events.Changed, this._onTextViewChanged);
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
    this.raf();
  }

  /**
   * @param {function(!Viewport.VisibleContent):!Viewport.DecorationResult} callback
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
  }

  /**
   * @param {!Viewport.InlineWidget} inlineWidget
   * @param {!Anchor} anchor
   */
  addInlineWidget(inlineWidget, anchor) {
    // TODO: delegate to TextView.
  }

  /**
   * @param {!Viewport.InlineWidget} inlineWidget
   */
  removeWidget(inlineWidget) {
    // TODO: delegate to TextView.
  }

  /**
   * @return {!{
   *   text: !Array<!Viewport.TextInfo>,
   *   background: !Array<!Viewport.BackgroundInfo>,
   *   inlineWidgets: !Array<!Viewport.InlineWidgetInfo>,
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
      // TODO: from/to do not include widgets on the edge.
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

    let {text, background, inlineWidgets, lineInfos, paddingLeft, paddingRight} = this._buildContents(lines, textDecorators, backgroundDecorators, lineDecorators);
    let scrollbar = this._buildScrollbar(lineDecorators);

    this._frozen = false;
    return {text, background, inlineWidgets, scrollbar, lines: lineInfos, paddingLeft, paddingRight};
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
   *    inlineWidgets: !Array<!Viewport.InlineWidgetInfo>,
   *    lineInfos: !Array<!Viewport.LineInfo>,
   *    paddingLeft: number,
   *    paddingRight: number,
   * }}
   */
  _buildContents(lines, textDecorators, backgroundDecorators, lineDecorators) {
    const paddingLeft = Math.max(this._padding.left - this._scrollLeft, 0);
    const paddingRight = Math.max(this._padding.right - (this._maxScrollLeft - this._scrollLeft), 0);
    const text = [];
    const background = [];
    const inlineWidgets = [];
    const lineInfos = [];

    for (let line of lines) {
      let offsetToX = new Float32Array(line.to - line.from + 1);
      let needsRtlBreakAfter = new Int8Array(line.to - line.from + 1);
      let lineContent = this._document.text().content(line.from, line.to);

      let x = line.x;
      let offset = line.from;
      offsetToX[0] = x;
      needsRtlBreakAfter[line.to - line.from] = 0;

      let iterator = this._textView.iterator();
      iterator.locateByOffset(line.from);
      // Skip processing text if we are scrolled past the end of the line, in which case
      // locateByOffset will point to undefined location.
      while (iterator.before) {
        if (iterator.data && iterator.data.inlineWidget) {
          inlineWidgets.push({x: x, y: line.y, inlineWidget: iterator.data.inlineWidget});
          x += iterator.data.inlineWidget.width;
          if (!iterator.data.end)
            offsetToX[offset - line.from] = x;
        } else {
          let after = Math.min(line.to, iterator.after ? iterator.after.offset : offset);
          this._metrics.fillXMap(offsetToX, needsRtlBreakAfter, lineContent, offset - line.from, after - line.from, x, this._defaultWidth);
          x = offsetToX[after - line.from];

          for (let decorator of textDecorators) {
            decorator.visitTouching(Start(offset), End(after), decoration => {
              trace.count('decorations');
              let from = Math.max(offset, Offset(decoration.from));
              let to = Math.min(after, Offset(decoration.to));
              while (from < to) {
                let end = from + 1;
                while (end < to && !needsRtlBreakAfter[end - line.from])
                  end++;
                text.push({
                  x: offsetToX[from - line.from],
                  y: line.y,
                  content: lineContent.substring(from - line.from, end - line.from),
                  style: decoration.data
                });
                from = end;
              }
            });
          }

          offset = after;
        }

        if (offset === line.to)
          break;
        if (!iterator.after)
          throw new Error('Inconsistent');
        iterator.next();
      }

      let lineStyles = [];
      for (let decorator of lineDecorators) {
        if (decorator.countTouching(End(line.start), End(line.end)) > 0)
          lineStyles.push(decorator.style());
      }
      lineInfos.push({
        first: this._document.text().offsetToPosition(line.start).line,
        last: this._document.text().offsetToPosition(line.end).line,
        y: line.y,
        styles: lineStyles
      });

      for (let decorator of backgroundDecorators) {
        decorator.visitTouching(Start(line.from - 1), End(line.to + 1), decoration => {
          trace.count('decorations');
          // TODO: note that some editors only show selection up to line length. Setting?
          let from = Offset(decoration.from) < line.from ? paddingLeft : offsetToX[Offset(decoration.from) - line.from];
          let to = Offset(decoration.to) > line.to ? this._width - paddingRight : offsetToX[Offset(decoration.to) - line.from];
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

    return {text, background, inlineWidgets, lineInfos, paddingLeft, paddingRight};
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
        const from = this.offsetToContentPoint(Offset(decoration.from)).y;
        const to = this.offsetToContentPoint(Offset(decoration.to)).y;

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

        let nextOffset = this.contentPointToOffset({x: 0, y: bottom / ratio });
        return Start(Math.max(Offset(decoration.to), nextOffset));
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
    this.emit(Viewport.Events.Changed);
  }

  /**
   * @param {!Point} point
   * @param {RoundMode} roundMode
   * @param {boolean} strict
   * @return {number}
   */
  _virtualPointToOffset(point, roundMode = RoundMode.Floor, strict = false) {
    return this._textView.pointToOffset(point, roundMode, strict);
  }

  /**
   * @param {number} offset
   * @return {?Point}
   */
  _offsetToVirtualPoint(offset) {
    return this._textView.offsetToPoint(offset);
  }

  /**
   * @param {!DocumentChangedEvent} event
   */
  _onDocumentChanged({replacements}) {
    if (!replacements.length)
      return;

    if (this._frozen)
      throw new Error('Document modification during decoration is prohibited');
    for (const replacement of replacements)
      this._textView.replace(replacement);
  }
}

Viewport.Events = {
  Raf: 'raf',
  Changed: 'changed',
  InlineWidgetRemoved: 'inlineWidgetRemoved',
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
  right = Math.min(right, document.text().length() - to);
  if (cache._content === undefined || cache._left < left || cache._right < right) {
    cache._left = Math.max(left, cache._left || 0);
    cache._right = Math.max(right, cache._right || 0);
    cache._content = document.text().content(from - cache._left, to + cache._right);
  }
  return cache._content.substring(cache._left - left,
                                  cache._content.length - (cache._right - right));
}

let kDefaultChunkSize = 1000;
const kMinScrollbarDecorationHeight = 5;
const kWidgetSymbol = Symbol('widgetHandle');

Viewport.test = {};

/**
 * @param {!Viewport} viewport
 * @param {number} chunkSize
 */
Viewport.test.rechunk = function(viewport, chunkSize) {
  TextView.test.rechunk(viewport._textView, chunkSize);
};
