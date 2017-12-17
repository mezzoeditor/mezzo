export class Viewport {
  /**
   * @param {!Editor} editor
   * @param {{line: number, column: number}} start
   * @param {{line: number, column: number}} end
   */
  constructor(editor, start, end) {
    this._editor = editor;
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
   * @return {!Editor}
   */
  editor() {
    return this._editor;
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
