import { LineDecorator, Anchor } from '../core/Decorator.mjs';
import { Tokenizer } from '../core/Tokenizer.mjs';
import { RoundMode } from '../core/Metrics.mjs';

/**
 * @typedef {{
 *   anchor: number,
 *   focus: number,
 *   id: number,
 *   upDownX: number
 * }} SelectionRange;
 */

 /**
  * @param {!SelectionRange} range
  * @return {!Range}
  */
 function toRange(range) {
   return {
     from: Math.min(range.focus, range.anchor),
     to: Math.max(range.focus, range.anchor)
   };
 }

export class Selection {
  /**
   * @param {!Viewport} viewport
   */
  constructor(viewport) {
    this._viewport = viewport;
    this._viewport.addDecorationCallback(this._onDecorate.bind(this));
    this._document = viewport.document();
    this._document.addReplaceCallback(this._onReplace.bind(this));
    this._rangeDecorator = new LineDecorator('selection.range');
    this._focusDecorator = new LineDecorator('selection.focus');
    this._ranges = [];
    this._frozen = 0;
    this._lastId = 0;
    this._staleDecorations = true;
    this._changeCallbacks = [];

    this._nextOccurenceText = null;
    this._nextOccurenceGroupOnly = false;
    this._nextOccurenceSearchOffset = 0;
    this._nextOccurenceSearchEnd = 0;
  }

  // -------- Public API --------

  /**
   * @return {!Array<!Range>}
   */
  ranges() {
    return this._ranges.map(toRange);
  }

  /**
   * @return {boolean}
   */
  hasSingleRange() {
    return this._ranges.length === 1;
  }

  /**
   * @return {?number}
   */
  focus() {
    let range = this._maxRange();
    return range ? range.focus : null;
  }

  /**
   * @return {?number}
   */
  anchor() {
    let range = this._maxRange();
    return range ? range.anchor : null;
  }

  /**
   * @return {?Range}
   */
  range() {
    let range = this._maxRange();
    return range ? toRange(range) : null;
  }

  /**
   * @param {!Array<!Range>} ranges
   */
  setRanges(ranges) {
    if (this._frozen)
      throw new Error('Cannot change selection while frozen');
    this._ranges = this._rebuild(ranges.map(range => ({
      id: ++this._lastId,
      upDownX: -1,
      anchor: range.from,
      focus: range.to
    })));
    this._notifyChanged();
  }

  /**
   * @param {!Range} range
   */
  setLastRange(range) {
    if (this._frozen)
      throw new Error('Cannot change selection while frozen');
    let maxRange = this._maxRange();
    if (!maxRange) {
      this._ranges = [{
        id: ++this._lastId,
        upDownX: -1,
        anchor: range.from,
        focus: range.to
      }];
    } else {
      maxRange.anchor = range.from;
      maxRange.focus = range.to;
      maxRange.upDownX = -1;
    }
    this._ranges = this._rebuild(this._ranges);
    this._notifyChanged();
  }

  /**
   * @param {!Range} range
   */
  addRange(range) {
    if (this._frozen)
      throw new Error('Cannot change selection while frozen');
    this._ranges.push({
      id: ++this._lastId,
      upDownX: -1,
      anchor: range.from,
      focus: range.to
    });
    this._ranges = this._rebuild(this._ranges);
    this._notifyChanged();
  }

  /**
   * @return {*}
   */
  freeze() {
    this._frozen++;
    return this.save();
  }

  /**
   * @param {*} data
   * @param {!Array<!Range>=} ranges
   */
  unfreeze(data, ranges) {
    this._frozen--;
    if (!this._frozen)
      this.restore(data, ranges);
  }

  /**
   * @param {function()} callback
   */
  addChangeCallback(callback) {
    this._changeCallbacks.push(callback);
  }

  /**
   * @param {function()} callback
   */
  removeChangeCallback(callback) {
    let index = this._changeCallbacks.indexOf(callback);
    if (index !== -1)
      this._changeCallbacks.splice(index);
  }

  /**
   * @return {string}
   */
  selectedText() {
    let lines = [];
    for (let range of this._ranges)
      lines.push(this._document.content(Math.min(range.anchor, range.focus), Math.max(range.anchor, range.focus)));
    return lines.join('\n');
  }

  /**
   * @return {boolean}
   */
  collapse() {
    if (this._frozen)
      throw new Error('Cannot change selection while frozen');
    if (this._ranges.length === 0)
      return false;
    if (this._ranges.length > 1) {
      let minRange = null;
      for (let range of this._ranges) {
        if (!minRange || minRange.anchor > range.anchor)
          minRange = range;
      }
      this._ranges = [minRange];
      this._notifyChanged();
      return true;
    }
    let range = this._ranges[0];
    if (range.anchor === range.focus)
      return false;
    range.focus = range.anchor;
    this._notifyChanged();
    return true;
  }

  /**
   * @return {boolean}
   */
  moveUp() {
    return this._operation(range => {
      let offset = Math.min(range.anchor, range.focus);
      let upDownX = range.upDownX;
      if (range.anchor === range.focus) {
        let upResult = this._lineUp(range.focus, range.upDownX);
        offset = upResult.offset;
        upDownX = upResult.upDownX;
      }
      return {id: range.id, upDownX, anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveDown() {
    return this._operation(range => {
      let offset = Math.max(range.anchor, range.focus);
      let upDownX = range.upDownX;
      if (range.anchor === range.focus) {
        let upResult = this._lineDown(range.focus, range.upDownX);
        offset = upResult.offset;
        upDownX = upResult.upDownX;
      }
      return {id: range.id, upDownX, anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveLeft() {
    return this._operation(range => {
      let offset = Math.min(range.anchor, range.focus);
      if (range.anchor === range.focus)
        offset = this._left(range.focus);
      return {id: range.id, upDownX: -1, anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveRight() {
    return this._operation(range => {
      let offset = Math.max(range.anchor, range.focus);
      if (range.anchor === range.focus)
        offset = this._right(range.focus);
      return {id: range.id, upDownX: -1, anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveWordLeft() {
    return this._operation(range => {
      let offset = Tokenizer.leftBoundary(this._document, range.focus - 1);
      return {id: range.id, upDownX: -1, anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveWordRight() {
    return this._operation(range => {
      let offset = Tokenizer.rightBoundary(this._document, range.focus);
      return {id: range.id, upDownX: -1, anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveDocumentStart() {
    return this._operation(range => {
      let offset = 0;
      return {id: range.id, upDownX: -1, anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveDocumentEnd() {
    return this._operation(range => {
      let offset = this._document.length();
      return {id: range.id, upDownX: -1, anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  selectDocumentStart() {
    return this._operation(range => {
      let offset = 0;
      return {id: range.id, upDownX: -1, anchor: range.anchor, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  selectDocumentEnd() {
    return this._operation(range => {
      let offset = this._document.length();
      return {id: range.id, upDownX: -1, anchor: range.anchor, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveLineStart() {
    return this._operation(range => {
      let offset = this._lineStart(range.focus);
      let it = this._document.iterator(offset);
      while (it.current === ' ') it.next();
      if (offset === range.focus)
        offset = it.offset;
      else if (range.focus > it.offset)
        offset = it.offset;
      return {id: range.id, upDownX: -1, anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveLineEnd() {
    return this._operation(range => {
      let offset = this._lineEnd(range.focus);
      return {id: range.id, upDownX: -1, anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  selectUp() {
    return this._operation(range => {
      let {offset, upDownX} = this._lineUp(range.focus, range.upDownX);
      return {id: range.id, upDownX, anchor: range.anchor, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  selectDown() {
    return this._operation(range => {
      let {offset, upDownX} = this._lineDown(range.focus, range.upDownX);
      return {id: range.id, upDownX, anchor: range.anchor, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  selectLeft() {
    return this._operation(range => {
      return {id: range.id, upDownX: -1, anchor: range.anchor, focus: this._left(range.focus)};
    });
  }

  /**
   * @return {boolean}
   */
  selectRight() {
    return this._operation(range => {
      return {id: range.id, upDownX: -1, anchor: range.anchor, focus: this._right(range.focus)};
    });
  }

  /**
   * @return {boolean}
   */
  selectWordLeft() {
    return this._operation(range => {
      return {id: range.id, upDownX: -1, anchor: range.anchor, focus: Tokenizer.leftBoundary(this._document, range.focus - 1)};
    });
  }

  addNextOccurence() {
    if (this._frozen)
      throw new Error('Cannot change selection while frozen');
    let tokenizer = this._document.tokenizer();
    if (!this._ranges.length || !tokenizer)
      return false;
    let hasCollapsedRange = false;
    for (let range of this._ranges)
      hasCollapsedRange = hasCollapsedRange || range.anchor === range.focus;
    // Step 1: if at least one range is collapased, then expand to boundaries every where
    if (hasCollapsedRange) {
      let ranges = [];
      for (let range of this._ranges) {
        if (range.anchor === range.focus) {
          let offset = range.anchor;
          // Gravitate towards word selection in borderline cases for collapsed cursors.
          if (offset > 0 && tokenizer.isWordChar(this._document.iterator(offset - 1).current))
            --offset;
          let {from, to} = Tokenizer.characterGroupRange(this._document, offset);
          ranges.push({id: range.id, anchor: from, focus: to, upDownX: range.upDownX});
        } else {
          let anchor = Tokenizer.leftBoundary(this._document, Math.min(range.anchor, range.focus));
          let focus = Tokenizer.rightBoundary(this._document, Math.max(range.anchor, range.focus) - 1);
          ranges.push({id: range.id, anchor, focus, upDownX: range.upDownX});
        }
      }
      this._ranges = this._rebuild(ranges);
      this._nextOccurenceGroupOnly = true;
      this._notifyChanged(true /* keepNextOccurenceState */);
      return true;
    }
    // Step 2: if all ranges are non-collapsed, figure the text to search for.
    if (!this._nextOccurenceText) {
      let lastRange = this._ranges[0];
      for (let range of this._ranges) {
        if (range.anchor > lastRange.anchor)
          lastRange = range;
      }
      this._nextOccurenceText = this._document.content(Math.min(lastRange.anchor, lastRange.focus), Math.max(lastRange.anchor, lastRange.focus));
      this._nextOccurenceSearchOffset = Math.max(lastRange.anchor, lastRange.focus);
      this._nextOccurenceSearchEnd = Math.min(lastRange.anchor, lastRange.focus);
    }
    // Step 3: search for the text below the initial range, and then from top.
    while (this._nextOccurenceSearchOffset !== this._nextOccurenceSearchEnd) {
      let it = null;
      // Decide which half we should search.
      if (this._nextOccurenceSearchOffset < this._nextOccurenceSearchEnd)
        it = this._document.iterator(this._nextOccurenceSearchOffset, this._nextOccurenceSearchOffset, this._nextOccurenceSearchEnd);
      else
        it = this._document.iterator(this._nextOccurenceSearchOffset);
      let result = it.find(this._nextOccurenceText);
      if (!result) {
        this._nextOccurenceSearchOffset = it.offset > this._nextOccurenceSearchEnd ? 0 : it.offset;
        continue;
      }
      this._nextOccurenceSearchOffset = it.offset + this._nextOccurenceText.length;
      if (this._nextOccurenceGroupOnly) {
        let range = Tokenizer.characterGroupRange(this._document, it.offset);
        if (range.from !== it.offset || range.to !== it.offset + this._nextOccurenceText.length)
          continue;
      }
      let initialLength = this._ranges.length;
      this._ranges.push({id: ++this._lastId, upDownX: -1, anchor: it.offset, focus: it.offset + this._nextOccurenceText.length});
      this._ranges = this._rebuild(this._ranges);
      // If we managed to add a new range - return. Otherwise, continue searching.
      if (this._ranges.length > initialLength) {
        this._notifyChanged(true /* keepNextOccurenceState */);
        return true;
      }
    }
    return false;
  }

  /**
   * @return {boolean}
   */
  selectWordRight() {
    return this._operation(range => {
      return {id: range.id, upDownX: -1, anchor: range.anchor, focus: Tokenizer.rightBoundary(this._document, range.focus)};
    });
  }

  /**
   * @return {boolean}
   */
  selectLineStart() {
    return this._operation(range => {
      let offset = this._lineStart(range.focus);
      let it = this._document.iterator(offset);
      while (it.current === ' ') it.next();
      if (offset === range.focus)
        offset = it.offset;
      else if (range.focus > it.offset)
        offset = it.offset;
      return {id: range.id, upDownX: -1, anchor: range.anchor, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  selectLineEnd() {
    return this._operation(range => {
      return {id: range.id, upDownX: -1, anchor: range.anchor, focus: this._lineEnd(range.focus)};
    });
  }

  selectAll() {
    if (this._frozen)
      throw new Error('Cannot change selection while frozen');
    this._ranges = [{anchor: 0, focus: this._document.length(), upDownX: -1, id: ++this._lastId}];
    this._notifyChanged();
  }

  /**
   * @return {*}
   */
  save() {
    return this._ranges;
  }

  /**
   * @param {*} data
   * @param {!Array<!Range>=} ranges
   */
  restore(data, ranges) {
    if (this._frozen)
      throw new Error('Cannot change selection while frozen');
    this._ranges = data || [];
    if (ranges) {
      if (ranges.length !== this._ranges.length)
        throw new Error('Wrong number of ranges to update');
      let newRanges = [];
      for (let i = 0; i < ranges.length; i++)
        newRanges.push({id: this._ranges[i].id, upDownX: -1, anchor: ranges[i].from, focus: ranges[i].to});
      this._ranges = this._rebuild(newRanges);
    }
    this._notifyChanged();
  }

  // -------- Internals --------

  /**
   * @param {!Viewport.VisibleContent} visibleContent
   * @return {!Viewport.DecorationResult}
   */
  _onDecorate(visibleContent) {
    if (this._staleDecorations) {
      this._staleDecorations = false;
      this._rangeDecorator.clearAll();
      this._focusDecorator.clearAll();
      for (let range of this._ranges) {
        this._focusDecorator.add(range.focus, range.focus);
        this._rangeDecorator.add(Math.min(range.focus, range.anchor), Math.max(range.focus, range.anchor), Anchor.Start, Anchor.End);
      }
    }
    return {background: [this._rangeDecorator, this._focusDecorator], lines: [this._rangeDecorator]};
  }

  /**
   * @param {!Replacements} replacements
   */
  _onReplace(replacements) {
    if (this._frozen)
      return;

    for (let replacement of replacements) {
      let from = replacement.offset;
      let to = from + replacement.removed.length();
      let inserted = replacement.inserted.length();
      let ranges = [];
      for (let range of this._ranges) {
        let start = Math.min(range.anchor, range.focus);
        let end = Math.max(range.anchor, range.focus);
        if (from < start && to > start)
          continue;

        if (from <= start)
          start = to >= start ? from : start - (to - from);
        if (from <= end)
          end = to >= end ? from : end - (to - from);

        if (from <= start)
          start += inserted;
        if (from <= end)
          end += inserted;

        if (range.anchor > range.focus)
          ranges.push({id: range.id, upDownX: -1, anchor: end, focus: start});
        else
          ranges.push({id: range.id, upDownX: -1, anchor: start, focus: end});
      }
      this._ranges = this._rebuild(ranges);
    }
    this._notifyChanged();
  }

  /**
   * @param {function(!SelectionRange):?SelectionRange} rangeCallback
   * @return {boolean}
   */
  _operation(rangeCallback) {
    if (this._frozen)
      throw new Error('Cannot change selection while frozen');
    if (!this._ranges.length)
      return false;
    let ranges = [];
    for (let range of this._ranges) {
      let updated = rangeCallback(range);
      if (updated)
        ranges.push(updated);
    }
    this._ranges = this._join(ranges);
    this._notifyChanged();
    return true;
  }

  /**
   * @param {!Array<!SelectionRange>} ranges
   * @return {!Array<!SelectionRange>}
   */
  _join(ranges) {
    if (!ranges.length)
      return ranges;
    let length = 1;
    for (let i = 1; i < ranges.length; i++) {
      let last = ranges[length - 1];
      let lastTo = Math.max(last.anchor, last.focus);
      let next = ranges[i];
      let nextFrom = Math.min(next.anchor, next.focus);
      let nextTo = Math.max(next.anchor, next.focus);
      if (nextTo < lastTo)
        throw new Error('Inconsistent');
      if (nextFrom < lastTo || lastTo === nextTo) {
        if (last.anchor > last.focus)
          last.anchor = nextTo;
        else
          last.focus = nextTo;
      } else {
        ranges[length++] = next;
      }
    }
    if (length !== ranges.length)
      ranges.splice(length, ranges.length - length);
    return ranges;
  }

  /**
   * @param {!Array<!SelectionRange>} ranges
   * @return {!Array<!SelectionRange>}
   */
  _rebuild(ranges) {
    let length = this._document.length();
    for (let range of ranges) {
      range.anchor = Math.max(0, Math.min(range.anchor, length));
      range.focus = Math.max(0, Math.min(range.focus, length));
    }
    ranges.sort((a, b) => {
      let aFrom = Math.min(a.focus, a.anchor);
      let aTo = Math.max(a.focus, a.anchor);
      let bFrom = Math.min(b.focus, b.anchor);
      let bTo = Math.max(b.focus, b.anchor);
      return (aFrom - bFrom) || (aTo - bTo);
    });
    return this._join(ranges);
  }

  _notifyChanged(keepNextOccurenceState = false) {
    if (!keepNextOccurenceState) {
      this._nextOccurenceText = null;
      this._nextOccurenceGroupOnly = false;
      this._nextOccurenceSearchEnd = 0;
      this._nextOccurenceSearchOffset = 0;
    }
    this._staleDecorations = true;
    for (let callback of this._changeCallbacks)
      callback();
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  _left(offset) {
    let position = this._document.offsetToPosition(offset);
    if (position.column)
      return this._document.positionToOffset({line: position.line, column: position.column - 1});
    return Math.max(offset - 1, 0);
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  _right(offset) {
    let position = this._document.offsetToPosition(offset);
    let right = this._document.positionToOffset({line: position.line, column: position.column + 1});
    if (right === offset)
      return Math.min(offset + 1, this._document.length());
    return right;
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  _lineStart(offset) {
    let position = this._document.offsetToPosition(offset);
    return this._document.positionToOffset({line: position.line, column: 0});
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  _lineEnd(offset) {
    let position = this._document.offsetToPosition(offset);
    if (position.line == this._document.lineCount() - 1)
      return this._document.length();
    return this._document.positionToOffset({line: position.line + 1, column: 0}) - 1;
  }

  /**
   * @param {number} offset
   * @param {number} upDownX
   * @return {!{offset: number, upDownX: number}}
   */
  _lineUp(offset, upDownX) {
    let point = this._viewport.offsetToContentPoint(offset);
    if (upDownX === -1)
      upDownX = point.x;
    offset = this._viewport.contentPointToOffset({x: upDownX, y: point.y - this._viewport.lineHeight()}, RoundMode.Round);
    return {offset, upDownX};
  }

  /**
   * @param {number} offset
   * @param {number} upDownX
   * @return {!{offset: number, upDownX: number}}
   */
  _lineDown(offset, upDownX) {
    let point = this._viewport.offsetToContentPoint(offset);
    if (upDownX === -1)
      upDownX = point.x;
    offset = this._viewport.contentPointToOffset({x: upDownX, y: point.y + this._viewport.lineHeight()}, RoundMode.Round);
    return {offset, upDownX};
  }

  /**
   * @return {?SelectionRange}
   */
  _maxRange() {
    let max = null;
    for (let range of this._ranges) {
      if (max === null || max.id < range.id)
        max = range;
    }
    return max;
  }
};

Selection.Decorations = new Set(['selection.range', 'selection.focus', 'selection.focus.current']);
