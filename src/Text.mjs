export class Text {
  constructor() {
    this._lines = [""];
  }

  /**
   * @param {string} text
   */
  setText(text) {
    this._lines = text.split('\n');
  }

  /**
   * @return {string}
   */
  text() {
    return this._lines.join('\n');
  }

  /**
   * @return {number}
   */
  lineCount() {
    return this._lines.length;
  }

  /**
   * @param {number} lineNumber
   * @return {string}
   */
  line(lineNumber) {
    return this._lines[lineNumber];
  }
}
