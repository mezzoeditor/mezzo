import { TreeFactory } from '../utils/OrderedMonoidTree.js';
import { TextUtils } from '../text/TextUtils.js';
import { TextMetricsMonoid } from '../text/TextMetrics.js';
import { EventEmitter } from '../utils/EventEmitter.js';
import { Document } from '../text/Document.js';
import { RoundMode } from '../utils/RoundMode.js';
import { TextMeasurer, WordWrappingTextMeasurer, LineWrappingTextMeasurer } from '../text/TextMeasurer.js';
import { FrameContent, VisibleRange } from './Frame.js';
import { WorkAllocator } from '../utils/WorkAllocator.js';
import { RangeTree } from '../utils/RangeTree.js';

/** @enum {number} */
export const WrappingMode = {
  None: 0,
  Line: 1,
  Word: 2,
}

/**
 * @type {Mezzo.TreeFactory<ChunkData, Mezzo.TextMetrics, Mezzo.TextLookupKey>}
 */
const treeFactory = new TreeFactory(new TextMetricsMonoid());

export class Markup extends EventEmitter {
  /**
   * @param {Mezzo.Measurer} measurer
   * @param {Document} document
   * @param {Mezzo.PlatformSupport} platformSupport
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
    /** @type {Mezzo.TextMeasurerBase<number|undefined>} */
    this._textMeasurer;
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
    /** @type {Mezzo.Tree<ChunkData, Mezzo.TextLookupKey, Mezzo.TextMetrics>} */
    this._tree = treeFactory.build([], []);

    this._externalMeasurer = null;
    this.setMeasurer(measurer);
  }

  /**
   * @param {Mezzo.Measurer} measurer
   */
  setMeasurer(measurer) {
    if (this._externalMeasurer === measurer)
      return;
    this._externalMeasurer = measurer;
    this._lineHeight = measurer.lineHeight();
    this._defaultWidth = measurer.defaultWidth();
    this._recreateTextMeasurer();
  }

  _recreateTextMeasurer() {
    const measure = s => this._externalMeasurer.measureString(s) / this._defaultWidth;
    if (this._wrappingMode === WrappingMode.None) {
      this._textMeasurer = new TextMeasurer(this._externalMeasurer.defaultWidthRegex(), measure, measure);
    } else if (this._wrappingMode === WrappingMode.Line) {
      this._textMeasurer = new LineWrappingTextMeasurer(
          this._externalMeasurer.defaultWidthRegex(), measure, measure, this._wrappingLimit);
    } else {
      this._textMeasurer = new WordWrappingTextMeasurer(
          this._externalMeasurer.defaultWidthRegex(), measure, measure, this._wrappingLimit);
    }
    this._allocator = new WorkAllocator(this._text.length());
    this._rechunkLastFrameRange();
  }

  /**
   * @param {WrappingMode} wrappingMode
   * @param {?number} wrappingLimit
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
    this._recreateTextMeasurer();
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
   * @param {Mezzo.Anchor} from
   * @param {Mezzo.Anchor} to
   */
  hideRange(from, to) {
    if (this._hiddenRanges.countTouching(from, to))
      throw new Error('Hidden ranges cannot intersect');
    this._hiddenRanges.add(from, to, null);
    this._allocator.undone(Offset(from), Offset(to));
    this._rechunkLastFrameRange();
  }

  /**
   * @param {Mezzo.Replacement} replacement
   */
  _replace(replacement) {
    const from = replacement.offset;
    const to = from + replacement.removed.length();
    const inserted = replacement.inserted.length();
    this._lastFrameRange = this._rebaseLastFrameRange(this._lastFrameRange, from, to, inserted);
    this._text = replacement.after;
    this._allocator.replace(from, to, inserted);
    this._hiddenRanges.replace(from, to, inserted);

    const split = this._tree.split({offset: from}, {offset: to});
    const newFrom = split.left.value().length;
    const newTo = this._text.length() - split.right.value().length;

    // This is a heuristic to most likely cover the word at the editing boundary
    // which ensures proper wrapping. Otherwise the chunk may split the word
    // in the middle and calculate the wrapping incorrectly.
    let undoneFrom = newFrom;
    let undoneTo = newTo;
    let tmp = split.right.first();
    if (tmp.value !== null)
      undoneTo = newTo + tmp.value.length;
    tmp = split.left.last();
    if (tmp.value !== null)
      undoneFrom = newFrom - tmp.value.length;
    this._allocator.undone(undoneFrom, undoneTo);

    let middle;
    if (newFrom !== newTo) {
      middle = treeFactory.build([kUnmeasuredData], [this._textMeasurer.unmappedValue(newTo - newFrom)]);
    } else {
      middle = treeFactory.build([], []);
    }
    /** @type {Mezzo.Tree<ChunkData, Mezzo.TextLookupKey, Mezzo.TextMetrics>} */
    this._tree = treeFactory.merge(split.left, treeFactory.merge(middle, split.right));
  }

  /**
   * @param {Mezzo.Range} r
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   * @return {Mezzo.Range}
   */
  _rebaseLastFrameRange(r, from, to, inserted) {
    if (r.from >= to) {
      const delta = inserted - (to - from);
      return { from: r.from + delta, to: r.to + delta };
    }
    return r;
  }

  /**
   * @param {Mezzo.Point} point
   * @param {RoundMode} roundMode
   * @return {number}
   */
  pointToOffset(point, roundMode = RoundMode.Floor) {
    return this._virtualPointToOffset({
      x: point.x / this._defaultWidth,
      y: point.y / this._lineHeight
    }, roundMode);
  }

  /**
   * @param {Mezzo.Point} point
   * @param {RoundMode} roundMode
   * @return {number}
   */
  _virtualPointToOffset(point, roundMode) {
    point = this._clampVirtualPoint(point);
    const iterator = this._tree.iterator();
    iterator.locate(point);
    if (iterator.data === undefined || !iterator.data.measurer)
      return iterator.before ? iterator.before.length : 0;
    const from = iterator.before.length;
    const textChunk = this._text.content(from, from + iterator.value.length);
    return iterator.data.measurer.locateByPoint(textChunk, iterator.data.stateBefore, iterator.before, point, roundMode).offset;
  }

  /**
   * @param {number} offset
   * @return {Mezzo.Point}
   */
  offsetToPoint(offset) {
    const point = this._offsetToVirtualPoint(offset);
    return {x: point.x * this._defaultWidth, y: point.y * this._lineHeight};
  }

  /**
   * @param {number} offset
   * @return {Mezzo.Point}
   */
  _offsetToVirtualPoint(offset) {
    offset = Math.max(0, Math.min(offset, this._text.length()));
    const iterator = this._tree.iterator();
    iterator.locate({offset});
    if (iterator.data === undefined || !iterator.data.measurer) {
      if (iterator.before)
        return {y: iterator.before.lineBreaks || 0, x: iterator.before.lastWidth};
      return {x: 0, y: 0};
    }
    const from = iterator.before.length;
    const textChunk = this._text.content(from, from + iterator.value.length);
    return iterator.data.measurer.locateByOffset(textChunk, iterator.data.stateBefore, iterator.before, offset);
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

    const metrics = this._tree.value();
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
   * @return {Mezzo.Range}
   */
  _rechunkRange(from, to, budget) {
    const split = this._tree.split({offset: from}, {offset: to});
    let newFrom = split.left.value().length;
    let newTo = this._text.length() - split.right.value().length;

    // Do not rechunk too much.
    let correction = null;
    if (newTo > newFrom + budget + 2 * kChunkSize) {
      correction = newTo;
      newTo = newFrom + budget;
    }
    if (newTo > newFrom && TextUtils.isSurrogate(this._text.iterator(newTo - 1).charCodeAt(0)))
      newTo++;

    /** @type {Array<Mezzo.TextMetrics>} */
    const values = [];
    /** @type {Array<ChunkData>} */
    const data = [];

    const stateTraits = this._textMeasurer.stateTraits();
    const iterator = this._text.iterator(newFrom, newFrom, newTo);
    let tmp = split.left.last();
    let state = undefined;
    if (tmp.data !== null && tmp.data.measurer === this._textMeasurer) {
      state = tmp.data.stateAfter;
    } else if (stateTraits) {
      state = stateTraits.emptyState();
    }

    const hiddenRanges = [{from: newFrom, to: newFrom}];
    hiddenRanges.push(...this._hiddenRanges.listTouching(newFrom, newTo));
    hiddenRanges.push({from: newTo + 0.5, to: newTo + 0.5});
    for (let hiddenIndex = 0; hiddenIndex < hiddenRanges.length - 1; hiddenIndex++) {
      const rangeFrom = Offset(hiddenRanges[hiddenIndex].to);
      if (iterator.offset < rangeFrom) {
        data.push(kUnmeasuredData);
        values.push(this._textMeasurer.unmappedValue(rangeFrom - iterator.offset));
        iterator.reset(rangeFrom);
      }
      const rangeTo = Offset(hiddenRanges[hiddenIndex + 1].from);
      while (iterator.offset < rangeTo) {
        const size = Math.min(rangeTo - iterator.offset, kChunkSize);
        let chunk = iterator.read(size);
        if (TextUtils.isSurrogate(chunk.charCodeAt(chunk.length - 1))) {
          if (iterator.offset === newTo)
            throw new Error('Inconsistent');
          chunk += iterator.current;
          iterator.next();
        }
        const mapped = this._textMeasurer.mapValue(chunk, state);
        data.push({measurer: this._textMeasurer, stateBefore: state, stateAfter: mapped.state});
        values.push(mapped.value);
        state = mapped.state;
      }
    }

    if (correction !== null && correction > newTo) {
      data.push(kUnmeasuredData);
      values.push(this._textMeasurer.unmappedValue(correction - newTo));
    } else {
      // Mark next chunk as undone if metrics have to be recalculated
      // because of the new state before produced by last chunk.
      tmp = split.right.first();
      let stateChanged = false;
      if (tmp.data !== null) {
        if (tmp.data.measurer !== this._textMeasurer)
          stateChanged = true;
        else if (stateTraits && !stateTraits.statesAreEqual(tmp.data.stateBefore, state))
          stateChanged = true;
      }
      if (stateChanged)
        this._allocator.undone(newTo, newTo + tmp.value.length);
    }

    this._tree = treeFactory.merge(split.left, treeFactory.merge(treeFactory.build(data, values), split.right));
    this._allocator.done(newFrom, newTo);
    return { from: newFrom, to: newTo };
  }

  /**
   * @param {Mezzo.Point} point
   * @return {Mezzo.Point}
   */
  _clampVirtualPoint(point) {
    if (point.y < 0)
      return {x: 0, y: 0};
    if (point.x < 0)
      return {x: 0, y: point.y};
    const metrics = this._tree.value();
    const max = {y: metrics.lineBreaks || 0, x: metrics.lastWidth};
    if (point.y > max.y)
      return max;
    return point;
  }

  /**
   * @param {Mezzo.Frame} frame
   * @param {{left: number, top: number, width: number, height: number}} rect
   * @param {{ratio: number, minDecorationHeight: number}} scrollbarParams
   * @param {Array<Mezzo.FrameDecorationCallback>} decorationCallbacks
   */
  buildFrame(frame, rect, scrollbarParams, decorationCallbacks) {
    this._frozen = true;

    frame.lineHeight = this._lineHeight;

    /** @type {Array<Line>} */
    const lines = [];
    /** @type {Array<Mezzo.Range>} */
    const ranges = [];

    let y = this.offsetToPoint(this.pointToOffset({x: rect.left, y: rect.top})).y;
    for (; y <= rect.top + rect.height; y += this._lineHeight) {
      const iterator = this._tree.iterator();
      const point = this._clampVirtualPoint({x: rect.left / this._defaultWidth, y: y / this._lineHeight});
      iterator.locate(point);

      if (iterator.before === undefined)
        iterator.next();
      if (iterator.before === undefined) {
        // Tree is empty - bail out.
        lines.push({x: 0, y: 0, from: 0, to: 0, start: 0, end: 0, ranges: [{from: 0, to: 0, x: 0, measurer: this._textMeasurer}]});
        break;
      }

      let offset = iterator.before.length;
      let x = iterator.before.lastWidth;
      let textChunk = null;
      if (iterator.value !== undefined) {
        if (iterator.data.measurer) {
          textChunk = this._text.content(offset, offset + iterator.value.length);
          const location = iterator.data.measurer.locateByPoint(textChunk, iterator.data.stateBefore, iterator.before, point, RoundMode.Floor);
          offset = location.offset;
          x = location.x;
        }
      } else {
        if ((iterator.before.lineBreaks || 0) < y / this._lineHeight)
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
        line.ranges.push({from: offset, to: offset, x: x, measurer: this._textMeasurer});
        break;
      }

      while (x <= rect.left + rect.width) {
        if (!iterator.data.measurer) {
          if (iterator.before.lastWidth !== iterator.after.lastWidth)
            throw new Error('Inconsistent');
        } else {
          let after = iterator.after.length;
          let overflow = false;
          const point = {x: (rect.left + rect.width) / this._defaultWidth, y: y / this._lineHeight};
          const afterY = iterator.after.lineBreaks || 0;
          if (afterY > point.y || (afterY === point.y && iterator.after.lastWidth >= point.x)) {
            if (textChunk === null)
              textChunk = this._text.content(offset, offset + iterator.value.length);
            after = iterator.data.measurer.locateByPoint(textChunk, iterator.data.stateBefore, iterator.before, point, RoundMode.Ceil).offset;
            overflow = true;
          }
          textChunk = null;

          ranges.push({from: offset, to: after});
          let canJoin = false;
          if (line.ranges.length > 0) {
            const prev = line.ranges[line.ranges.length - 1];
            if (prev.to === offset && prev.measurer === iterator.data.measurer)
              canJoin = true;
          }
          if (canJoin)
            line.ranges[line.ranges.length - 1].to = after;
          else
            line.ranges.push({from: offset, to: after, x: x, measurer: iterator.data.measurer});
          if (overflow)
            break;
        }
        iterator.next();
        x = iterator.before.lastWidth * this._defaultWidth;
        offset = iterator.before.length;
        if (iterator.after === undefined)
          break;
      }

      if (line.ranges.length)
        line.to = line.ranges[line.ranges.length - 1].to;
    }

    const joined = joinRanges(ranges, this._document);
    const totalRange = joined.length ? {from: joined[0].from, to: joined[joined.length - 1].to} : {from: 0, to: 0};

    const frameContent = new FrameContent(this._document);
    frameContent.range = totalRange;
    frameContent.ranges = joined;
    for (const decorationCallback of decorationCallbacks)
      decorationCallback(frameContent);

    this._buildFrameContents(frame, lines, frameContent);
    this._buildFrameScrollbar(frame, frameContent, scrollbarParams);

    this._frozen = false;
    this._lastFrameRange = totalRange;
  }

  /*
   * @return {Mezzo.Range}
   */
  lastFrameRange() {
    return this._lastFrameRange;
  }

  /**
   * @param {Mezzo.Frame} frame
   * @param {Array<Line>} lines
   * @param {FrameContent} frameContent
   */
  _buildFrameContents(frame, lines, frameContent) {
    for (let line of lines) {
      let rangeIndex = 0;
      for (let {from, to, x, measurer} of line.ranges) {
        const offsetToX = new Float32Array(to - from + 1);
        const needsRtlBreakAfter = new Int8Array(to - from + 1);
        const rangeContent = this._text.content(from, to);
        measurer.fillXMap(offsetToX, needsRtlBreakAfter, rangeContent, x, this._defaultWidth);

        for (const ranges of frameContent.textDecorations) {
          ranges.visitTouching(from, to + 0.5, decoration => {
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
        for (const ranges of frameContent.backgroundDecorations) {
          // Expand by a single character which is not visible to account for borders
          // extending past viewport.
          ranges.visitTouching(from - 1, to + 1, decoration => {
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
      for (const {style, ranges} of frameContent.lineDecorations) {
        // We deliberately do not include |line.start| here
        // to allow line decorations to span the whole line without
        // affecting the next one.
        if (ranges.countTouching(line.start + 0.5, line.end + 0.5) > 0)
          lineStyles.add(style);
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
   * @param {Mezzo.Frame} frame
   * @param {FrameContent} frameContent
   * @param {{ratio: number, minDecorationHeight: number}} scrollbarParams
   */
  _buildFrameScrollbar(frame, frameContent, {ratio, minDecorationHeight}) {
    for (const {style, ranges} of frameContent.lineDecorations) {
      let lastTop = -1;
      let lastBottom = -1;
      ranges.sparseVisitAll(decoration => {
        const from = this.offsetToPoint(Offset(decoration.from)).y;
        const to = this.offsetToPoint(Offset(decoration.to)).y;

        const top = from * ratio;
        let bottom = (to + frame.lineHeight) * ratio;
        bottom = Math.max(bottom, top + minDecorationHeight);

        if (top <= lastBottom) {
          lastBottom = bottom;
        } else {
          if (lastTop >= 0)
            frame.scrollbar.push({y: lastTop, height: lastBottom - lastTop, style});
          lastTop = top;
          lastBottom = bottom;
        }

        const nextOffset = this.pointToOffset({x: 0, y: bottom / ratio });
        return Math.max(Offset(decoration.to), nextOffset);
      });
      if (lastTop >= 0)
        frame.scrollbar.push({y: lastTop, height: lastBottom - lastTop, style});
    }
  }
};

Markup.Events = {
  Changed: 'changed',
};

/**
 * @param {Array<Mezzo.Range>} ranges
 * @param {Document} document
 * @return {Array<VisibleRange>}
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
 * @typedef {{measurer: Mezzo.TextMeasurerBase, stateBefore: (undefined|number), stateAfter: (undefined|number)}} ChunkData
 * Null measurer means unmeasured chunk.
 */

/**
 * @param {Mezzo.Anchor} anchor
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
 *   ranges: Array<{from: number, to: number, x: number, measurer: Mezzo.TextMeasurerBase}>
 * }} Line
 */

let kChunkSize = 1000;
let kRechunkSize = 10000000;
let kWrappingRechunkSize = 5000000;

/** @type {ChunkData} */
const kUnmeasuredData = {measurer: null, stateBefore: null, stateAfter: null};

Markup.test = {};

/**
 * @param {Markup} markup
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
