import { TextUtils } from '../utils/TextUtils.mjs';

export class Viewport {
  /**
   * @param {!Document} document
   * @param {!TextPosition} start
   * @param {number} width
   * @param {number} height
   */
  constructor(document, start, width, height) {
    this._document = document;
    this._from = this._document.positionToOffset(start, true /* clamp */);
    this._to = this._document.positionToOffset({
      line: start.line + height,
      column: start.column + width
    }, true /* clamp */);
    this._width = width;
    this._height = height;
    this._decorations = [];
    this._startLine = start.line;
    this._startColumn = start.column;
    this._endLine = Math.min(start.line + height, document.lineCount());
  }

  /**
   * @return {number}
   */
  startLine() {
    return this._startLine;
  }

  /**
   * @return {number}
   */
  endLine() {
    return this._endLine;
  }

  /**
   * @return {number}
   */
  startColumn() {
    return this._startColumn;
  }

  /**
   * @return {number}
   */
  from() {
    return this._from;
  }

  /**
   * @return {number}
   */
  to() {
    return this._to;
  }

  /**
   * @return {number}
   */
  width() {
    return this._width;
  }

  /**
   * @return {number}
   */
  height() {
    return this._width;
  }

  /**
   * @return {!Document}
   */
  document() {
    return this._document;
  }

  decorations() {
    // TODO: we should actually intersect all of them and produce nice output for renderer.
    return this._decorations;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {string} style
   */
  addDecoration(from, to, style) {
    if (this._from > to || this._to < from)
      return;
    this._decorations.push({from, to, style});
  }
}
