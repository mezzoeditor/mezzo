import { Line } from "./Line.mjs";

export class Text {
  /**
   * @param {string} content
   */
  constructor(content) {
    this._lines = content.split('\n').map(Line.from);
  }

  /**
   * @return {string}
   */
  content() {
    return this._lines.map(line => line.lineContent()).join('\n');
  }

  /**
   * @return {number}
   */
  lineCount() {
    return this._lines.length;
  }

  /**
   * @param {number} lineNumber
   * @return {!Line}
   */
  line(lineNumber) {
    return this._lines[lineNumber];
  }

  /**
   * @return {number}
   */
  longestLineLength() {
    return Math.max(...this._lines.map(line => line.length()));
  }

  /**
   * @param {number} fromLine
   * @param {number} toLine
   * @return {!Array<!Line>}
   */
  lines(fromLine, toLine) {
    return this._lines.slice(fromLine, toLine);
  }

  /**
   * @return {!TextPosition}
   */
  lastPosition() {
    return {lineNumber: this._lines.length - 1, columnNumber: this._lines[this._lines.length - 1].length()};
  }

  /**
   * @param {!TextPosition} position
   * @return {?TextPosition}
   */
  clampPositionIfNeeded(position) {
    let {lineNumber, columnNumber} = position;
    let clamped = false;
    if (lineNumber < 0) {
      lineNumber = 0;
      columnNumber = 0;
      clamped = true;
    } else if (lineNumber >= this._lines.length) {
      lineNumber = this._lines.length - 1;
      columnNumber = this._lines[this._lines.length - 1].length();
      clamped = true;
    } else if (columnNumber < 0) {
      columnNumber = 0;
      clamped = true;
    } else if (columnNumber > this._lines[lineNumber].length()) {
      columnNumber = this._lines[lineNumber].length();
      clamped = true;
    }
    return clamped ? {lineNumber, columnNumber} : null;
  }

  /**
   * @param {!TextPosition} pos
   * @return {!TextPosition}
   */
  nextPosition(pos) {
    if (pos.columnNumber === this._lines[pos.lineNumber].length()) {
      if (pos.lineNumber !== this._lines.length - 1)
        return {lineNumber: pos.lineNumber + 1, columnNumber: 0};
      else
        return {lineNumber: pos.lineNumber, columnNumber: pos.columnNumber};
    } else {
      return {lineNumber: pos.lineNumber, columnNumber: pos.columnNumber + 1};
    }
  }

  /**
   * @param {!TextPosition} pos
   * @return {!TextPosition}
   */
  previousPosition(pos) {
    if (!pos.columnNumber) {
      if (pos.lineNumber)
        return {lineNumber: pos.lineNumber - 1, columnNumber: this._lines[pos.lineNumber - 1].length()};
      else
        return {lineNumber: pos.lineNumber, columnNumber: pos.columnNumber};
    } else {
      return {lineNumber: pos.lineNumber, columnNumber: pos.columnNumber - 1};
    }
  }

  /**
   * @param {!TextPosition} pos
   * @return {!TextPosition}
   */
  lineStartPosition(pos) {
    return {lineNumber: pos.lineNumber, columnNumber: 0};
  }

  /**
   * @param {!TextPosition} pos
   * @return {!TextPosition}
   */
  lineEndPosition(pos) {
    return {lineNumber: pos.lineNumber, columnNumber: this._lines[pos.lineNumber].length()};
  }

  /**
   * @param {!TextRange} range
   * @param {string} first
   * @param {!Array<!Line>} middle
   * @param {?string} last
   */
  replaceRange(range, first, middle, last) {
    let {from, to} = range;
    if (from.lineNumber === to.lineNumber) {
      if (last === null) {
        let line = this._lines[from.lineNumber];
        this._lines[from.lineNumber] = line.replace(from.columnNumber, to.columnNumber, first);
      } else {
        let {left, right} = this._lines[from.lineNumber].split(to.columnNumber);
        this._lines[from.lineNumber] = left.replace(from.columnNumber, left.length(), first);
        this._lines.splice(from.lineNumber + 1, 0, ...middle, right.replace(0, 0, last));
      }
    } else {
      if (last === null) {
        let fromLine = this._lines[from.lineNumber];
        fromLine = fromLine.replace(from.columnNumber, fromLine.length(), first);
        let toLine = this._lines[to.lineNumber];
        toLine = toLine.replace(0, to.columnNumber, "");
        this._lines.splice(from.lineNumber, to.lineNumber - from.lineNumber + 1, fromLine.merge(toLine));
      } else {
        let line = this._lines[from.lineNumber];
        this._lines[from.lineNumber] = line.replace(from.columnNumber, line.length(), first);
        line = this._lines[to.lineNumber];
        this._lines[to.lineNumber] = line.replace(0, to.columnNumber, last);
        this._lines.splice(from.lineNumber + 1, to.lineNumber - from.lineNumber - 1, ...middle);
      }
    }
  }
}
