import { Tokenizer } from "./Tokenizer.mjs";
import { RoundMode } from '../core/Metrics.mjs';

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
    this._commands = new Map();

    this.addCommand('input.backspace', this.deleteBefore.bind(this));
    this.addCommand('input.backspace.word', this.deleteWordBefore.bind(this));
    this.addCommand('input.backspace.line', this.deleteLineBefore.bind(this));
    this.addCommand('input.delete', this.deleteAfter.bind(this));
    this.addCommand('input.newline', this.insertNewLine.bind(this));
    this.addCommand('input.indent', this.insertIndent.bind(this));
    this.addCommand('input.unindent', this.removeIndent.bind(this));

    this.addCommand('selection.move.up', this.moveUp.bind(this));
    this.addCommand('selection.move.down', this.moveDown.bind(this));
    this.addCommand('selection.move.documentstart', this.moveDocumentStart.bind(this));
    this.addCommand('selection.move.documentend', this.moveDocumentEnd.bind(this));
    this.addCommand('selection.move.left', this.moveLeft.bind(this));
    this.addCommand('selection.move.right', this.moveRight.bind(this));
    this.addCommand('selection.move.word.left', this.moveWordLeft.bind(this));
    this.addCommand('selection.move.word.right', this.moveWordRight.bind(this));
    this.addCommand('selection.move.linestart', this.moveLineStart.bind(this));
    this.addCommand('selection.move.lineend', this.moveLineEnd.bind(this));
    this.addCommand('selection.select.up', this.selectUp.bind(this));
    this.addCommand('selection.select.down', this.selectDown.bind(this));
    this.addCommand('selection.select.documentstart', this.selectDocumentStart.bind(this));
    this.addCommand('selection.select.documentend', this.selectDocumentEnd.bind(this));
    this.addCommand('selection.select.left', this.selectLeft.bind(this));
    this.addCommand('selection.select.right', this.selectRight.bind(this));
    this.addCommand('selection.select.word.left', this.selectWordLeft.bind(this));
    this.addCommand('selection.select.word.right', this.selectWordRight.bind(this));
    this.addCommand('selection.select.linestart', this.selectLineStart.bind(this));
    this.addCommand('selection.select.lineend', this.selectLineEnd.bind(this));
    this.addCommand('selection.select.all', this.selectAll.bind(this));
    this.addCommand('selection.collapse', this.collapseSelection.bind(this));
  }

  /**
   * @return {string}
   */
  indent() {
    return this._indent;
  }

  /**
   * @param {?function(!RangeEdit):?InputOverride} override
   */
  addInputOverride(override) {
    this._overrides.add(override);
  }

  addCommand(command, handler) {
    this._commands.set(command, handler);
  }

  runCommand(command, viewport) {
    const handler = this._commands.get(command);
    if (!handler)
      return false;
    return handler.call(null, viewport);
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
    return this._replace(text, range => range);
  }

  /**
   * @return {boolean}
   */
  deleteBefore() {
    return this._replace('', range => {
      if (range.from !== range.to)
        return range;
      let {line, column} = this._document.text().offsetToPosition(range.from);
      if (!column)
        return {s: range.s, from: Math.max(0, range.from - 1), to: range.to};
      return {s: range.s, from: this._document.text().positionToOffset({line, column: column - 1}), to: range.to};
    });
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
    });
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
    });
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
    });
  }

  /**
   * @param {string} text
   * @return {boolean}
   */
  type(text) {
    return this._replace(text, range => range);
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
    });
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
   * @param {!Viewport} viewport
   * @return {boolean}
   */
  moveUp(viewport) {
    return this._updateSelection(range => {
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
    return this._updateSelection(range => {
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
   * @param {!Viewport} viewport
   * @return {boolean}
   */
  selectUp(viewport) {
    return this._updateSelection(range => {
      let {offset, upDownX} = this._lineUp(viewport, range.focus, range.upDownX);
      return {upDownX, anchor: range.anchor, focus: offset};
    });
  }

  /**
   * @param {!Viewport} viewport
   * @return {boolean}
   */
  selectDown(viewport) {
    return this._updateSelection(range => {
      let {offset, upDownX} = this._lineDown(viewport, range.focus, range.upDownX);
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
      focus: this._document.text().text().length()
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

  // -------- Internals --------

  /**
   * @param {string} s
   * @param {function(!RangeEdit):!RangeEdit} rangeCallback
   * @return {boolean}
   */
  _replace(s, rangeCallback) {
    let ranges = this._document.sortedSelection();
    if (!ranges.length)
      return false;
    let newRanges = [];
    let delta = 0;
    for (let range of ranges) {
      let from = Math.max(0, Math.min(Math.min(range.anchor, range.focus) + delta, this._document.text().length()));
      let to = Math.max(0, Math.min(Math.max(range.anchor, range.focus) + delta, this._document.text().length()));
      let replaced = rangeCallback({from, to, s});
      let cursorOffset = replaced.from + replaced.s.length;
      for (let override of this._overrides) {
        let result = override.call(null, replaced);
        if (result) {
          replaced = result.edit;
          cursorOffset = result.cursorOffset;
          break;
        }
      }
      this._document.replace(replaced.from, replaced.to, replaced.s);
      newRanges.push({anchor: cursorOffset, focus: cursorOffset});
      delta += replaced.s.length - (replaced.to - replaced.from);
    }
    this._document.setSelection(newRanges);
    return true;
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
};
