import { TextPosition, TextRange } from "./Types.mjs";

export class Selection {
  constructor() {
    this.anchor = null;
    this.focus = {lineNumber: 0, columnNumber: 0};
    this.upDownColumn = -1;
  }

  /**
   * @return {boolean}
   */
  isCollapsed() {
    return !this.anchor;
  }

  /**
   * @return {!TextRange}
   */
  range() {
    if (!this.anchor)
      return {from: this.focus, to: this.focus};
    if (TextPosition.compare(this.anchor, this.focus) > 0)
      return {from: this.focus, to: this.anchor};
    return {from: this.anchor, to: this.focus};
  }

  /**
   * @return {boolean}
   */
  _isReverse() {
    return ;
  }

  /**
   * @param {!TextRange} range
   */
  setRange(range) {
    if (TextRange.isEmpty(range)) {
      this.anchor = null;
      this.focus = range.from;
    } else if (this.anchor && TextPosition.compare(this.anchor, this.focus) > 0) {
      this.focus = range.from;
      this.anchor = range.to;
    } else {
      this.anchor = range.from;
      this.focus = range.to;
    }
  }
}
