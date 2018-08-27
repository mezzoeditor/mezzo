import { Tokenizer } from "./Tokenizer.mjs";
import { RoundMode } from '../core/Metrics.mjs';
import { Document } from '../core/Document.mjs';

/**
 * @typedef {{
 *   from: number,
 *   to: number,
 *   s: string,
 * }} RangeEdit;
 */

/**
 * @typedef {{
 *  edit: RangeEdit,
 *  cursorOffset: number
 * }} InputOverride;
 */

export class Input {
  /**
   * @param {!Editor} editor
   */
  constructor(editor) {
    this._editor = editor;
    this._document = editor.document();
    this._indent = ' '.repeat(2);
    this._overrides = new Set();

    this._historyMetadata = Symbol('input.history');
  }

  /**
   * @return {string}
   */
  indent() {
    return this._indent;
  }

  /**
   * @param {?function(!RangeEdit):?InputOverride} override
   * @return {function()}
   */
  addInputOverride(override) {
    this._overrides.add(override);
    return this.removeInputOverride.bind(this, override);
  }

  /**
   * @param {?function(!RangeEdit):?InputOverride} override
   */
  removeInputOverride(override) {
    this._overrides.delete(override);
  }

  /**
   * @param {string} text
   * @return {boolean}
   */
  paste(text) {
    return this._replace(text, range => range, 'clipboard');
  }

  /**
   * @return {boolean}
   */
  cut() {
    return this._innerDeleteBefore('clipboard');
  }

  /**
   * @return {boolean}
   */
  deleteBefore() {
    return this._innerDeleteBefore('keyboard');
  }

  /**
   * @return {boolean}
   */
  _innerDeleteBefore(origin) {
    return this._replace('', range => {
      if (range.from !== range.to)
        return range;
      let {line, column} = this._document.text().offsetToPosition(range.from);
      if (!column)
        return {s: range.s, from: Math.max(0, range.from - 1), to: range.to};
      return {s: range.s, from: this._document.text().positionToOffset({line, column: column - 1}), to: range.to};
    }, origin);
  }

  /**
   * @return {boolean}
   */
  deleteWordBefore() {
    return this._replace('', range => {
      if (range.from !== range.to)
        return range;
      let offset = Tokenizer.leftBoundary(this._document, this._editor.tokenizer(), range.from - 1);
      return {s: range.s, from: offset, to: range.to};
    }, 'keyboard');
  }

  /**
   * @return {boolean}
   */
  deleteLineBefore() {
    return this._replace('', range => {
      let position = this._document.text().offsetToPosition(range.from);
      let linePosition = {line: position.line, column: 0};
      let startOffset = this._document.text().positionToOffset(linePosition);
      return {s: range.s, from: startOffset, to: range.from};
    }, 'keyboard');
  }

  /**
   * @return {boolean}
   */
  deleteAfter() {
    return this._replace('', range => {
      if (range.from !== range.to)
        return range;
      let {line, column} = this._document.text().offsetToPosition(range.to);
      let next = this._document.text().positionToOffset({line, column: column + 1});
      if (next === range.to)
        return {s: range.s, from: range.from, to: Math.min(this._document.text().length(), range.to + 1)};
      return {s: range.s, from: range.from, to: next};
    }, 'keyboard');
  }

  /**
   * @param {string} text
   * @return {boolean}
   */
  type(text) {
    return this._replace(text, range => range, 'keyboard');
  }

  /**
   * @return {boolean}
   */
  insertNewLine() {
    return this._replace('\n', range => {
      let position = this._document.text().offsetToPosition(range.from);
      let linePosition = {line: position.line, column: 0};
      let startOffset = this._document.text().positionToOffset(linePosition);
      let it = this._document.text().iterator(startOffset, 0, startOffset + 1000);
      while (it.current === ' ' && !it.outOfBounds())
        it.next();
      let indent = ' '.repeat(it.offset - startOffset);
      return {s: range.s + indent, from: range.from, to: range.to};
    }, 'keyboard');
  }

  /**
   * @return {boolean}
   */
  insertIndent() {
    let ranges = this._document.sortedSelection();
    if (!ranges.length)
      return false;
    let newRanges = [];
    let delta = 0;
    for (let range of ranges) {
      let from = Math.max(0, Math.min(Math.min(range.anchor, range.focus) + delta, this._document.text().length()));
      let to = Math.max(0, Math.min(Math.max(range.anchor, range.focus) + delta, this._document.text().length()));
      let startPosition = {line: this._document.text().offsetToPosition(from).line, column: 0};
      let startOffset = this._document.text().positionToOffset(startPosition);
      if (from === to) {
        let pendingIndent = (from - startOffset) % this._indent.length;
        let indent = ' '.repeat(this._indent.length - pendingIndent);
        this._document.replace(from, from, indent);
        newRanges.push({anchor: from + indent.length, focus: from + indent.length});
        delta += indent.length;
      } else {
        let endPosition = {line: this._document.text().offsetToPosition(to).line, column: 0};
        let endOffset = this._document.text().positionToOffset(endPosition);
        if (endOffset === to)
          --endPosition.line;
        for (let line = startPosition.line; line <= endPosition.line; ++line) {
          let offset = this._document.text().positionToOffset({line, column: 0});
          if (this._document.text().iterator(offset).current === '\n')
            continue;
          this._document.replace(offset, offset, this._indent);
          delta += this._indent.length;
        }
        newRanges.push({anchor: from + this._indent.length, focus: to + delta});
      }
    }
    this._document.setSelection(newRanges);
    return true;
  }

  removeIndent() {
    let ranges = this._document.sortedSelection();
    if (!ranges.length)
      return false;
    let newRanges = [];
    let delta = 0;
    for (let range of ranges) {
      let from = Math.max(0, Math.min(Math.min(range.focus, range.anchor) + delta, this._document.text().length()));
      let to = Math.max(0, Math.min(Math.max(range.focus, range.anchor) + delta, this._document.text().length()));
      let startPosition = this._document.text().offsetToPosition(from);
      let endPosition = this._document.text().offsetToPosition(to);
      let endOffset = this._document.text().positionToOffset({line: endPosition.line, column: 0});
      if (endOffset === to)
        --endPosition.line;
      let startDelta = 0;
      for (let line = startPosition.line; line <= endPosition.line; ++line) {
        let offset = this._document.text().positionToOffset({line, column: 0});
        let it = this._document.text().iterator(offset);
        while (it.current === ' ' && it.offset - offset < this._indent.length)
          it.next();
        this._document.replace(offset, it.offset, '');
        delta -= it.offset - offset;
        if (line === startPosition.line)
          startDelta -= Math.min(it.offset - offset, startPosition.column);
      }
      newRanges.push({anchor: from + startDelta, focus: to + delta});
    }
    this._document.setSelection(newRanges);
    return true;
  }

  /**
   * @param {!Markup} markup
   * @return {boolean}
   */
  moveUp(markup) {
    return this._updateSelection(range => {
      let offset = Math.min(range.anchor, range.focus);
      let upDownX = range.upDownX;
      let upResult = this._lineUp(markup, range.focus, range.upDownX);
      offset = upResult.offset;
      upDownX = upResult.upDownX;
      return {upDownX, anchor: offset, focus: offset};
    });
  }

  /**
   * @param {!Markup} markup
   * @return {boolean}
   */
  moveDown(markup) {
    return this._updateSelection(range => {
      let offset = Math.max(range.anchor, range.focus);
      let upDownX = range.upDownX;
      let upResult = this._lineDown(markup, range.focus, range.upDownX);
      offset = upResult.offset;
      upDownX = upResult.upDownX;
      return {upDownX, anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveLeft() {
    return this._updateSelection(range => {
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
    return this._updateSelection(range => {
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
    return this._updateSelection(range => {
      let offset = Tokenizer.leftBoundary(this._document, this._editor.tokenizer(), range.focus - 1);
      return {anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveWordRight() {
    return this._updateSelection(range => {
      let offset = Tokenizer.rightBoundary(this._document, this._editor.tokenizer(), range.focus);
      return {anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveDocumentStart() {
    return this._updateSelection(range => {
      let offset = 0;
      return {anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveDocumentEnd() {
    return this._updateSelection(range => {
      let offset = this._document.text().length();
      return {anchor: offset, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  selectDocumentStart() {
    return this._updateSelection(range => {
      let offset = 0;
      return {anchor: range.anchor, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  selectDocumentEnd() {
    return this._updateSelection(range => {
      let offset = this._document.text().length();
      return {anchor: range.anchor, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  moveLineStart() {
    return this._updateSelection(range => {
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
    return this._updateSelection(range => {
      let offset = this._lineEnd(range.focus);
      return {anchor: offset, focus: offset};
    });
  }

  /**
   * @param {!Markup} markup
   * @return {boolean}
   */
  selectUp(markup) {
    return this._updateSelection(range => {
      let {offset, upDownX} = this._lineUp(markup, range.focus, range.upDownX);
      return {upDownX, anchor: range.anchor, focus: offset};
    });
  }

  /**
   * @param {!Markup} markup
   * @return {boolean}
   */
  selectDown(markup) {
    return this._updateSelection(range => {
      let {offset, upDownX} = this._lineDown(markup, range.focus, range.upDownX);
      return {upDownX, anchor: range.anchor, focus: offset};
    });
  }

  /**
   * @return {boolean}
   */
  selectLeft() {
    return this._updateSelection(range => {
      return {anchor: range.anchor, focus: this._left(range.focus)};
    });
  }

  /**
   * @return {boolean}
   */
  selectRight() {
    return this._updateSelection(range => {
      return {anchor: range.anchor, focus: this._right(range.focus)};
    });
  }

  /**
   * @return {boolean}
   */
  selectWordLeft() {
    return this._updateSelection(range => {
      return {anchor: range.anchor, focus: Tokenizer.leftBoundary(this._document, this._editor.tokenizer(), range.focus - 1)};
    });
  }

  /**
   * @return {boolean}
   */
  selectWordRight() {
    return this._updateSelection(range => {
      return {anchor: range.anchor, focus: Tokenizer.rightBoundary(this._document, this._editor.tokenizer(), range.focus)};
    });
  }

  /**
   * @return {boolean}
   */
  selectLineStart() {
    return this._updateSelection(range => {
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
    return this._updateSelection(range => {
      return {anchor: range.anchor, focus: this._lineEnd(range.focus)};
    });
  }

  selectAll() {
    this._document.setSelection([{
      anchor: 0,
      focus: this._document.text().length()
    }]);
  }

  /**
   * @return {boolean}
   */
  collapseSelection() {
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
      return true;
    }
    let range = selection[0];
    if (range.anchor === range.focus)
      return false;
    this._document.setSelection([{
      anchor: range.anchor,
      focus: range.anchor
    }]);
    return true;
  }

  /**
   * @return {!SelectionRange} range
   */
  setLastCursor(range) {
    const selection = this._document.selection();
    if (selection.length)
      selection.pop();
    selection.push(range);
    this._document.setSelection(selection);
  }

  // -------- Internals --------

  /**
   * @param {function(!SelectionRange):?SelectionRange} rangeCallback
   * @return {boolean}
   */
  _updateSelection(rangeCallback) {
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
    return true;
  }

  /**
   * @param {string} s
   * @param {function(!RangeEdit):!RangeEdit} rangeCallback
   * @param {string} origin
   * @return {boolean}
   */
  _replace(s, rangeCallback, origin) {
    let ranges = this._document.sortedSelection();
    if (!ranges.length)
      return false;

    // Figure intended changes first.
    let edits = [];
    for (let range of ranges) {
      let from = Math.max(0, Math.min(Math.min(range.anchor, range.focus), this._document.text().length()));
      let to = Math.max(0, Math.min(Math.max(range.anchor, range.focus), this._document.text().length()));
      let replaced = rangeCallback({from, to, s});
      replaced.cursorOffset = replaced.from + replaced.s.length;
      for (let override of this._overrides) {
        let result = override.call(null, replaced);
        if (result) {
          replaced = result.edit;
          replaced.cursorOffset = result.cursorOffset;
          break;
        }
      }
      edits.push(replaced);
    }
    // Compute history action.
    const metadata = this._document.metadata(this._historyMetadata);
    const newMetadata = createMetadata(this._document.text(), edits, origin);
    const historyAction = decideHistoryAction(metadata, newMetadata);

    // Run document operation with proper action.
    this._document.operation(() => {
      let delta = 0;
      let newSelection = [];
      for (const edit of edits) {
        this._document.replace(edit.from + delta, edit.to + delta, edit.s);
        newSelection.push({anchor: edit.cursorOffset + delta, focus: edit.cursorOffset + delta});
        delta += edit.s.length - (edit.to - edit.from);
      }
      this._document.setSelection(newSelection);
    }, historyAction);
    this._document.setMetadata(this._historyMetadata, newMetadata);
    return true;

    function createMetadata(text, edits, origin) {
      let allInserted = true;
      let allRemoved = true;
      let allSpaces = true;
      for (const edit of edits) {
        const inserted = edit.s;
        const removed = text.content(edit.from, edit.to);
        allInserted = allInserted && inserted.length > 0 && removed.length === 0;
        allRemoved = allRemoved && inserted.length === 0 && removed.length > 0;
        // Limit space detection for performance reasons.
        allSpaces = allSpaces && (inserted.length < 100 && /^\s+/.test(inserted))
                    || (removed.length < 100 && /^\s+/.test(removed));
      }
      let modificationType = 'mixed';
      if (!edits.length)
        modificationType = 'none';
      else if (allInserted)
        modificationType = 'inserts';
      else if (allRemoved)
        modificationType = 'removes';
      return {modificationType, allSpaces, origin};
    }

    function decideHistoryAction(metadata, newMetadata) {
      if (!metadata)
        return Document.History.Push;

      // If this is a selection-only change - push entry.
      if (newMetadata.modificationType === 'none')
        return Document.History.Push;

      // If this is the first time we started to type after mouse action - push.
      if (metadata.origin !== newMetadata.origin)
        return Document.History.Push;

      // If modification type is "mixed" or it has changed wrt the last entry - push a new entry
      if (newMetadata.modificationType === 'mixed' || metadata.modificationType !== newMetadata.modificationType)
        return Document.History.Push;
      // If we started inserting/removing spaces - push a new entry.
      if (newMetadata.allSpaces && !metadata.allSpaces)
        return Document.History.Push;
      // Otherwise, amend current entry.
      return Document.History.Merge;
    }
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
   * @param {!Markup} markup
   * @param {number} offset
   * @param {number} upDownX
   * @return {!{offset: number, upDownX: number}}
   */
  _lineUp(markup, offset, upDownX) {
    let point = markup.offsetToPoint(offset);
    if (upDownX === undefined)
      upDownX = point.x;
    offset = markup.pointToOffset({x: upDownX, y: point.y - markup.lineHeight()}, RoundMode.Round);
    return {offset, upDownX};
  }

  /**
   * @param {!Markup} markup
   * @param {number} offset
   * @param {number} upDownX
   * @return {!{offset: number, upDownX: number}}
   */
  _lineDown(markup, offset, upDownX) {
    let point = markup.offsetToPoint(offset);
    if (upDownX === undefined)
      upDownX = point.x;
    offset = markup.pointToOffset({x: upDownX, y: point.y + markup.lineHeight()}, RoundMode.Round);
    return {offset, upDownX};
  }
};
