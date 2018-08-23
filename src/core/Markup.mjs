import { EventEmitter } from './EventEmitter.mjs';
import { Document } from './Document.mjs';
import { Decorator } from './Decorator.mjs';
import { RoundMode, Metrics } from './Metrics.mjs';
import { Tree } from './Tree.mjs';
import { VisibleRange } from './Frame.mjs';

/**
 * @typedef {{
 *   width: number
 * }} Mark
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

export class Markup extends EventEmitter {
  /**
   * @param {!Measurer} measurer
   * @param {!Document} document
   */
  constructor(measurer, document) {
    super();
    this._frozen = false;
    this._document = document;
    this._document.on(Document.Events.Changed, ({replacements}) => {
      if (!replacements.length)
        return;
      if (this._frozen)
        throw new Error('Document modification during decoration is prohibited');
      for (const replacement of replacements)
        this._replace(replacement);
    });
    this._text = document.text();
    this._measurer = null;
    this._contentWidth = 0;
    this._contentHeight = 0;
    this.setMeasurer(measurer);
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
    let nodes = this._createNodes(this._text, 0, this._text.length(), kDefaultChunkSize);
    this._setTree(Tree.build(nodes));
  }

  /**
   * @return {number}
   */
  lineHeight() {
    return this._lineHeight;
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
   * @param {!Replacement} replacement
   */
  _replace(replacement) {
    let from = replacement.offset;
    let to = from + replacement.removed.length();
    let inserted = replacement.inserted.length();

    this._rechunk(replacement.after, from, to, inserted);
    this._text = replacement.after;
  }

  /**
   * @param {!Point} point
   * @param {RoundMode} roundMode
   * @param {boolean} strict
   * @return {number}
   */
  pointToOffset(point, roundMode = RoundMode.Floor, strict = false) {
    return this._virtualPointToOffset({
      x: point.x / this._defaultWidth,
      y: point.y / this._lineHeight
    }, roundMode, strict);
  }

  /**
   * @param {!Point} point
   * @param {RoundMode} roundMode
   * @param {boolean} strict
   * @return {number}
   */
  _virtualPointToOffset(point, roundMode, strict) {
    let iterator = this._tree.iterator();
    let clamped = iterator.locateByPoint(point, strict);
    if (clamped === null)
      throw 'Point does not belong to the Markup';
    if (iterator.data === undefined)
      return iterator.before ? iterator.before.offset : 0;
    let from = iterator.before.offset;
    let textChunk = this._text.content(from, from + iterator.metrics.length);
    return this._metrics.locateByPoint(textChunk, iterator.before, clamped, roundMode, strict).offset;
  }

  /**
   * @param {number} offset
   * @return {?Point}
   */
  offsetToPoint(offset) {
    let point = this._offsetToVirtualPoint(offset);
    return point === null ? null : {x: point.x * this._defaultWidth, y: point.y * this._lineHeight};
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
    let textChunk = this._text.content(from, from + iterator.metrics.length);
    return this._metrics.locateByOffset(textChunk, iterator.before, offset);
  }

  /**
   * @param {!Tree<?Mark>} tree
   */
  _setTree(tree) {
    this._tree = tree;
    let metrics = tree.metrics();
    this._contentWidth = metrics.longestWidth * this._defaultWidth;
    this._contentHeight = (1 + (metrics.lineBreaks || 0)) * this._lineHeight;
    this.emit(Markup.Events.Changed);
  }

  /**
   * @param {!Text} text
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   */
  _rechunk(text, from, to, inserted) {
    let split = this._tree.split(from, to);
    let newFrom = split.left.metrics().length;
    let newTo = text.length() - split.right.metrics().length;

    let nodes;
    if (newTo - newFrom > kDefaultChunkSize && from - newFrom + inserted <= kDefaultChunkSize) {
      // For typical editing scenarios, we are most likely to replace at the
      // end of insertion next time.
      nodes = this._createNodes(text, newFrom, newTo, kDefaultChunkSize, from - newFrom + inserted);
    } else {
      nodes = this._createNodes(text, newFrom, newTo, kDefaultChunkSize);
    }

    this._setTree(Tree.merge(split.left, Tree.merge(Tree.build(nodes), split.right)));
  }

  /**
   * @param {!Text} text
   * @param {number} from
   * @param {number} to
   * @param {number} chunkSize
   * @param {number=} firstChunkSize
   * @return {!Array<!{metrics: !TextMetrics, data: ?Mark}>}
   */
  _createNodes(text, from, to, chunkSize, firstChunkSize) {
    const nodes = [];
    let iterator = text.iterator(from, from, to);
    while (iterator.offset < to) {
      let offset = iterator.offset;
      let size = chunkSize;
      if (offset === from && firstChunkSize != undefined)
        size = firstChunkSize;
      size = Math.min(to - iterator.offset, size);
      let chunk = iterator.read(size);
      if (Metrics.isSurrogate(chunk.charCodeAt(chunk.length - 1))) {
        chunk += iterator.current;
        iterator.next();
      }
      nodes.push({metrics: this._metrics.forString(chunk), data: null});
    }
    return nodes;
  }

  /**
   * @param {!Frame} frame
   * @param {!{left: number, top: number, width: number, height: number}} rect
   * @param {!{ratio: number, minDecorationHeight: number}} scrollbarParams
   * @param {!Array<!DecorationCallback>} decorationCallbacks
   */
  buildFrame(frame, rect, scrollbarParams, decorationCallbacks) {
    this._frozen = true;

    frame.lineHeight = this._lineHeight;

    let y = this.offsetToPoint(this.pointToOffset({x: rect.left, y: rect.top})).y;
    const lines = [];
    for (; y <= rect.top + rect.height; y += this._lineHeight) {
      // TODO: from/to do not include widgets on the edge.
      let from = this.pointToOffset({x: rect.left, y: y});
      let to = this.pointToOffset({x: rect.left + rect.width, y: y}, RoundMode.Ceil);
      let start = this.pointToOffset({x: 0, y: y});
      let end = this.pointToOffset({x: this._contentWidth, y: y});
      let point = this.offsetToPoint(from);
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

    const ranges = joinRanges(lines, this._document);
    const totalRange = ranges.length ? {from: ranges[0].from, to: ranges[ranges.length - 1].to} : {from: 0, to: 0};
    const visibleContent = {
      document: this._document,
      range: totalRange,
      ranges: ranges,
    };

    const decorators = {text: [], background: [], lines: []};
    for (let decorationCallback of decorationCallbacks) {
      const partial = decorationCallback(visibleContent);
      if (!partial)
        continue;
      decorators.text.push(...(partial.text || []));
      decorators.background.push(...(partial.background || []));
      decorators.lines.push(...(partial.lines || []));
    }

    this._buildFrameContents(frame, lines, decorators);
    this._buildFrameScrollbar(frame, decorators, scrollbarParams);

    this._frozen = false;
  }

  /**
   * @param {!Frame} frame
   * @param {!Array<!{from: number, to: number, x: number, y: number, start: number, end: number}>} lines
   * @param {!DecorationResult} decorators
   */
  _buildFrameContents(frame, lines, decorators) {
    for (let line of lines) {
      const offsetToX = new Float32Array(line.to - line.from + 1);
      const needsRtlBreakAfter = new Int8Array(line.to - line.from + 1);
      const lineContent = this._text.content(line.from, line.to);

      let x = line.x;
      let offset = line.from;
      offsetToX[0] = x;
      needsRtlBreakAfter[line.to - line.from] = 0;

      const iterator = this._tree.iterator();
      iterator.locateByOffset(line.from);
      // Skip processing text if we are scrolled past the end of the line, in which case
      // locateByOffset will point to undefined location.
      while (iterator.before !== undefined) {
        const after = Math.min(line.to, iterator.after ? iterator.after.offset : offset);
        this._metrics.fillXMap(offsetToX, needsRtlBreakAfter, lineContent, offset - line.from, after - line.from, x, this._defaultWidth);
        x = offsetToX[after - line.from];

        for (let decorator of decorators.text) {
          decorator.visitTouching(offset, after + 0.5, decoration => {
            let from = Math.max(offset, Offset(decoration.from));
            const to = Math.min(after, Offset(decoration.to));
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
        if (offset === line.to)
          break;
        if (!iterator.after)
          throw new Error('Inconsistent');
        iterator.next();
      }

      const lineStyles = [];
      for (let decorator of decorators.lines) {
        // We deliberately do not include |line.start| here
        // to allow line decorations to span the whole line without
        // affecting the next one.
        if (decorator.countTouching(line.start + 0.5, line.end + 0.5) > 0)
          lineStyles.push(decorator.style());
      }
      frame.lines.push({
        first: this._text.offsetToPosition(line.start).line,
        last: this._text.offsetToPosition(line.end).line,
        y: line.y,
        styles: lineStyles
      });

      for (let decorator of decorators.background) {
        // Expand by a single character which is not visible to account for borders
        // extending past viewport.
        decorator.visitTouching(line.from - 1, line.to + 1, decoration => {
          // TODO: note that some editors only show selection up to line length. Setting?
          let from = Offset(decoration.from);
          from = from < line.from ? frame.lineLeft : offsetToX[from - line.from];
          let to = Offset(decoration.to);
          to = to > line.to ? frame.lineRight : offsetToX[to - line.from];
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
   * @param {!{ratio: number, minDecorationHeight: number}} scrollbarParams
   */
  _buildFrameScrollbar(frame, decorators, {ratio, minDecorationHeight}) {
    for (let decorator of decorators.lines) {
      let lastTop = -1;
      let lastBottom = -1;
      decorator.sparseVisitAll(decoration => {
        const from = this.offsetToPoint(Offset(decoration.from)).y;
        const to = this.offsetToPoint(Offset(decoration.to)).y;

        const top = from * ratio;
        let bottom = (to + frame.lineHeight) * ratio;
        bottom = Math.max(bottom, top + minDecorationHeight);

        if (top <= lastBottom) {
          lastBottom = bottom;
        } else {
          if (lastTop >= 0)
            frame.scrollbar.push({y: lastTop, height: lastBottom - lastTop, style: decorator.style()});
          lastTop = top;
          lastBottom = bottom;
        }

        const nextOffset = this.pointToOffset({x: 0, y: bottom / ratio });
        return Math.max(Offset(decoration.to), nextOffset);
      });
      if (lastTop >= 0)
        frame.scrollbar.push({y: lastTop, height: lastBottom - lastTop, style: decorator.style()});
    }
  }
};

Markup.Events = {
  Changed: 'changed',
  MarkCleared: 'markCleared',
};

/**
 * @param {!Array<!Range>} ranges
 * @param {!Document} document
 * @return {!Array<!VisibleRange>}
 */
function joinRanges(ranges, document) {
  let totalRange = 0;
  for (let range of ranges)
    totalRange += range.to - range.from;
  const diffs = [];
  for (let i = 0; i < ranges.length - 1; i++)
    diffs[i] = {i, len: ranges[i + 1].from - ranges[i].to};
  diffs.sort((a, b) => a.len - b.len || a.i - b.i);
  const join = new Array(ranges.length).fill(false);
  let remaining = totalRange * 0.5;
  for (let diff of diffs) {
    remaining -= diff.len;
    if (remaining < 0)
      break;
    join[diff.i] = true;
  }

  const result = [];
  for (let i = 0; i < ranges.length; i++) {
    if (i && join[i - 1])
      result[result.length - 1].to = ranges[i].to;
    else
      result.push(new VisibleRange(document, ranges[i].from, ranges[i].to));
  }
  return result;
}

/**
 * @param {!Anchor} anchor
 * @return {number}
 */
function Offset(anchor) {
  return Math.floor(anchor);
}

const kDefaultChunkSize = 1000;

Markup.test = {};

/**
 * @param {!Markup} markup
 * @param {number} chunkSize
 */
Markup.test.rechunk = function(markup, chunkSize) {
  let nodes = markup._createNodes(markup._text, 0, markup._text.length(), chunkSize);
  markup._setTree(Tree.build(nodes));
};
