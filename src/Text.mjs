import { FontMetrics } from "./FontMetrics.mjs";
import { Operation } from "./Operation.mjs";
import { Selection } from "./Selection.mjs";
import { TextPosition, TextRange } from "./Types.mjs";
import { Line } from "./Line.mjs";

export class Text {
  constructor() {
    this._lines = [new Line("")];
    this._metrics = FontMetrics.createSimple();
    this._selections = [];
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
    this._lines = text.split('\n').map(s => new Line(s));
    this._selections = [];
    // TODO: add replace information to operation.
    return Operation.selection(true /* structure */);
  }

  /**
   * @return {string}
   */
  text() {
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
   * @param {number} fromLine
   * @param {number} toLine
   * @return {!Array<!Line>}
   */
  lines(fromLine, toLine) {
    return this._lines.slice(fromLine, toLine);
  }

  /**
   * @return {!Array<{!Selection}>}
   */
  selections() {
    return this._selections;
  }

  /**
   * @param {!Selection} selection
   * @return {!Operation}
   */
  addSelection(selection) {
    this._clearUpDown();
    this._selections.push(selection);
    return this._normalizeSelections(Operation.selection(true /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performMoveLeft() {
    this._clearUpDown();
    for (let selection of this._selections) {
      if (selection.isCollapsed())
        selection.setCaret(this._previousPosition(selection.focus()));
      else
        selection.setCaret(selection.range().from);
    }
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performSelectLeft() {
    this._clearUpDown();
    for (let selection of this._selections)
      selection.moveFocus(this._previousPosition(selection.focus()));
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performMoveRight() {
    this._clearUpDown();
    for (let selection of this._selections) {
      if (selection.isCollapsed())
        selection.setCaret(this._nextPosition(selection.focus()));
      else
        selection.setCaret(selection.range().to);
    }
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performSelectRight() {
    this._clearUpDown();
    for (let selection of this._selections)
      selection.moveFocus(this._nextPosition(selection.focus()));
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performMoveUp() {
    for (let selection of this._selections) {
      if (selection.isCollapsed()) {
        let position = {lineNumber: selection.focus().lineNumber - 1, columnNumber: selection.saveUpDown()};
        selection.setCaret(this._clampPositionIfNeeded(position) || position);
      } else {
        selection.setCaret(selection.range().from);
      }
    }
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performSelectUp() {
    for (let selection of this._selections) {
      let position = {lineNumber: selection.focus().lineNumber - 1, columnNumber: selection.saveUpDown()};
      selection.moveFocus(this._clampPositionIfNeeded(position) || position);
    }
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performMoveDown() {
    for (let selection of this._selections) {
      if (selection.isCollapsed()) {
        let position = {lineNumber: selection.focus().lineNumber + 1, columnNumber: selection.saveUpDown()};
        selection.setCaret(this._clampPositionIfNeeded(position) || position);
      } else {
        selection.setCaret(selection.range().to);
      }
    }
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performSelectDown() {
    for (let selection of this._selections) {
      let position = {lineNumber: selection.focus().lineNumber + 1, columnNumber: selection.saveUpDown()};
      selection.moveFocus(this._clampPositionIfNeeded(position) || position);
    }
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  _clearUpDown() {
    for (let selection of this._selections)
      selection.clearUpDown();
  }

  /**
   * @param {!Operation} op
   * @return {!Operation}
   */
  _normalizeSelections(op) {
    for (let selection of this._selections) {
      let range = selection.range();
      let clamped = this._clampRangeIfNeeded(range);
      if (clamped) {
        selection.setRange(clamped);
        op.selection = true;
      }
    }
    this._selections.sort((a, b) => TextRange.compare(a.range(), b.range()));
    let length = 1;
    for (let i = 1; i < this._selections.length; i++) {
      let last = this._selections[length - 1];
      let selection = this._selections[i];
      let joined = TextRange.joinIfIntersecting(last.range(), selection.range());
      if (joined)
        last.setRange(joined);
      else
        this._selections[length++] = selection;
    }
    if (length !== this._selections.length) {
      this._selections.splice(length, this._selections.length - length);
      op.selectionStructure = true;
    }
    return op;
  }

  /**
   * @param {!TextRange} range
   * @param {{lines: !Array<string>, single: boolean, first: string, last: string}} insertion
   * @return {!TextDelta}
   */
  _replaceRange(range, insertion) {
    let {from, to} = range;
    let {lines, single, first, last} = insertion;

    let delta = {
      startLine: to.lineNumber,
      startColumn: to.columnNumber,
      lineDelta: from.lineNumber + (single ? 0 : lines.length + 1) - to.lineNumber,
      columnDelta: (single ? from.columnNumber + first.length : last.length) - to.columnNumber
    };

    if (from.lineNumber === to.lineNumber) {
      if (single) {
        this._lines[from.lineNumber].replace(from.columnNumber, to.columnNumber, first);
      } else {
        let line = this._lines[from.lineNumber];
        let end = line.split(to.columnNumber);
        end.replace(0, 0, last);
        line.replace(from.columnNumber, line.length(), first);
        this._lines.splice(from.lineNumber + 1, 0, ...(lines.map(s => new Line(s))), end);
      }
    } else {
      if (single) {
        let fromLine = this._lines[from.lineNumber];
        fromLine.replace(from.columnNumber, fromLine.length(), first);
        let endLine = this._lines[to.lineNumber];
        endLine.replace(0, to.columnNumber, "");
        this._lines.splice(from.lineNumber, to.lineNumber - from.lineNumber + 1, fromLine.merge(endLine));
      } else {
        this._lines[from.lineNumber].replace(from.columnNumber, this._lines[from.lineNumber].length(), first);
        this._lines[to.lineNumber].replace(0, to.columnNumber, last);
        this._lines.splice(from.lineNumber + 1, to.lineNumber - from.lineNumber - 1, ...lines);
      }
    }

    return delta;
  }

  /**
   * @param {!TextPosition} position
   * @param {!TextDelta} delta
   * @return {!TextPosition}
   */
  _applyTextDelta(position, delta) {
    let {lineNumber, columnNumber} = position;
    if (lineNumber === delta.startLine && columnNumber >= delta.startColumn) {
      lineNumber += delta.lineDelta;
      columnNumber += delta.columnDelta;
    } else if (lineNumber > delta.startLine) {
      lineNumber += delta.lineDelta;
    }
    return {lineNumber, columnNumber};
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
   * @param {function(!Selection):!TextRange} rangeCallback
   * @return {!Operation}
   */
  _performReplaceAtSelections(s, rangeCallback) {
    let insertion = this._prepareInsertion(s);
    let delta = {
      startLine: 0,
      startColumn: 0,
      lineDelta: 0,
      columnDelta: 0
    };

    for (let selection of this._selections) {
      let range = selection.range();
      range.from = this._applyTextDelta(range.from, delta);
      range.to = this._applyTextDelta(range.to, delta);
      range = this._clampRangeIfNeeded(range) || range;
      selection.setRange(range);

      let next = this._replaceRange(rangeCallback.call(null, selection), insertion);
      range.from = this._applyTextDelta(range.from, next);
      range.to = this._applyTextDelta(range.to, next);
      selection.setRange(range);
      
      if (next.startLine - delta.lineDelta === delta.startLine) {
        delta.startColumn = next.startColumn - delta.columnDelta;
        delta.columnDelta += next.columnDelta;
      } else {
        delta.startColumn = next.startColumn;
        delta.columnDelta = next.columnDelta;
      }
      delta.startLine = next.startLine - delta.lineDelta;
      delta.lineDelta += next.lineDelta;
    }

    // TODO: add replacement info to operation.
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performNewLine() {
    this._clearUpDown();
    return this._performReplaceAtSelections("\n", selection => selection.range());
  }

  /**
   * @param {string} s
   * @return {!Operation}
   */
  performType(s) {
    this._clearUpDown();
    return this._performReplaceAtSelections(s, selection => selection.range());
  }

  /**
   * @param {string} s
   * @return {!Operation}
   */
  performPaste(s) {
    this._clearUpDown();
    return this._performReplaceAtSelections(s, selection => selection.range());
  }

  /**
   * @return {!Operation}
   */
  performDeleteAfter() {
    this._clearUpDown();
    return this._performReplaceAtSelections("", selection => {
      let range = selection.range();
      if (selection.isCollapsed())
        range.to = this._nextPosition(range.to);
      return range;
    });
  }

  /**
   * @return {!Operation}
   */
  performDeleteBefore() {
    this._clearUpDown();
    return this._performReplaceAtSelections("", selection => {
      let range = selection.range();
      if (selection.isCollapsed())
        range.from = this._previousPosition(range.from);
      return range;
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
   * @param {!TextPosition} position
   * @return {?TextPosition}
   */
  _clampPositionIfNeeded(position) {
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
   * @param {!TextRange} range
   * @return {?TextRange}
   */
  _clampRangeIfNeeded(range) {
    let from = this._clampPositionIfNeeded(range.from);
    let to = this._clampPositionIfNeeded(range.to);
    if (!from && !to)
      return null;
    return {from: from || range.from, to: to || range.to};
  }

  /**
   * @param {!TextPosition} pos
   * @return {!TextPosition}
   */
  _nextPosition(pos) {
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
  _previousPosition(pos) {
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
   * @param {!Operation} operation
   * @param {!TextRect} rect
   * @return {boolean}
   */
  operationAffectsRect(operation, rect) {
    return true;
  }
}
