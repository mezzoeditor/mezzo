import { EventEmitter } from '../utils/EventEmitter.mjs';
import { Document } from '../text/Document.mjs';
import { RoundMode, Metrics } from './Metrics.mjs';
import { Tree } from './Tree.mjs';
import { VisibleRange } from './Frame.mjs';
import { WorkAllocator } from '../utils/WorkAllocator.mjs';
import { RangeTree } from '../utils/RangeTree.mjs';

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
   * Used for fast-path calculations. If non-null, must also match the new lines.
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

export const WrappingMode = {
  None: 0,
  Line: 1,
  Word: 2,
}

export class Markup extends EventEmitter {
  /**
   * @param {!Measurer} measurer
   * @param {!Document} document
   * @param {!PlatformSupport} platformSupport
   */
  constructor(measurer, document, platformSupport) {
    super();
    this._document = document;
    this._document.on(Document.Events.Changed, ({replacements}) => {
      if (!replacements.length)
        return;
      if (this._frozen)
        throw new Error('Document modification during decoration is prohibited');
      for (const replacement of replacements)
        this._replace(replacement);
      this._rechunkLastFrameRange();
    });
    this._text = document.text();
    this._platformSupport = platformSupport;

    this._frozen = false;
    this._wrappingMode = WrappingMode.None;
    this._wrappingLimit = null;
    this._contentWidth = 0;
    this._contentHeight = 0;
    // All the undone ranges in allocator have character-adjusted boundaries,
    // meaning they do not split surrogate pairs.
    this._allocator = new WorkAllocator(0);
    this._hiddenRanges = new RangeTree(false /* createHandles */);
    this._jobId = 0;
    this._lastFrameRange = {from: 0, to: 0};
    this._tree = new Tree();

    this._measurer = null;
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
    this._recreateMetrics();
  }

  _recreateMetrics() {
    const measure = s => this._measurer.measureString(s) / this._defaultWidth;
    if (this._wrappingMode === WrappingMode.None) {
      this._metrics = Metrics.createRegular(this._measurer.defaultWidthRegex(), measure, measure);
    } else if (this._wrappingMode === WrappingMode.Line) {
      this._metrics = Metrics.createLineWrapping(
        this._measurer.defaultWidthRegex(), measure, measure, this._wrappingLimit);
    } else {
      this._metrics = Metrics.createWordWrapping(
        this._measurer.defaultWidthRegex(), measure, measure, this._wrappingLimit);
    }
    this._allocator = new WorkAllocator(this._text.length());
    this._rechunkLastFrameRange();
  }

  /**
   * @param {!WrappingMode} wrappingMode
   * @param {number?} wrappingLimit
   */
  setWrappingMode(wrappingMode, wrappingLimit) {
    if (wrappingLimit !== null)
    wrappingLimit /= this._defaultWidth;
    if (this._wrappingMode === wrappingMode && this._wrappingLimit === wrappingLimit)
      return;

    // This is an approximation of "max character width".
    if (wrappingLimit !== null && wrappingLimit < 2)
      throw new Error('Word wrap line width cannot be too small');

    this._wrappingMode = wrappingMode;
    this._wrappingLimit = wrappingLimit;
    this._recreateMetrics();
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
   * @param {!Anchor} from
   * @param {!Anchor} to
   */
  hideRange(from, to) {
    if (this._hiddenRanges.countTouching(from, to))
      throw new Error('Hidden ranges cannot intersect');
    this._hiddenRanges.add(from, to, null);
    this._allocator.undone(Offset(from), Offset(to));
    this._rechunkLastFrameRange();
  }

  /**
   * @param {!Replacement} replacement
   */
  _replace(replacement) {
    const from = replacement.offset;
    const to = from + replacement.removed.length();
    const inserted = replacement.inserted.length();
    this._lastFrameRange = this._rebaseLastFrameRange(this._lastFrameRange, from, to, inserted);
    this._text = replacement.after;
    this._allocator.replace(from, to, inserted);
    this._hiddenRanges.replace(from, to, inserted);

    const split = this._tree.split(from, to);
    const newFrom = split.left.metrics().length;
    const newTo = this._text.length() - split.right.metrics().length;

    // This is a heuristic to most likely cover the word at the editing boundary
    // which ensures proper wrapping. Otherwise the chunk may split the word
    // in the middle and calculate the wrapping incorrectly.
    let undoneFrom = newFrom;
    let undoneTo = newTo;
    let tmp = split.right.splitFirst();
    if (tmp.first !== null)
      undoneTo = newTo + tmp.metrics.length;
    tmp = split.left.splitLast();
    if (tmp.last !== null)
      undoneFrom = newFrom - tmp.metrics.length;
    this._allocator.undone(undoneFrom, undoneTo);

    const nodes = [];
    if (newFrom !== newTo)
      nodes.push(this._unmeasuredNode(newTo - newFrom));
    this._tree = Tree.merge(split.left, Tree.merge(Tree.build(nodes), split.right));
  }

  /**
   * @param {!Range} r
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   * @return {!Range}
   */
  _rebaseLastFrameRange(r, from, to, inserted) {
    if (r.from >= to) {
      const delta = inserted - (to - from);
      return { from: r.from + delta, to: r.to + delta };
    }
    return r;
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
    if (iterator.data === undefined || !iterator.data.metrics)
      return iterator.before ? iterator.before.offset : 0;
    let from = iterator.before.offset;
    let textChunk = this._text.content(from, from + iterator.metrics.length);
    return iterator.data.metrics.locateByPoint(textChunk, iterator.data.stateBefore, iterator.before, clamped, roundMode, strict).offset;
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
    if (iterator.data === undefined || !iterator.data.metrics)
      return iterator.before || {x: 0, y: 0};
    let from = iterator.before.offset;
    let textChunk = this._text.content(from, from + iterator.metrics.length);
    return iterator.data.metrics.locateByOffset(textChunk, iterator.data.stateBefore, iterator.before, offset);
  }

  _rechunkLastFrameRange() {
    this._rechunk(this._lastFrameRange.from, this._lastFrameRange.to);
  }

  _rechunkEverything() {
    this._rechunk(0, this._text.length());
  }

  /**
   * @param {number} rechunkFrom
   * @param {number} rechunkTo
   */
  _rechunk(rechunkFrom, rechunkTo) {
    let budget = this._wrappingMode === WrappingMode.None ? kRechunkSize : kWrappingRechunkSize;
    let range = null;
    while (budget > 0 && (range = this._allocator.workRange(rechunkFrom, rechunkTo))) {
      let {from, to} = range;
      if (to - from > budget)
        to = from + budget;
      range = this._rechunkRange(from, to, budget);
      budget -= range.to - range.from;
    }

    const metrics = this._tree.metrics();
    this._contentWidth = metrics.longestWidth * this._defaultWidth;
    this._contentHeight = (1 + (metrics.lineBreaks || 0)) * this._lineHeight;
    this.emit(Markup.Events.Changed);

    if (!this._jobId && this._allocator.hasWork()) {
      this._jobId = this._platformSupport.requestIdleCallback(() => {
        this._jobId = 0;
        this._rechunkEverything();
      });
    }
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {number} budget
   * @return {!Range}
   */
  _rechunkRange(from, to, budget) {
    const split = this._tree.split(from, to);
    let newFrom = split.left.metrics().length;
    let newTo = this._text.length() - split.right.metrics().length;

    // Do not rechunk too much.
    let correction = null;
    if (newTo > newFrom + budget + 2 * kChunkSize) {
      correction = newTo;
      newTo = newFrom + budget;
    }
    if (newTo > newFrom && Metrics.isSurrogate(this._text.iterator(newTo - 1).charCodeAt(0)))
      newTo++;

    /** @type {!Array<!{metrics: !TextMetrics, data: !ChunkData}>} */
    const nodes = [];
    const iterator = this._text.iterator(newFrom, newFrom, newTo);
    let tmp = split.left.splitLast();
    let state = tmp.last !== null ? tmp.last.stateAfter : undefined;

    const hiddenRanges = [{from: newFrom, to: newFrom}];
    hiddenRanges.push(...this._hiddenRanges.listTouching(newFrom, newTo));
    hiddenRanges.push({from: newTo + 0.5, to: newTo + 0.5});
    for (let hiddenIndex = 0; hiddenIndex < hiddenRanges.length - 1; hiddenIndex++) {
      const rangeFrom = Offset(hiddenRanges[hiddenIndex].to);
      if (iterator.offset < rangeFrom) {
        nodes.push(this._unmeasuredNode(rangeFrom - iterator.offset));
        iterator.reset(rangeFrom);
      }
      const rangeTo = Offset(hiddenRanges[hiddenIndex + 1].from);
      while (iterator.offset < rangeTo) {
        const size = Math.min(rangeTo - iterator.offset, kChunkSize);
        let chunk = iterator.read(size);
        if (Metrics.isSurrogate(chunk.charCodeAt(chunk.length - 1))) {
          if (iterator.offset === newTo)
            throw new Error('Inconsistent');
          chunk += iterator.current;
          iterator.next();
        }
        const measured = this._metrics.forString(chunk, state);
        nodes.push({metrics: measured.metrics, data: {metrics: this._metrics, stateBefore: state, stateAfter: measured.state}});
        state = measured.state;
      }
    }

    if (correction !== null && correction > newTo) {
      nodes.push(this._unmeasuredNode(correction - newTo));
    } else {
      // Mark next chunk as undone if metrics have to be recalculated
      // because of the new state before produced by last chunk.
      tmp = split.right.splitFirst();
      if (tmp.first !== null && (tmp.first.metrics !== this._metrics || !Metrics.stateMatches(tmp.first.stateBefore, state)))
        this._allocator.undone(newTo, newTo + tmp.metrics.length);
    }

    this._tree = Tree.merge(split.left, Tree.merge(Tree.build(nodes), split.right));
    this._allocator.done(newFrom, newTo);
    return { from: newFrom, to: newTo };
  }

  /**
   * @param {number} length
   * @return {{metrics: !TextMetrics, data: ChunkData}}
   */
  _unmeasuredNode(length) {
    return {
      metrics: {length, firstWidth: 0, lastWidth: 0, longestWidth: 0},
      data: {metrics: null, stateBefore: null, stateAfter: null}
    };
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
        lines.push({x: 0, y: 0, from: 0, to: 0, start: 0, end: 0, ranges: [{from: 0, to: 0, x: 0, metrics: this._metrics}]});
        break;
      }

      let {offset, x} = iterator.before;
      let textChunk = null;
      if (iterator.metrics !== undefined) {
        textChunk = this._text.content(offset, offset + iterator.metrics.length);
        const location = iterator.data.metrics.locateByPoint(textChunk, iterator.data.stateBefore, iterator.before, clamped, RoundMode.Floor, false /* strict */);
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
        line.ranges.push({from: offset, to: offset, x: x, metrics: this._metrics});
        break;
      }

      while (x <= rect.left + rect.width) {
        if (!iterator.data.metrics) {
          if (iterator.before.x !== iterator.after.x)
            throw new Error('Inconsistent');
        } else {
          let after = iterator.after.offset;
          let overflow = false;
          const point = {x: (rect.left + rect.width) / this._defaultWidth, y: y / this._lineHeight};
          if (iterator.after.y > point.y || (iterator.after.y === point.y && iterator.after.x >= point.x)) {
            if (textChunk === null)
              textChunk = this._text.content(offset, offset + iterator.metrics.length);
            after = iterator.data.metrics.locateByPoint(textChunk, iterator.data.stateBefore, iterator.before, point, RoundMode.Ceil, false /* strict */).offset;
            overflow = true;
          }
          textChunk = null;

          ranges.push({from: offset, to: after});
          let canJoin = false;
          if (line.ranges.length > 0) {
            const prev = line.ranges[line.ranges.length - 1];
            if (prev.to === offset && prev.metrics === iterator.data.metrics)
              canJoin = true;
          }
          if (canJoin)
            line.ranges[line.ranges.length - 1].to = after;
          else
            line.ranges.push({from: offset, to: after, x: x, metrics: iterator.data.metrics});
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
    this._lastFrameRange = totalRange;
  }

  /**
   * @param {!Frame} frame
   * @param {!Array<!Line>} lines
   * @param {!DecorationResult} decorators
   */
  _buildFrameContents(frame, lines, decorators) {
    for (let line of lines) {
      let rangeIndex = 0;
      for (let {from, to, x, metrics} of line.ranges) {
        const offsetToX = new Float32Array(to - from + 1);
        const needsRtlBreakAfter = new Int8Array(to - from + 1);
        const rangeContent = this._text.content(from, to);
        metrics.fillXMap(offsetToX, needsRtlBreakAfter, rangeContent, x, this._defaultWidth);

        for (let decorator of decorators.text) {
          decorator.visitTouching(from, to + 0.5, decoration => {
            let dFrom = Math.max(from, Offset(decoration.from));
            const dTo = Math.min(to, Offset(decoration.to));
            while (dFrom < dTo) {
              let end = dFrom + 1;
              while (end < dTo && !needsRtlBreakAfter[end - from])
                end++;
              frame.text.push({
                x: offsetToX[dFrom - from],
                y: line.y,
                content: rangeContent.substring(dFrom - from, end - from),
                style: decoration.data
              });
              dFrom = end;
            }
          });
        }

        const rangeLeft = rangeIndex === 0 ? frame.lineLeft : offsetToX[0];
        const rangeRight = rangeIndex === line.ranges.length - 1 ? frame.lineRight : offsetToX[to - from];
        for (let decorator of decorators.background) {
          // Expand by a single character which is not visible to account for borders
          // extending past viewport.
          decorator.visitTouching(from - 1, to + 1, decoration => {
            let dFrom = Offset(decoration.from);
            let left = dFrom < line.start ? rangeLeft : offsetToX[Math.max(dFrom, from) - from];
            let dTo = Offset(decoration.to);
            let right = dTo > line.end ? rangeRight : offsetToX[Math.min(dTo, to) - from];
            if (left <= right) {
              frame.background.push({
                x: left,
                y: line.y,
                width: right - left,
                style: decoration.data
              });
            }
          });
        }
        rangeIndex++;
      }

      const lineStyles = new Set();
      for (let decorator of decorators.lines) {
        // We deliberately do not include |line.start| here
        // to allow line decorations to span the whole line without
        // affecting the next one.
        if (decorator.countTouching(line.start + 0.5, line.end + 0.5) > 0)
          lineStyles.add(decorator.style());
      }
      frame.lines.push({
        first: this._text.offsetToPosition(line.start).line,
        last: this._text.offsetToPosition(line.end).line,
        y: line.y,
        styles: Array.from(lineStyles)
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
 * @typedef {{metrics: !Metrics, stateBefore: *, stateAfter: *}} ChunkData
 * Null metrics means unmeasured chunk.
 */

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
 *   ranges: !Array<{from: number, to: number, x: number, metrics: !Metrics}>
 * }} Line
 */

let kChunkSize = 1000;
let kRechunkSize = 10000000;
let kWrappingRechunkSize = 5000000;

Markup.test = {};

/**
 * @param {!Markup} markup
 * @param {number} chunkSize
 * @param {number=} rechunkSize
 */
Markup.test.rechunk = function(markup, chunkSize, rechunkSize) {
  let oldChunkSize = kChunkSize;
  kChunkSize = chunkSize;
  let oldRechunkSize = kRechunkSize;
  kRechunkSize = rechunkSize || markup._text.length();
  markup._allocator.undone(0, markup._text.length());
  markup._rechunkEverything();
  kChunkSize = oldChunkSize;
  kRechunkSize = oldRechunkSize;
};
