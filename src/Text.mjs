import { FontMetrics } from "./FontMetrics.mjs";
import { Operation } from "./Operation.mjs";
import { Cursor } from "./Cursor.mjs";

export class Text {
  constructor() {
    this._lines = [""];
    this._metrics = FontMetrics.createSimple();
    this._cursors = [];
  }

  /**
   * @param {!Editor.FontMetrics} metrics
   */
  setFontMetrics(metrics) {
    this._metrics = metrics;
  }

  /**
   * @return {!Editor.FontMetrics}
   */
  fontMetrics() {
    return this._metrics;
  }

  /**
   * @param {string} text
   * @return {!Operation}
   */
  setText(text) {
    this._lines = text.split('\n');
    this._cursors = [];
    // TODO: the operation is incorrect.
    return Operation.cursors(false /* moveOnly */);
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

  /**
   * @return {!Array<{!Cursor}>}
   */
  cursors() {
    return this._cursors;
  }

  /**
   * @param {!Cursor} cursor
   * @return {!Operation}
   */
  addCursor(cursor) {
    this._resetCursorUpDownColumns();
    this._cursors.push(cursor);
    this._sortCursors();
    return Operation.cursors(false /* moveOnly */);
  }

  /**
   * @return {!Operation}
   */
  moveLeft() {
    this._resetCursorUpDownColumns();
    for (let cursor of this._cursors) {
      let pos = cursor.position;
      if (!pos.columnNumber) {
        if (pos.lineNumber) {
          pos.lineNumber--;
          pos.columnNumber = this._lines[pos.lineNumber].length;
        }
      } else {
        pos.columnNumber--;
      }
    }
    this._sortCursors();
    return Operation.cursors(true /* moveOnly */);
  }

  /**
   * @return {!Operation}
   */
  moveRight() {
    this._resetCursorUpDownColumns();
    for (let cursor of this._cursors) {
      let pos = cursor.position;
      if (pos.columnNumber === this._lines[pos.lineNumber].length) {
        if (pos.lineNumber !== this._lines.length - 1) {
            pos.lineNumber++;
            pos.columnNumber = 0;
        }
      } else {
        pos.columnNumber++;
      }
    }
    this._sortCursors();
    return Operation.cursors(true /* moveOnly */);
  }

  /**
   * @return {!Operation}
   */
  moveUp() {
    for (let cursor of this._cursors) {
      let pos = cursor.position;
      if (!pos.lineNumber)
        continue;
      if (cursor.upDownColumn === -1)
        cursor.upDownColumn = pos.columnNumber;
      pos.lineNumber--;
      pos.columnNumber = cursor.upDownColumn;
      if (pos.columnNumber > this._lines[pos.lineNumber].length)
        pos.columnNumber = this._lines[pos.lineNumber].length;
    }
    this._sortCursors();
    return Operation.cursors(true /* moveOnly */);
  }

  /**
   * @return {!Operation}
   */
  moveDown() {
    for (let cursor of this._cursors) {
      let pos = cursor.position;
      if (pos.lineNumber === this._lines.length - 1)
        continue;
      if (cursor.upDownColumn === -1)
        cursor.upDownColumn = pos.columnNumber;
      pos.lineNumber++;
      pos.columnNumber = cursor.upDownColumn;
      if (pos.columnNumber > this._lines[pos.lineNumber].length)
        pos.columnNumber = this._lines[pos.lineNumber].length;
    }
    this._sortCursors();
    return Operation.cursors(true /* moveOnly */);
  }

  _resetCursorUpDownColumns() {
    for (let cursor of this._cursors)
      cursor.upDownColumn = -1;
  }

  _sortCursors() {
    this._cursors.sort((a, b) => {
      return (a.position.lineNumber - b.position.lineNumber) ||
             (a.position.columnNumber - b.position.columnNumber);
    });
  }

  /**
   * @param {string} s
   * @return {!Operation}
   */
  insertAtCursors(s) {
    this._resetCursorUpDownColumns();

    let lines = s.split('\n');
    let single = lines.length === 1;
    let first = lines[0];
    let last = lines[lines.length - 1];
    if (!single) {
      lines.shift();
      lines.pop();
    }

    let deltaLine = 0;
    let deltaColumn = 0;
    let lastLine = -1;
    for (let cursor of this._cursors) {
      let pos = cursor.position;
      pos.lineNumber += deltaLine;
      if (!single)
        deltaLine += lines.length + 1;
      if (pos.lineNumber === lastLine) {
        pos.columnNumber += deltaColumn;
        deltaColumn = single ? deltaColumn + last.length : last.length - pos.columnNumber;
      } else {
        deltaColumn = single ? last.length : last.length - pos.columnNumber;
      }

      let line = this._lines[pos.lineNumber];
      if (single) {
        line = line.substring(0, pos.columnNumber) + first + line.substring(pos.columnNumber);
        this._lines[pos.lineNumber] = line;
        pos.columnNumber += first.length;
      } else {
        let end = last + line.substring(pos.columnNumber);
        this._lines[pos.lineNumber] = line.substring(0, pos.columnNumber) + first;
        this._lines.splice(pos.lineNumber + 1, 0, ...lines, end);
        pos.lineNumber += lines.length + 1;
        pos.columnNumber = last.length;
      }
      lastLine = pos.lineNumber;
    }

    // TODO: this is incorrect.
    return Operation.cursors(true /* moveOnly */);
  }

  /**
   * @return {!Operation}
   */
  insertNewLineAtCursors() {
    // TODO: this should be reimplemented, e.g. for indentation.
    return this.insertAtCursors("\n");
  }

  /**
   * @param {!TextPosition} position
   * @return {?TextPoint}
   */
  positionToPoint(position) {
    return {
      x: position.columnNumber * this._metrics.charWidth,
      y: position.lineNumber * this._metrics.lineHeight
    };
  }

  /**
   * @param {!TextPoint}
   * @return {?TextPosition}
   */
  pointToPosition(point) {
    return {
      columnNumber: Math.floor(point.x / this._metrics.charWidth),
      lineNumber: Math.floor(point.y / this._netrics.lineHeight)
    };
  }

  /**
   * @param {!Operation} operation
   * @param {!TextRect} rect
   * @return {boolean}
   */
  operationAffectsRect(operation, rect) {
    return true;
  }
}
