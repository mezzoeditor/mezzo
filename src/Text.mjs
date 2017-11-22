import { FontMetrics } from "./FontMetrics.mjs";
import { Operation } from "./Operation.mjs";
import { Selection } from "./Selection.mjs";
import { TextPosition, TextRange } from "./Types.mjs";

export class Text {
  constructor() {
    this._lines = [""];
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
    this._lines = text.split('\n');
    this._selections = [];
    // TODO: the operation is incorrect.
    return Operation.selection(true /* structure */);
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
    this._resetSelectionUpDownColumns();
    this._selections.push(selection);
    return this._normalizeSelections(Operation.selection(true /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performLeft() {
    this._resetSelectionUpDownColumns();
    for (let selection of this._selections) {
      let pos = selection.focus;
      if (!pos.columnNumber) {
        if (pos.lineNumber) {
          pos.lineNumber--;
          pos.columnNumber = this._lines[pos.lineNumber].length;
        }
      } else {
        pos.columnNumber--;
      }
    }
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performRight() {
    this._resetSelectionUpDownColumns();
    for (let selection of this._selections) {
      let pos = selection.focus;
      if (pos.columnNumber === this._lines[pos.lineNumber].length) {
        if (pos.lineNumber !== this._lines.length - 1) {
          pos.lineNumber++;
          pos.columnNumber = 0;
        }
      } else {
        pos.columnNumber++;
      }
    }
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performUp() {
    for (let selection of this._selections) {
      let pos = selection.focus;
      if (!pos.lineNumber)
        continue;
      if (selection.upDownColumn === -1)
        selection.upDownColumn = pos.columnNumber;
      pos.lineNumber--;
      pos.columnNumber = selection.upDownColumn;
      if (pos.columnNumber > this._lines[pos.lineNumber].length)
        pos.columnNumber = this._lines[pos.lineNumber].length;
    }
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performDown() {
    for (let selection of this._selections) {
      let pos = selection.focus;
      if (pos.lineNumber === this._lines.length - 1)
        continue;
      if (selection.upDownColumn === -1)
        selection.upDownColumn = pos.columnNumber;
      pos.lineNumber++;
      pos.columnNumber = selection.upDownColumn;
      if (pos.columnNumber > this._lines[pos.lineNumber].length)
        pos.columnNumber = this._lines[pos.lineNumber].length;
    }
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  _resetSelectionUpDownColumns() {
    for (let selection of this._selections)
    selection.upDownColumn = -1;
  }

  /**
   * @param {!Operation} op
   * @return {!Operation}
   */
  _normalizeSelections(op) {
    for (let selection of this._selections) {
      if (this._clampPosition(selection.focus))
        op.selection = true;
      if (selection.anchor && this._clampPosition(selection.anchor))
        op.selection = true;
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
  _performReplaceAtSelections(s, rangeCallback) {
    let insertion = this._prepareInsertion(s);
    let delta = {
      startLine: 0,
      startColumn: 0,
      lineDelta: 0,
      columnDelta: 0
    };

    for (let selection of this._selections) {
      let pos = selection.focus;
      this._applyTextDelta(pos, delta);
      this._clampPosition(pos);
      let range = rangeCallback.call(null, pos);
      let next = this._replaceRange(range, insertion);
      this._applyTextDelta(pos, next);

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

    // TODO: this is incorrect.
    return Operation.selection(false /* structure */);  }

  /**
   * @param {string} s
   * @return {!Operation}
   */
  _insertAtSelections(s) {
    return this._performReplaceAtSelections(s, pos => ({from: pos, to: pos}));
  }

  /**
   * @return {!Operation}
   */
  performNewLine() {
    this._resetSelectionUpDownColumns();
    return this._insertAtSelections("\n");
  }

  /**
   * @param {string} s
   * @return {!Operation}
   */
  performType(s) {
    this._resetSelectionUpDownColumns();
    return this._insertAtSelections(s);
  }

  /**
   * @param {string} s
   * @return {!Operation}
   */
  performPaste(s) {
    this._resetSelectionUpDownColumns();
    return this._insertAtSelections(s);
  }

  /**
   * @return {!Operation}
   */
  performDelete() {
    this._resetSelectionUpDownColumns();
    return this._performReplaceAtSelections("", pos => {
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
    this._resetSelectionUpDownColumns();
    return this._performReplaceAtSelections("", pos => {
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
   * @return {boolean}
   */
  _clampPosition(pos) {
    let clamped = false;
    if (pos.lineNumber < 0) {
      pos.lineNumber = 0;
      clamped = true;
    } else if (pos.lineNumber >= this._lines.length) {
      pos.lineNumber = this._lines.length - 1;
      clamped = true;
    }
    if (pos.columnNumber < 0) {
      pos.columnNumber = 0;
      clamped = true;
    } else if (pos.columnNumber > this._lines[pos.lineNumber].length) {
      pos.columnNumber = this._lines[pos.lineNumber].length;
      clamped = true;
    }
    return clamped;
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
