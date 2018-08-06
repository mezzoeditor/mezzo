import { Tokenizer } from "./Tokenizer.mjs";

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
    this._selection = editor.selection();
    this._indent = ' '.repeat(2);
    this._overrides = new Set();
    this._commands = new Map();
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

  runCommand(command) {
    const handler = this._commands.get(command);
    if (!handler)
      return false;
    return handler.call(null);
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
    let ranges = this._selection.sortedRanges();
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
    this._selection.setRanges(newRanges);
    return true;
  }

  removeIndent() {
    let ranges = this._selection.sortedRanges();
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
    this._selection.setRanges(newRanges);
    return true;
  }

  /**
   * @param {string} s
   * @param {function(!RangeEdit):!RangeEdit} rangeCallback
   * @return {boolean}
   */
  _replace(s, rangeCallback) {
    let ranges = this._selection.sortedRanges();
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
    this._selection.setRanges(newRanges);
    return true;
  }
};
