import { Decorator } from './Decorator.mjs';
import { Document } from './Document.mjs';
import { Frame, VisibleRange } from './Frame.mjs';
import { RoundMode, Metrics } from './Metrics.mjs';
import { trace } from './Trace.mjs';
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

    this._measurer = measurer;
    this._lineHeight = measurer.lineHeight();
    this._defaultWidth = measurer.defaultWidth();

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
    if (this._measurer === measurer)
      return;
    this._measurer = measurer;
    this._lineHeight = measurer.lineHeight();
    this._defaultWidth = measurer.defaultWidth();
    this._markup.setMeasurer(measurer);
  }

  /**
   * @return {number}
   */
  lineHeight() {
    return this._lineHeight;
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
   * @return {!Frame}
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

    let decorators = {text: [], background: [], lines: []};
    for (let decorateCallback of this._decorateCallbacks) {
      let partial = decorateCallback(visibleContent);
      if (!partial)
        continue;
      decorators.text.push(...(partial.text || []));
      decorators.background.push(...(partial.background || []));
      decorators.lines.push(...(partial.lines || []));
    }

    let frame = new Frame();
    this._buildFrameContents(frame, lines, decorators);
    this._buildFrameScrollbar(frame, decorators);
    this._frozen = false;
    return frame;
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
        result.push(new VisibleRange(this._document, ranges[i].from, ranges[i].to));
    }
    return result;
  }

  /**
   * @param {!Frame} frame
   * @param {!Array<!{from: number, to: number, x: number, y: number, start: number, end: number}>} lines
   * @param {!DecorationResult} decorators
   */
  _buildFrameContents(frame, lines, decorators) {
    frame.paddingLeft = Math.max(this._padding.left - this._scrollLeft, 0);
    frame.paddingRight = Math.max(this._padding.right - (this._maxScrollLeft - this._scrollLeft), 0);

    for (let line of lines) {
      let offsetToX = new Float32Array(line.to - line.from + 1);
      let needsRtlBreakAfter = new Int8Array(line.to - line.from + 1);
      let lineContent = this._document.text().content(line.from, line.to);

      let x = line.x;
      let offset = line.from;
      offsetToX[0] = x;
      needsRtlBreakAfter[line.to - line.from] = 0;

      let iterator = this._markup.iterator();
      iterator.locateByOffset(line.from);
      // Skip processing text if we are scrolled past the end of the line, in which case
      // locateByOffset will point to undefined location.
      while (iterator.before) {
        if (iterator.data) {
          let mark = iterator.data;
          frame.marks.push({x: x, y: line.y, mark});
          x += mark.width;
          // if (!iterator.data.end)
          //   offsetToX[offset - line.from] = x;
        } else {
          let after = Math.min(line.to, iterator.after ? iterator.after.offset : offset);
          this._markup._metrics.fillXMap(offsetToX, needsRtlBreakAfter, lineContent, offset - line.from, after - line.from, x, this._defaultWidth);
          x = offsetToX[after - line.from];

          for (let decorator of decorators.text) {
            decorator.visitTouching(offset, after + 0.5, decoration => {
              trace.count('decorations');
              let from = Math.max(offset, Offset(decoration.from));
              let to = Math.min(after, Offset(decoration.to));
              while (from < to) {
                let end = from + 1;
                while (end < to && !needsRtlBreakAfter[end - line.from])
                  end++;
                frame.text.push({
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
      for (let decorator of decorators.lines) {
        // We deliberately do not include |line.start| here
        // to allow line decorations to span the whole line without
        // affecting the next one.
        if (decorator.countTouching(line.start + 0.5, line.end + 0.5) > 0)
          lineStyles.push(decorator.style());
      }
      frame.lines.push({
        first: this._document.text().offsetToPosition(line.start).line,
        last: this._document.text().offsetToPosition(line.end).line,
        y: line.y,
        styles: lineStyles
      });

      for (let decorator of decorators.background) {
        // Expand by a single character which is not visible to account for borders
        // extending past viewport.
        decorator.visitTouching(line.from - 1, line.to + 1, decoration => {
          trace.count('decorations');
          // TODO: note that some editors only show selection up to line length. Setting?
          let from = Offset(decoration.from);
          from = from < line.from ? frame.paddingLeft : offsetToX[from - line.from];
          let to = Offset(decoration.to);
          to = to > line.to ? this._width - frame.paddingRight : offsetToX[to - line.from];
          if (from <= to) {
            frame.background.push({
              x: from,
              y: line.y,
              width: to - from,
              style: decoration.data
            });
          }
        });
      }
    }
  }

  /**
   * @param {!Frame} frame
   * @param {!DecorationResult} decorators
   */
  _buildFrameScrollbar(frame, decorators) {
    const lineHeight = this._lineHeight;
    const ratio = this._height / (this._maxScrollTop + this._height);
    for (let decorator of decorators.lines) {
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
            frame.scrollbar.push({y: lastTop, height: lastBottom - lastTop, style: decorator.style()});
          lastTop = top;
          lastBottom = bottom;
        }

        let nextOffset = this.contentPointToOffset({x: 0, y: bottom / ratio });
        return Math.max(Offset(decoration.to), nextOffset);
      });
      if (lastTop >= 0)
        frame.scrollbar.push({y: lastTop, height: lastBottom - lastTop, style: decorator.style()});
    }
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
   * @param {!DocumentChangedEvent} event
   */
  _onDocumentChanged({replacements}) {
    if (!replacements.length)
      return;
    if (this._frozen)
      throw new Error('Document modification during decoration is prohibited');
  }
}

Viewport.Events = {
  Raf: 'raf',
  Changed: 'changed',
};

/**
 * @param {!Anchor} anchor
 * @return {number}
 */
function Offset(anchor) {
  return Math.floor(anchor);
}

const kMinScrollbarDecorationHeight = 5;

Viewport.test = {};

/**
 * @param {!Viewport} viewport
 * @param {number} chunkSize
 */
Viewport.test.rechunk = function(viewport, chunkSize) {
  Markup.test.rechunk(viewport._markup, chunkSize);
};
