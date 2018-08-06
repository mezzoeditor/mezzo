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

