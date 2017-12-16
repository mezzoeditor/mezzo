export class Selection {
  constructor() {
    this._anchor = null;
    this._focus = 0;
    this._upDownColumn = -1;
  }

  /**
   * @return {!Selection}
   */
  clone() {
    let selection = new Selection();
    selection._anchor = this._anchor;
    selection._focus = this._focus;
    selection._upDownColumn = this._upDownColumn;
    return selection;
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
}
