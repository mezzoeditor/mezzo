import { Operation } from "./Operation.mjs";
import { Selection } from "./Selection.mjs";
import { TextPosition, TextRange } from "./Types.mjs";
import { Text } from "./Text.mjs";

export class Editor {
  constructor() {
    this._text = Text.withContent('');
    this._selections = [];
  }

  /**
   * @param {string} text
   * @return {!Operation}
   */
  setContent(text) {
    this._text = Text.withContent(text);
    this._selections = [];
    return Operation.full();
  }

  /**
   * @return {string}
   */
  content() {
    return this._text.content();
  }

  /**
   * @return {number}
   */
  lineCount() {
    return this._text.lineCount();
  }

  /**
   * @return {number}
   */
  longestLineLength() {
    return this._text.longestLineLength();
  }

  /**
   * @param {number} lineNumber
   * @return {?string}
   */
  line(lineNumber) {
    return this._text.line(lineNumber);
  }

  /**
   * @return {!Array<{!Selection}>}
   */
  selections() {
    return this._selections;
  }

  /**
   * @param {!Array<!Selection>} selections
   * @return {!Operation}
   */
  setSelections(selections) {
    this._selections = selections;
    this._clearUpDown();
    return this._normalizeSelections(Operation.selection(true /* structure */));
  }

  /**
   * @return {?Operation}
   */
  collapseSelections() {
    this._clearUpDown();
    let collapsed = false;
    for (let selection of this._selections)
      collapsed |= selection.collapse();
    if (collapsed)
      return this._normalizeSelections(Operation.selection(false /* structure */));
    return null;
  }

  /**
   * @return {!Operation}
   */
  selectAll() {
    this._clearUpDown();
    let selection = new Selection();
    selection.setRange({
      from: {lineNumber: 0, columnNumber: 0},
      to: this._text.lastPosition()
    });
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
        selection.setCaret(this._text.previousPosition(selection.focus()));
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
      selection.moveFocus(this._text.previousPosition(selection.focus()));
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performMoveRight() {
    this._clearUpDown();
    for (let selection of this._selections) {
      if (selection.isCollapsed())
        selection.setCaret(this._text.nextPosition(selection.focus()));
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
      selection.moveFocus(this._text.nextPosition(selection.focus()));
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performMoveUp() {
    for (let selection of this._selections) {
      if (selection.isCollapsed()) {
        let position = {lineNumber: selection.focus().lineNumber - 1, columnNumber: selection.saveUpDown()};
        selection.setCaret(this._text.clampPositionIfNeeded(position) || position);
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
      selection.moveFocus(this._text.clampPositionIfNeeded(position) || position);
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
        selection.setCaret(this._text.clampPositionIfNeeded(position) || position);
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
      selection.moveFocus(this._text.clampPositionIfNeeded(position) || position);
    }
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performMoveLineStart() {
    this._clearUpDown();
    for (let selection of this._selections)
      selection.setCaret(this._text.lineStartPosition(selection.focus()));
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performSelectLineStart() {
    this._clearUpDown();
    for (let selection of this._selections)
      selection.moveFocus(this._text.lineStartPosition(selection.focus()));
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performMoveLineEnd() {
    this._clearUpDown();
    for (let selection of this._selections)
      selection.setCaret(this._text.lineEndPosition(selection.focus()));
    return this._normalizeSelections(Operation.selection(false /* structure */));
  }

  /**
   * @return {!Operation}
   */
  performSelectLineEnd() {
    this._clearUpDown();
    for (let selection of this._selections)
      selection.moveFocus(this._text.lineEndPosition(selection.focus()));
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
      let lastRange = last.range();
      let next = this._selections[i];
      let nextRange = next.range();
      if (TextRange.intersects(lastRange, nextRange))
        last.setRange(TextRange.join(lastRange, nextRange));
      else
        this._selections[length++] = next;
    }
    if (length !== this._selections.length) {
      this._selections.splice(length, this._selections.length - length);
      op.selectionStructure = true;
    }
    return op;
  }

  /**
   * @param {string} s
   * @param {function(!Selection):!TextRange} rangeCallback
   * @return {!Operation}
   */
  _performReplaceAtSelections(s, rangeCallback) {
    let lines = s.split('\n');
    let first = lines.shift();
    let last = null;
    if (lines.length)
      last = lines.pop();
    let middle = lines.length ? Text.withLines(lines) : null;

    let delta = {
      startLine: 0,
      startColumn: 0,
      lineDelta: 0,
      columnDelta: 0
    };

    for (let selection of this._selections) {
      let range = selection.range();
      range.from = applyTextDelta(range.from, delta);
      range.to = applyTextDelta(range.to, delta);
      range = this._clampRangeIfNeeded(range) || range;
      selection.setRange(range);

      let {from, to} = rangeCallback.call(null, selection);
      let next = {
        startLine: to.lineNumber,
        startColumn: to.columnNumber,
        lineDelta: from.lineNumber + (last === null ? 0 : lines.length + 1) - to.lineNumber,
        columnDelta: (last === null ? from.columnNumber + first.length : last.length) - to.columnNumber
      };
      this._text = this._text.replaceRange({from, to}, first, middle, last);
      range.from = applyTextDelta(range.from, next);
      range.to = applyTextDelta(range.to, next);
      selection.setCaret(range.to);

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

    /**
     * @param {!TextPosition} position
     * @param {!TextDelta} delta
     * @return {!TextPosition}
     */
    function applyTextDelta(position, delta) {
      let {lineNumber, columnNumber} = position;
      if (lineNumber === delta.startLine && columnNumber >= delta.startColumn) {
        lineNumber += delta.lineDelta;
        columnNumber += delta.columnDelta;
      } else if (lineNumber > delta.startLine) {
        lineNumber += delta.lineDelta;
      }
      return {lineNumber, columnNumber};
    }
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
        range.to = this._text.nextPosition(range.to);
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
        range.from = this._text.previousPosition(range.from);
      return range;
    });
  }

  /**
   * @param {!TextPosition} position
   * @return {!TextPosition}
   */
  clampPosition(position) {
    return this._text.clampPositionIfNeeded(position) || position;
  }

  /**
   * @param {!TextRange} range
   * @return {?TextRange}
   */
  _clampRangeIfNeeded(range) {
    let from = this._text.clampPositionIfNeeded(range.from);
    let to = this._text.clampPositionIfNeeded(range.to);
    if (!from && !to)
      return null;
    return {from: from || range.from, to: to || range.to};
  }
}
