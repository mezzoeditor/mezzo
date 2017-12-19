export class Viewport {
  /**
   * @param {!Document} document
   * @param {{line: number, column: number}} start
   * @param {{line: number, column: number}} end
   */
  constructor(document, start, end) {
    this._document = document;
    this._start = start;
    this._end = end;
    this._decorations = [];
  }

  /**
   * @return {{line: number, column: number}}
   */
  start() {
    return this._start;
  }

  /**
   * @return {{line: number, column: number}}
   */
  end() {
    return this._end;
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
   * @param {{line: number, column: number}} start
   * @param {{line: number, column: number}} end
   * @param {string} style
   */
  addDecoration(start, end, style) {
    this._decorations.push({start, end, style});
  }
}
