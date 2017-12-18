import { OffsetRange } from "../utils/Types.mjs";
import { TextUtils } from "../utils/TextUtils.mjs";

/**
 * @implements {Plugin}
 */
export class Selection {
  constructor(editor) {
    this._editor = editor;
    this._ranges = [];
  }

  // -------- Public API --------

  /**
   * Be careful to not mutate return value unintentionally.
   * @return {!Array<{!Selection.Range}>}
   */
  ranges() {
    return this._ranges;
  }

  /**
   * Takes ownership. Be careful to not mutate unintentionally.
   * @param {!Array<!Selection.Range>} ranges
   */
  setRanges(ranges) {
    this._editor.begin('selection');
    this._ranges = ranges;
    this._clearUpDown();
    this._rebuild();
    this._editor.end('selection');
  }

  // -------- Plugin --------

  /**
   * @param {!Viewport} viewport
   */
  onViewport(viewport) {
    let start = viewport.start();
    let end = viewport.end();
    for (let range of this._ranges) {
      let focus = this._editor.offsetToPosition(range.focus());
      if (focus.line >= start.line && focus.column >= start.column &&
          focus.line < end.line && focus.column < end.column) {
        viewport.addDecoration(focus, focus, 'selection.focus');
      }

      if (range.isCollapsed())
        continue;
      let {from, to} = range.range();
      from = this._editor.offsetToPosition(from);
      to = this._editor.offsetToPosition(to);
      if (to.line < start.line || (to.line === start.line && to.column < start.column))
        continue;
      if (from.line >= end.line || (from.line === end.line - 1 && from.column >= end.column))
        continue;
      viewport.addDecoration(from, to, 'selection.range');
    }
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   */
  onReplace(from, to, inserted) {
    let delta = inserted - (to - from);
    let ranges = [];

    for (let i = 0; i < this._ranges.length; i++) {
      let range = this._ranges[i].clone();
      let start = range.range().from;
      let end = range.range().to;
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

      range.setRange({from: start, to: end});
      ranges.push(range);
    }

    this._ranges = ranges;
    this._clearUpDown();
  }

  /**
   * @return {*}
   */
  onSave() {
    return this._ranges;
  }

  /**
   * @param {!Array<{from: number, to: number, inserted: number}>} replacements
   * @param {*|undefined} data
   */
  onRestore(replacements, data) {
    this._ranges = data || [];
  }

  /**
   * @param {string} command
   * @param {*} data
   * @return {*}
   */
  onCommand(command, data) {
    if (!Selection.Commands.has(command))
      return;

    if (command === 'selection.collapse')
      return this._collapse();

    this._editor.begin('selection');
    this._ranges = this._ranges.map(range => range.clone());
    switch (command) {
      case 'selection.select.all': {
        let range = new Selection.Range();
        range.setRange({from: 0, to: this._editor.length()});
        this._ranges = [range];
        break;
      }
      case 'selection.move.left': {
        this._clearUpDown();
        for (let range of this._ranges) {
          if (range.isCollapsed())
            range.setCaret(TextUtils.previousOffset(this._editor, range.focus()));
          else
            range.setCaret(range.range().from);
        }
        this._join();
        break;
      }
      case 'selection.select.left': {
        this._clearUpDown();
        for (let range of this._ranges)
          range.moveFocus(TextUtils.previousOffset(this._editor, range.focus()));
        this._join();
        break;
      }
      case 'selection.move.right': {
        this._clearUpDown();
        for (let range of this._ranges) {
          if (range.isCollapsed())
            range.setCaret(TextUtils.nextOffset(this._editor, range.focus()));
          else
            range.setCaret(range.range().to);
        }
        this._join();
        break;
      }
      case 'selection.select.right': {
        this._clearUpDown();
        for (let range of this._ranges)
          range.moveFocus(TextUtils.nextOffset(this._editor, range.focus()));
        this._join();
        break;
      }
      case 'selection.move.up': {
        for (let range of this._ranges) {
          if (range.isCollapsed()) {
            let position = this._editor.offsetToPosition(range.focus());
            position = {
              line: position.line ? position.line - 1 : position.line,
              column: range.saveUpDown(position.column)
            };
            range.setCaret(this._editor.positionToOffset(position, true /* clamp */));
          } else {
            range.setCaret(range.range().from);
          }
        }
        this._join();
        break;
      }
      case 'selection.select.up': {
        for (let range of this._ranges) {
          let position = this._editor.offsetToPosition(range.focus());
          position = {
            line: position.line ? position.line - 1 : position.line,
            column: range.saveUpDown(position.column)
          };
          range.moveFocus(this._editor.positionToOffset(position, true /* clamp */));
        }
        this._join();
        break;
      }
      case 'selection.move.down': {
        for (let range of this._ranges) {
          if (range.isCollapsed()) {
            let position = this._editor.offsetToPosition(range.focus());
            position = {
              line: position.line < this._editor.lineCount() - 1 ? position.line + 1 : position.line,
              column: range.saveUpDown(position.column)
            };
            range.setCaret(this._editor.positionToOffset(position, true /* clamp */));
          } else {
            range.setCaret(range.range().to);
          }
        }
        this._join();
        break;
      }
      case 'selection.select.down': {
        for (let range of this._ranges) {
          let position = this._editor.offsetToPosition(range.focus());
          position = {
            line: position.line < this._editor.lineCount() - 1 ? position.line + 1 : position.line,
            column: range.saveUpDown(position.column)
          };
          range.moveFocus(this._editor.positionToOffset(position, true /* clamp */));
        }
        this._join();
        break;
      }
      case 'selection.move.linestart': {
        this._clearUpDown();
        for (let range of this._ranges)
          range.setCaret(TextUtils.lineStartOffset(this._editor, range.focus()));
        this._join();
        break;
      }
      case 'selection.select.linestart': {
        this._clearUpDown();
        for (let range of this._ranges)
          range.moveFocus(TextUtils.lineStartOffset(this._editor, range.focus()));
        this._join();
        break;
      }
      case 'selection.move.lineend': {
        this._clearUpDown();
        for (let range of this._ranges)
          range.setCaret(TextUtils.lineEndOffset(this._editor, seleciton.focus()));
        this._join();
        break;
      }
      case 'selection.select.lineend': {
        this._clearUpDown();
        for (let range of this._ranges)
          range.moveFocus(TextUtils.lineEndOffset(this._editor, range.focus()));
        this._join();
        break;
      }
    }
    this._editor.end('selection');
    return true;
  }

  // -------- Internal --------

  /**
   * @return {boolean|undefined}
   */
  _collapse() {
    let ranges = this._ranges.map(range => range.clone());
    let collapsed = false;
    for (let range of ranges)
      collapsed |= range.collapse();
    if (!collapsed)
      return false;
    this._editor.begin('selection');
    this._ranges = ranges;
    this._clearUpDown();
    this._editor.end('selection');
    return true;
  }

  _clearUpDown() {
    for (let range of this._ranges)
      range.clearUpDown();
  }

  _join() {
    let length = 1;
    for (let i = 1; i < this._ranges.length; i++) {
      let last = this._ranges[length - 1];
      let lastRange = last.range();
      let next = this._ranges[i];
      let nextRange = next.range();
      if (OffsetRange.intersects(lastRange, nextRange))
        last.setRange(OffsetRange.join(lastRange, nextRange));
      else
        this._ranges[length++] = next;
    }
    if (length !== this._ranges.length)
      this._ranges.splice(length, this._ranges.length - length);
  }

  _rebuild() {
    for (let range of this._ranges)
      range.setRange(TextUtils.clampRange(this._editor, range.range()));
    this._ranges.sort((a, b) => OffsetRange.compare(a.range(), b.range()));
    this._join();
  }
};

Selection.Range = class {
  constructor() {
    this._anchor = null;
    this._focus = 0;
    this._upDownColumn = -1;
  }

  /**
   * @return {!Selection.Range}
   */
  clone() {
    let range = new Selection.Range();
    range._anchor = this._anchor;
    range._focus = this._focus;
    range._upDownColumn = this._upDownColumn;
    return range;
  }

  clearUpDown() {
    this._upDownColumn = -1;
  }

  /**
   * @param {number} column
   * @return {number}
   */
  saveUpDown(column) {
    if (this._upDownColumn === -1)
      this._upDownColumn = column;
    return this._upDownColumn;
  }

  /**
   * @return {boolean}
   */
  isCollapsed() {
    return this._anchor === null;
  }

  /**
   * @return {number}
   */
  focus() {
    return this._focus;
  }

  /**
   * @return {boolean}
   */
  collapse() {
    if (this._anchor === null)
      return false;
    this._focus = this._anchor;
    this._anchor = null;
    return true;
  }

  /**
   * @param {number} focus
   */
  moveFocus(focus) {
    if (focus === this._focus)
      return;
    if (this._anchor === null)
      this._anchor = this._focus;
    this._focus = focus;
  }

  /**
   * @param {number} caret
   */
  setCaret(caret) {
    this._anchor = null;
    this._focus = caret;
  }

  /**
   * @return {!OffsetRange}
   */
  range() {
    if (this.isCollapsed())
      return {from: this._focus, to: this._focus};
    if (this._anchor > this._focus)
      return {from: this._focus, to: this._anchor};
    return {from: this._anchor, to: this._focus};
  }

  /**
   * @param {!OffsetRange} range
   */
  setRange(range) {
    if (range.from === range.to) {
      this._anchor = null;
      this._focus = range.from;
    } else if (this._anchor !== null && this._anchor > this._focus) {
      this._focus = range.from;
      this._anchor = range.to;
    } else {
      this._anchor = range.from;
      this._focus = range.to;
    }
  }
};

Selection.Commands = new Set([
  'selection.collapse',
  'selection.select.all',
  'selection.select.left',
  'selection.select.right',
  'selection.select.up',
  'selection.select.down',
  'selection.select.lineend',
  'selection.select.linestart',
  'selection.move.left',
  'selection.move.right',
  'selection.move.up',
  'selection.move.down',
  'selection.move.lineend',
  'selection.move.linestart',
]);

Selection.Decorations = new Set(['selection.range', 'selection.focus']);
