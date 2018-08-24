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

    /** @type {!Array<!Line>} */
    const lines = [];
    /** @type {!Array<!Range>} */
    const ranges = [];

    let y = this.offsetToPoint(this.pointToOffset({x: rect.left, y: rect.top})).y;
    for (; y <= rect.top + rect.height; y += this._lineHeight) {
      const iterator = this._tree.iterator();
      const clamped = iterator.locateByPoint({x: rect.left / this._defaultWidth, y: y / this._lineHeight}, false /* strict */);

      if (iterator.before === undefined)
        iterator.next();
      if (iterator.before === undefined) {
        // Tree is empty - bail out.
        lines.push({x: 0, y: 0, from: 0, to: 0, start: 0, end: 0, ranges: [{from: 0, to: 0, x:0}]});
        break;
      }

      let {offset, x} = iterator.before;
      let textChunk = null;
      if (iterator.metrics !== undefined) {
        textChunk = this._text.content(offset, offset + iterator.metrics.length);
        const location = this._metrics.locateByPoint(textChunk, iterator.before, clamped, RoundMode.Floor, false /* strict */);
        offset = location.offset;
        x = location.x;
      } else {
        if (iterator.before.y < y / this._lineHeight)
          break;
      }
      x *= this._defaultWidth;

      const line = {
        x: x,
        y: y,
        from: offset,
        to: offset,
        start: this.pointToOffset({x: 0, y: y}),
        end: this.pointToOffset({x: this._contentWidth, y: y}),
        ranges: []
      };
      lines.push(line);
      if (iterator.after === undefined) {
        line.ranges.push({from: offset, to: offset, x: x});
        break;
      }

      while (x <= rect.left + rect.width) {
        if (iterator.data === false) {
          if (iterator.before.x !== iterator.after.x)
            throw new Error('Inconsistent');
        } else {
          let after = iterator.after.offset;
          let overflow = false;
          const point = {x: (rect.left + rect.width) / this._defaultWidth, y: y / this._lineHeight};
          if (iterator.after.y > point.y || (iterator.after.y === point.y && iterator.after.x >= point.x)) {
            if (textChunk === null)
              textChunk = this._text.content(offset, offset + iterator.metrics.length);
            after = this._metrics.locateByPoint(textChunk, iterator.before, point, RoundMode.Ceil, false /* strict */).offset;
            overflow = true;
          }
          textChunk = null;

          ranges.push({from: offset, to: after});
          if (line.ranges.length > 0 && line.ranges[line.ranges.length - 1].to === offset)
            line.ranges[line.ranges.length - 1].to = after;
          else
            line.ranges.push({from: offset, to: after, x: x});
          if (overflow)
            break;
        }
        iterator.next();
        x = iterator.before.x * this._defaultWidth;
        offset = iterator.before.offset;
        if (iterator.after === undefined)
          break;
      }

      if (line.ranges.length)
        line.to = line.ranges[line.ranges.length - 1].to;
    }

    const joined = joinRanges(ranges, this._document);
    const totalRange = joined.length ? {from: joined[0].from, to: joined[joined.length - 1].to} : {from: 0, to: 0};
    const visibleContent = {
      document: this._document,
      range: totalRange,
      ranges: joined,
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
   * @param {!Array<!Line>} lines
   * @param {!DecorationResult} decorators
   */
  _buildFrameContents(frame, lines, decorators) {
    for (let line of lines) {
      for (let range of line.ranges) {
        const offsetToX = new Float32Array(range.to - range.from + 1);
        const needsRtlBreakAfter = new Int8Array(range.to - range.from + 1);
        const rangeContent = this._text.content(range.from, range.to);
        this._metrics.fillXMap(
            offsetToX, needsRtlBreakAfter, rangeContent,
            0, range.to - range.from + 1,
            range.x, this._defaultWidth);
        offsetToX[0] = range.x;
        needsRtlBreakAfter[range.to - range.from] = 0;

        for (let decorator of decorators.text) {
          decorator.visitTouching(range.from, range.to + 0.5, decoration => {
            let from = Math.max(range.from, Offset(decoration.from));
            const to = Math.min(range.to, Offset(decoration.to));
            while (from < to) {
              let end = from + 1;
              while (end < to && !needsRtlBreakAfter[end - range.from])
                end++;
              frame.text.push({
                x: offsetToX[from - range.from],
                y: line.y,
                content: rangeContent.substring(from - range.from, end - range.from),
                style: decoration.data
              });
              from = end;
            }
          });
        }

        for (let decorator of decorators.background) {
          // Expand by a single character which is not visible to account for borders
          // extending past viewport.
          decorator.visitTouching(range.from - 1, range.to + 1, decoration => {
            let from = Offset(decoration.from);
            from = frame < line.start ? frame.lineLeft : offsetToX[Math.max(from, range.from) - range.from];
            let to = Offset(decoration.to);
            to = to > line.end ? frame.lineRight : offsetToX[Math.min(to, range.to) - range.from];
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

/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   from: number,
 *   to: number,
 *   start: number,
 *   end: number,
 *   ranges: !Array<{from: number, to: number, x: number}>
 * }} Line
 */

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
