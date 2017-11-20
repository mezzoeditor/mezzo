import { FontMetrics } from "./FontMetrics.mjs";
import { Operation } from "./Operation.mjs";
import { Cursor } from "./Cursor.mjs";
import { compareTextPositions } from "./Types.mjs";

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
  performLeft() {
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
  performRight() {
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
  performUp() {
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
  performDown() {
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
      return compareTextPositions(a.position, b.position);
    });
  }

  /**
   * @param {!TextRange} range
   * @param {{lines: !Array<string>, single: boolean, first: string, last: string}} insertion
   * @return {!TextDelta}
   */
  _replaceRange(range, insertion) {
    let {from, to} = range;
    if (compareTextPositions(from, to) > 0)
      throw 'Passed reverse range to replace';
    let {lines, single, first, last} = insertion;

    let delta = {
      startLine: to.lineNumber,
      startColumn: to.columnNumber,
      lineDelta: from.lineNumber + (single ? 0 : lines.length + 1) - to.lineNumber,
      columnDelta: (single ? from.columnNumber + first.length : last.length) - to.columnNumber
    };

    if (from.lineNumber === to.lineNumber) {
      if (single) {
        let line = this._lines[from.lineNumber];
        line = line.substring(0, from.columnNumber) + first + line.substring(to.columnNumber);
        this._lines[from.lineNumber] = line;
      } else {
        let line = this._lines[from.lineNumber];
        let end = last + line.substring(to.columnNumber);
        this._lines[from.lineNumber] = line.substring(0, from.columnNumber) + first;
        this._lines.splice(from.lineNumber + 1, 0, ...lines, end);
      }
    } else {
      if (single) {
        let line = this._lines[from.lineNumber].substring(0, from.columnNumber) + first +
                   this._lines[to.lineNumber].substring(to.columnNumber);
        this._lines.splice(from.lineNumber, to.lineNumber - from.lineNumber + 1, line);
      } else {
        this._lines[from.lineNumber] = this._lines[from.lineNumber].substring(0, from.columnNumber) + first;
        this._lines[to.lineNumber] = last + this._lines[to.lineNumber].substring(to.columnNumber);
        this._lines.splice(from.lineNumber + 1, to.lineNumber - from.lineNumber - 1, ...lines);
      }
    }

    return delta;
  }

  /**
   * @param {!TextPosition} position
   * @param {!TextDelta} delta
   */
  _applyTextDelta(position, delta) {
    if (position.lineNumber === delta.startLine && position.columnNumber >= delta.startColumn) {
      position.lineNumber += delta.lineDelta;
      position.columnNumber += delta.columnDelta;
    } else if (position.lineNumber > delta.startLine) {
      position.lineNumber += delta.lineDelta;
    }
  }

  /**
   * @param {!TextDelta} a
   * @param {!TextDelta} b
   */
  _combineTextDeltas(a, b) {
    return {
      lineDelta: a.lineDelta + b.lineDelta,
      startLine: b.startLine,
      startColumn: b.startColumn,
      columnDelta: a.startLine === b.startLine ? a.columnDelta + b.columnDelta : b.columnDelta
    };
  }

  /**
   * @param {string} s
   * @return {{lines: !Array<string>, single: boolean, first: string, last: string}}
   */
  _prepareInsertion(s) {
    let lines = s.split('\n');
    let single = lines.length === 1;
    let first = lines[0];
    let last = lines[lines.length - 1];
    if (!single) {
      lines.shift();
      lines.pop();
    }
    return {lines, single, first, last};
  }

  /**
   * @param {string} s
   * @param {function(!TextPosition):!TextRange} rangeCallback
   * @return {!Operation}
   */
  _performReplaceAtCursors(s, rangeCallback) {
    let insertion = this._prepareInsertion(s);
    let delta = {
      startLine: 0,
      startColumn: 0,
      lineDelta: 0,
      columnDelta: 0
    };

    for (let cursor of this._cursors) {
      let pos = cursor.position;
      this._applyTextDelta(pos, delta);
      this._clampPosition(pos);
      let range = rangeCallback.call(null, pos);
      let nextDelta = this._replaceRange(range, insertion);
      this._applyTextDelta(pos, nextDelta);
      delta = this._combineTextDeltas(delta, nextDelta);
    }

    // TODO: this is incorrect.
    return Operation.cursors(true /* moveOnly */);  }

  /**
   * @param {string} s
   * @return {!Operation}
   */
  _insertAtCursors(s) {
    return this._performReplaceAtCursors(s, pos => ({from: pos, to: pos}));
  }

  /**
   * @return {!Operation}
   */
  performNewLine() {
    this._resetCursorUpDownColumns();
    return this._insertAtCursors("\n");
  }

  /**
   * @param {string} s
   * @return {!Operation}
   */
  performType(s) {
    this._resetCursorUpDownColumns();
    return this._insertAtCursors(s);
  }

  /**
   * @param {string} s
   * @return {!Operation}
   */
  performPaste(s) {
    this._resetCursorUpDownColumns();
    return this._insertAtCursors(s);
  }

  /**
   * @return {!Operation}
   */
  performDelete() {
    this._resetCursorUpDownColumns();
    return this._performReplaceAtCursors("", pos => {
      if (pos.columnNumber === this._lines[pos.lineNumber].length) {
        if (pos.lineNumber !== this._lines.length - 1)
          return {from: pos, to: {lineNumber: pos.lineNumber + 1, columnNumber: 0}};
        else
          return {from: pos, to: pos};
      } else {
        return {from: pos, to: {lineNumber: pos.lineNumber, columnNumber: pos.columnNumber + 1}};
      }
    });
  }

  /**
   * @return {!Operation}
   */
  performBackspace() {
    this._resetCursorUpDownColumns();
    return this._performReplaceAtCursors("", pos => {
      if (!pos.columnNumber) {
        if (pos.lineNumber)
          return {from: {lineNumber: pos.lineNumber - 1, columnNumber: this._lines[pos.lineNumber - 1].length}, to: pos};
        else
          return {from: pos, to: pos};
      } else {
        return {from: {lineNumber: pos.lineNumber, columnNumber: pos.columnNumber - 1}, to: pos};
      }
    });
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
   * @param {!TextPosition} pos
   */
  _clampPosition(pos) {
    if (pos.lineNumber < 0)
      pos.lineNumber = 0;
    else if (pos.lineNumber >= this._lines.length)
      pos.lineNumber = this._lines.length - 1;
    if (pos.columnNumber < 0)
      pos.columnNumber = 0;
    else if (pos.columnNumber > this._lines[pos.lineNumber].length)
      pos.columnNumber = this._lines[pos.lineNumber].length;
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
