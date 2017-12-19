import { TextUtils } from '../utils/TextUtils.mjs';

export class Viewport {
  /**
   * @param {!Document} document
   * @param {number} from
   * @param {number} to
   * @param {number} width
   * @param {number} height
   */
  constructor(document, from, to, width, height) {
    this._document = document;
    this._from = from;
    this._to = to;
    this._width = width;
    this._height = height;
    this._decorations = [];
    const start = this._document.offsetToPosition(this._from);
    this._startLine = start.line;
    this._startColumn = start.column;
    this._content = null;
    this._contentPadding = 0;
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
   * @param {number=} contentPadding
   * @return {!Array<string>}
   */
  content(contentPadding = 0) {
    if (!this._content || this._contentPadding < contentPadding) {
      this._content = [];
      this._contentPadding = contentPadding;
      for (let i = 0; i < this._height && i + this._startLine < this._document.lineCount(); ++i)
        this._content.push(TextUtils.lineChunk(this._document, this._startLine + i, this._startColumn - contentPadding, this._startColumn + this._width + contentPadding));
    }
    if (this._contentPadding === contentPadding)
      return this._content;
    return this._content.map(line => line.substring(this._contentPadding - contentPadding));
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
