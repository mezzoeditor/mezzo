import { TextPosition, TextRange } from "./Types.mjs";

export class Selection {
  constructor() {
    this._anchor = null;
    this._focus = {lineNumber: 0, columnNumber: 0};
    this._upDownColumn = -1;
  }

  clearUpDown() {
    this._upDownColumn = -1;
  }

  /**
   * @return {number}
   */
  saveUpDown() {
    if (this._upDownColumn === -1)
      this._upDownColumn = this._focus.columnNumber;
    return this._upDownColumn;
  }

  /**
   * @return {boolean}
   */
  isCollapsed() {
    return !this._anchor;
  }

  /**
   * @return {!TextPositon}
   */
  focus() {
    return this._focus;
  }

  /**
   * @param {!TextPositon} focus
   */
  moveFocus(focus) {
    if (TextPosition.compare(focus, this._focus) === 0)
      return;
    if (!this._anchor)
      this._anchor = this._focus;
    this._focus = focus;
  }

  /**
   * @param {!TextPosition} caret
   */
  setCaret(caret) {
    this._anchor = null;
    this._focus = caret;
  }

  /**
   * @return {!TextRange}
   */
  range() {
    if (this.isCollapsed())
      return {from: this._focus, to: this._focus};
    if (this.isReversed())
      return {from: this._focus, to: this._anchor};
    return {from: this._anchor, to: this._focus};
  }

  /**
   * @return {boolean}
   */
  isReversed() {
    return !this.isCollapsed() && TextPosition.compare(this._anchor, this._focus) > 0;
  }

  /**
   * @param {!TextRange} range
   */
  setRange(range) {
    if (TextRange.isEmpty(range)) {
      this._anchor = null;
      this._focus = range.from;
    } else if (this.isReversed()) {
      this._focus = range.from;
      this._anchor = range.to;
    } else {
      this._anchor = range.from;
      this._focus = range.to;
    }
  }
}
