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
    this._resetCursorUpDownColumns();
    return new Operation(Operation.Type.Replace);
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
    return Operation.cursors(true /* moveOnly */);
  }

  /**
   * @return {!Operation}
   */
  moveRight() {
    this._resetCursorUpDownColumns();
    for (let cursor of this._cursors) {
      let pos = cursor.position;
      if (pos.lineNumber !== this._lines.length) {
        if (pos.columnNumber === this._lines[pos.lineNumber].length) {
          pos.lineNumber++;
          pos.columnNumber = 0;
        } else {
          pos.columnNumber++;
        }
      }
    }
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
    return Operation.cursors(true /* moveOnly */);
  }

  /**
   * @return {!Operation}
   */
  moveDown() {
    for (let cursor of this._cursors) {
      let pos = cursor.position;
      if (pos.lineNumber === this._lines.length)
        continue;
      if (cursor.upDownColumn === -1)
        cursor.upDownColumn = pos.columnNumber;
      pos.lineNumber++;
      pos.columnNumber = cursor.upDownColumn;
      if (pos.lineNumber === this._lines.length)
        pos.columnNumber = 0;
      else if (pos.columnNumber > this._lines[pos.lineNumber].length)
        pos.columnNumber = this._lines[pos.lineNumber].length;
    }
    return Operation.cursors(true /* moveOnly */);
  }

  _resetCursorUpDownColumns() {
    for (let cursor of this._cursors)
      cursor.upDownColumn = -1;
  }

  /**
   * @param {string} s
   * @return {!Operation}
   */
  insertAtCursors(s) {
    this._resetCursorUpDownColumns();
    return this.setText(this.text() + s);
  }

  /**
   * @param {!TextPosition} position
   * @return {?TextPoint}
   */
  positionToPoint(position) {
    return {
      x: position.columnNumber * this._metrics.charWidth,
      y: position.lineNumber * this._metrics.charHeight
    };
  }

  /**
   * @param {!TextPoint}
   * @return {?TextPosition}
   */
  pointToPosition(point) {
    return {
      columnNumber: Math.floor(point.x / this._metrics.charWidth),
      lineNumber: Math.floor(point.y / this._netrics.charHeight)
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
