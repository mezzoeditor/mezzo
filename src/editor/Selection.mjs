import { Tokenizer } from './Tokenizer.mjs';
import { RoundMode } from '../core/Metrics.mjs';
import { EventEmitter } from '../core/EventEmitter.mjs';

export class Selection extends EventEmitter {
  /**
   * @param {!Viewport} viewport
   */
  constructor(editor) {
    super();
    this._editor = editor;
    this._document = editor.document();

    this._nextOccurenceText = null;
    this._nextOccurenceGroupOnly = false;
    this._nextOccurenceSearchOffset = 0;
    this._nextOccurenceSearchEnd = 0;
  }

  // -------- Public API --------

  /**
   * @return {!Array<!SelectionRange>}
   */
  sortedRanges() {
    return this._document.sortedSelection();
  }

  /**
   * @return {!Array<!SelectionRange>}
   */
  ranges() {
    return this._document.selection();
  }

  /**
   * @param {!Array<!SelectionRange>} ranges
   */
  setRanges(ranges) {
    this._document.setSelection(ranges);
  }

  /**
   * @return {boolean}
   */
  hasRanges() {
    return this._document.hasSelection();
  }

  /**
   * @return {boolean}
   */
  hasSingleRange() {
    return this._document.hasSingleCursor();
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
  lastRange() {
    return this._maxRange();
  }

  /**
   * @param {!SelectionRange} range
   */
  setLastRange(range) {
    const selection = this._document.selection();
    let maxRange = this._maxRange();
    if (!selection.length) {
      selection.push({
        anchor: range.anchor,
        focus: range.focus
      });
    } else {
      selection[selection.length - 1] = {
        anchor: range.anchor,
        focus: range.focus
      };
    }
    this._document.setSelection(selection);
    this._notifyChanged();
  }

  /**
   * @param {!SelectionRange} range
   */
  addRange(range) {
    const selection = this._document.selection();
    selection.push({
      anchor: range.anchor,
      focus: range.focus
    });
    this._document.setSelection(selection);
    this._notifyChanged();
  }

  /**
   * @return {string}
   */
  selectedText() {
    let lines = [];
    for (let range of this._document.selection())
      lines.push(this._document.text().content(Math.min(range.anchor, range.focus), Math.max(range.anchor, range.focus)));
    return lines.join('\n');
  }

  /**
   * @return {boolean}
   */
  collapse() {
    const selection = this._document.sortedSelection();
    if (selection.length === 0)
      return false;
    if (selection.length > 1) {
      const min = Math.min(selection[0].anchor, selection[0].focus);
      const range = {
        anchor: min,
        focus: min
      };
      this._document.setSelection([range]);
      this._notifyChanged();
      return true;
    }
    let range = selection[0];
    if (range.anchor === range.focus)
      return false;
    this._document.setSelection([{
      anchor: range.anchor,
      focus: range.anchor
    }]);
    this._notifyChanged();
    return true;
  }

  /**
   * @param {!Viewport} viewport
   * @return {boolean}
   */
  moveUp(viewport) {
    return this._operation(range => {
      let offset = Math.min(range.anchor, range.focus);
      let upDownX = range.upDownX;
      let upResult = this._lineUp(viewport, range.focus, range.upDownX);
      offset = upResult.offset;
      upDownX = upResult.upDownX;
      return {upDownX, anchor: offset, focus: offset};
    });
  }

  /**
   * @param {!Viewport} viewport
   * @return {boolean}
   */
  moveDown(viewport) {
    return this._operation(range => {
      let offset = Math.max(range.anchor, range.focus);
      let upDownX = range.upDownX;
      let upResult = this._lineDown(viewport, range.focus, range.upDownX);
      offset = upResult.offset;
      upDownX = upResult.upDownX;
      return {upDownX, anchor: offset, focus: offset};
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
      return {anchor: offset, focus: offset};
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
      return {anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveWordLeft() {
    return this._operation(range => {
      let offset = Tokenizer.leftBoundary(this._document, this._editor.tokenizer(), range.focus - 1);
      return {anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveWordRight() {
    return this._operation(range => {
      let offset = Tokenizer.rightBoundary(this._document, this._editor.tokenizer(), range.focus);
      return {anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveDocumentStart() {
    return this._operation(range => {
      let offset = 0;
      return {anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveDocumentEnd() {
    return this._operation(range => {
      let offset = this._document.text().length();
      return {anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  selectDocumentStart() {
    return this._operation(range => {
      let offset = 0;
      return {anchor: range.anchor, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  selectDocumentEnd() {
    return this._operation(range => {
      let offset = this._document.text().length();
      return {anchor: range.anchor, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveLineStart() {
    return this._operation(range => {
      let offset = this._lineStart(range.focus);
      let it = this._document.text().iterator(offset);
      while (it.current === ' ') it.next();
      if (offset === range.focus)
        offset = it.offset;
      else if (range.focus > it.offset)
        offset = it.offset;
      return {anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveLineEnd() {
    return this._operation(range => {
      let offset = this._lineEnd(range.focus);
      return {anchor: offset, focus: offset};
    });
  }

  /**
   * @param {!Viewport} viewport
   * @return {boolean}
   */
  selectUp(viewport) {
    return this._operation(range => {
      let {offset, upDownX} = this._lineUp(viewport, range.focus, range.upDownX);
      return {upDownX, anchor: range.anchor, focus: offset};
    });
  }

  /**
   * @param {!Viewport} viewport
   * @return {boolean}
   */
  selectDown(viewport) {
    return this._operation(range => {
      let {offset, upDownX} = this._lineDown(viewport, range.focus, range.upDownX);
      return {upDownX, anchor: range.anchor, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  selectLeft() {
    return this._operation(range => {
      return {anchor: range.anchor, focus: this._left(range.focus)};
    });
  }

  /**
   * @return {boolean}
   */
  selectRight() {
    return this._operation(range => {
      return {anchor: range.anchor, focus: this._right(range.focus)};
    });
  }

  /**
   * @return {boolean}
   */
  selectWordLeft() {
    return this._operation(range => {
      return {anchor: range.anchor, focus: Tokenizer.leftBoundary(this._document, this._editor.tokenizer(), range.focus - 1)};
    });
  }

  addNextOccurence() {
    let tokenizer = this._editor.tokenizer();
    const selection = this._document.selection();
    if (!selection.length || !tokenizer)
      return false;
    let hasCollapsedRange = false;
    for (let range of selection)
      hasCollapsedRange = hasCollapsedRange || range.anchor === range.focus;
    // Step 1: if at least one range is collapased, then expand to boundaries every where
    if (hasCollapsedRange) {
      let ranges = [];
      for (let range of selection) {
        if (range.anchor === range.focus) {
          let offset = range.anchor;
          // Gravitate towards word selection in borderline cases for collapsed cursors.
          if (offset > 0 && tokenizer.isWordChar(this._document.text().iterator(offset - 1).current))
            --offset;
          let {from, to} = Tokenizer.characterGroupRange(this._document, this._editor.tokenizer(), offset);
          ranges.push({anchor: from, focus: to, upDownX: range.upDownX});
        } else {
          let anchor = Tokenizer.leftBoundary(this._document, this._editor.tokenizer(), Math.min(range.anchor, range.focus));
          let focus = Tokenizer.rightBoundary(this._document, this._editor.tokenizer(), Math.max(range.anchor, range.focus) - 1);
          ranges.push({anchor, focus, upDownX: range.upDownX});
        }
      }
      this._document.setSelection(ranges);
      this._nextOccurenceGroupOnly = true;
      this._notifyChanged(true /* keepNextOccurenceState */);
      return true;
    }
    // Step 2: if all ranges are non-collapsed, figure the text to search for.
    if (!this._nextOccurenceText) {
      let lastRange = selection[0];
      for (let range of selection) {
        if (range.anchor > lastRange.anchor)
          lastRange = range;
      }
      this._nextOccurenceText = this._document.text().content(Math.min(lastRange.anchor, lastRange.focus), Math.max(lastRange.anchor, lastRange.focus));
      this._nextOccurenceSearchOffset = Math.max(lastRange.anchor, lastRange.focus);
      this._nextOccurenceSearchEnd = Math.min(lastRange.anchor, lastRange.focus);
    }
    // Step 3: search for the text below the initial range, and then from top.
    while (this._nextOccurenceSearchOffset !== this._nextOccurenceSearchEnd) {
      let it = null;
      // Decide which half we should search.
      if (this._nextOccurenceSearchOffset < this._nextOccurenceSearchEnd)
        it = this._document.text().iterator(this._nextOccurenceSearchOffset, this._nextOccurenceSearchOffset, this._nextOccurenceSearchEnd);
      else
        it = this._document.text().iterator(this._nextOccurenceSearchOffset);
      let result = it.find(this._nextOccurenceText);
      if (!result) {
        this._nextOccurenceSearchOffset = it.offset > this._nextOccurenceSearchEnd ? 0 : it.offset;
        continue;
      }
      this._nextOccurenceSearchOffset = it.offset + this._nextOccurenceText.length;
      if (this._nextOccurenceGroupOnly) {
        let range = Tokenizer.characterGroupRange(this._document, this._editor.tokenizer(), it.offset);
        if (range.from !== it.offset || range.to !== it.offset + this._nextOccurenceText.length)
          continue;
      }
      let initialLength = selection.length;
      selection.push({anchor: it.offset, focus: it.offset + this._nextOccurenceText.length});
      this._document.setSelection(selection);

      // If we managed to add a new range - return. Otherwise, continue searching.
      if (this._document.selection().length > initialLength) {
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
      return {anchor: range.anchor, focus: Tokenizer.rightBoundary(this._document, this._editor.tokenizer(), range.focus)};
    });
  }

  /**
   * @return {boolean}
   */
  selectLineStart() {
    return this._operation(range => {
      let offset = this._lineStart(range.focus);
      let it = this._document.text().iterator(offset);
      while (it.current === ' ') it.next();
      if (offset === range.focus)
        offset = it.offset;
      else if (range.focus > it.offset)
        offset = it.offset;
      return {anchor: range.anchor, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  selectLineEnd() {
    return this._operation(range => {
      return {anchor: range.anchor, focus: this._lineEnd(range.focus)};
    });
  }

  selectAll() {
    this._document.setSelection([{
      anchor: 0,
      focus: this._document.text().text().length()
    }]);
    this._notifyChanged();
  }

  // -------- Internals --------

  /**
   * @param {function(!SelectionRange):?SelectionRange} rangeCallback
   * @return {boolean}
   */
  _operation(rangeCallback) {
    if (this._frozen)
      throw new Error('Cannot change selection while frozen');
    const selection = this._document.selection();
    if (!selection.length)
      return false;
    let ranges = [];
    for (let range of selection) {
      let updated = rangeCallback(range);
      if (updated)
        ranges.push(updated);
    }
    this._document.setSelection(ranges);
    this._notifyChanged();
    return true;
  }

  _notifyChanged(keepNextOccurenceState = false) {
    if (!keepNextOccurenceState) {
      this._nextOccurenceText = null;
      this._nextOccurenceGroupOnly = false;
      this._nextOccurenceSearchEnd = 0;
      this._nextOccurenceSearchOffset = 0;
    }
    this.emit(Selection.Events.Changed);
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  _left(offset) {
    let position = this._document.text().offsetToPosition(offset);
    if (position.column)
      return this._document.text().positionToOffset({line: position.line, column: position.column - 1});
    return Math.max(offset - 1, 0);
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  _right(offset) {
    let position = this._document.text().offsetToPosition(offset);
    let right = this._document.text().positionToOffset({line: position.line, column: position.column + 1});
    if (right === offset)
      return Math.min(offset + 1, this._document.text().length());
    return right;
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  _lineStart(offset) {
    let position = this._document.text().offsetToPosition(offset);
    return this._document.text().positionToOffset({line: position.line, column: 0});
  }

  /**
   * @param {number} offset
   * @return {number}
   */
  _lineEnd(offset) {
    let position = this._document.text().offsetToPosition(offset);
    if (position.line == this._document.text().lineCount() - 1)
      return this._document.text().length();
    return this._document.text().positionToOffset({line: position.line + 1, column: 0}) - 1;
  }

  /**
   * @param {!Viewport} viewport
   * @param {number} offset
   * @param {number} upDownX
   * @return {!{offset: number, upDownX: number}}
   */
  _lineUp(viewport, offset, upDownX) {
    let point = viewport.offsetToContentPoint(offset);
    if (upDownX === undefined)
      upDownX = point.x;
    offset = viewport.contentPointToOffset({x: upDownX, y: point.y - viewport.lineHeight()}, RoundMode.Round);
    return {offset, upDownX};
  }

  /**
   * @param {!Viewport} viewport
   * @param {number} offset
   * @param {number} upDownX
   * @return {!{offset: number, upDownX: number}}
   */
  _lineDown(viewport, offset, upDownX) {
    let point = viewport.offsetToContentPoint(offset);
    if (upDownX === undefined)
      upDownX = point.x;
    offset = viewport.contentPointToOffset({x: upDownX, y: point.y + viewport.lineHeight()}, RoundMode.Round);
    return {offset, upDownX};
  }

  /**
   * @return {?SelectionRange}
   */
  _maxRange() {
    const selection = this._document.selection();
    return selection.length ? selection[selection.length - 1] : null;
  }
};

Selection.Events = {
  Changed: 'changed'
};

