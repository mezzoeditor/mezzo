import { State } from "./State.mjs";
import { Selection } from "./Selection.mjs";
import { TextPosition, TextRange } from "./Types.mjs";
import { Text } from "./Text.mjs";

export class Editor {
  constructor() {
    this._state = new State();
    this._state.text = Text.withContent('');
    this._state.selections = [];

    this._history = [this._state];
    this._historyPosition = 0;
  }

  // ---------- Misc API ----------

  /**
   * @param {!TextPosition} position
   * @return {!TextPosition}
   */
  clampPosition(position) {
    return this._state.text.clampPositionIfNeeded(position) || position;
  }

  /**
   * @param {string} text
   */
  setContent(text) {
    // TODO: need API to reset history.
    let state = this._state.clone('special');
    state.text = Text.withContent(text);
    state.selections = [];
    this._pushState(state);
  }

  /**
   * @return {string}
   */
  content() {
    return this._state.text.content();
  }

  /**
   * @return {number}
   */
  lineCount() {
    return this._state.text.lineCount();
  }

  /**
   * @return {number}
   */
  renderLineCount() {
    return this._state.text.renderLineCount();
  }

  /**
   * @return {number}
   */
  longestLineLength() {
    return this._state.text.longestLineLength();
  }

  /**
   * @param {number} lineNumber
   * @return {?string}
   */
  line(lineNumber) {
    return this._state.text.line(lineNumber);
  }

  /**
   * @param {number} from
   * @param {number} to
   * @return {{lineNumber: !Array<string|!Marker>}}
   */
  renderLines(from, to) {
    return this._state.text.renderLines(from, to);
  }

  /**
   * @return {!Array<{!Selection}>}
   */
  selections() {
    return this._state.selections;
  }

  /**
   * @param {!Array<!Selection>} selections
   */
  setSelections(selections) {
    let state = this._state.clone('selection');
    state.selections = selections;
    this._clearUpDown(state);
    this._rebuildSelections(state);
    this._pushState(state);
  }

  // ---------- History API ----------

  /**
   * @return {boolean}
   */
  performUndo() {
    if (this._historyPosition === 0)
      return false;
    this._state = this._history[--this._historyPosition];
    // TODO: report reversed diff.
    return true;
  }

  /**
   * @return {boolean}
   */
  performRedo() {
    if (this._historyPosition === this._history.length - 1)
      return false;
    this._state = this._history[++this._historyPosition];
    // TODO: report diff.
    return true;
  }

  // ---------- Selection API ----------

  /**
   * @return {boolean}
   */
  performCollapseSelections() {
    let state = this._state.clone('selection');
    this._clearUpDown(state);
    let collapsed = false;
    for (let selection of state.selections)
      collapsed |= selection.collapse();
    if (!collapsed)
      return false;
    this._pushState(state);
    return true;
  }

  performSelectAll() {
    let state = this._state.clone('selection');
    let selection = new Selection();
    selection.setRange({
      from: this._state.text.firstPosition(),
      to: this._state.text.lastPosition()
    });
    state.selections = [selection];
    this._pushState(state);
  }

  performMoveLeft() {
    let state = this._state.clone('selection');
    this._clearUpDown(state);
    for (let selection of state.selections) {
      if (selection.isCollapsed())
        selection.setCaret(state.text.previousPosition(selection.focus()));
      else
        selection.setCaret(selection.range().from);
    }
    this._joinSelections(state);
    this._pushState(state);
  }

  performSelectLeft() {
    let state = this._state.clone('selection');
    this._clearUpDown(state);
    for (let selection of state.selections)
      selection.moveFocus(state.text.previousPosition(selection.focus()));
    this._joinSelections(state);
    this._pushState(state);
  }

  performMoveRight() {
    let state = this._state.clone('selection');
    this._clearUpDown(state);
    for (let selection of state.selections) {
      if (selection.isCollapsed())
        selection.setCaret(state.text.nextPosition(selection.focus()));
      else
        selection.setCaret(selection.range().to);
    }
    this._joinSelections(state);
    this._pushState(state);
  }

  performSelectRight() {
    let state = this._state.clone('selection');
    this._clearUpDown(state);
    for (let selection of state.selections)
      selection.moveFocus(state.text.nextPosition(selection.focus()));
    this._joinSelections(state);
    this._pushState(state);
  }

  performMoveUp() {
    let state = this._state.clone('selection');
    for (let selection of state.selections) {
      if (selection.isCollapsed()) {
        let position = {lineNumber: selection.focus().lineNumber - 1, columnNumber: selection.saveUpDown()};
        selection.setCaret(state.text.clampPositionIfNeeded(position) || position);
      } else {
        selection.setCaret(selection.range().from);
      }
    }
    this._joinSelections(state);
    this._pushState(state);
  }

  performSelectUp() {
    let state = this._state.clone('selection');
    for (let selection of state.selections) {
      let position = {lineNumber: selection.focus().lineNumber - 1, columnNumber: selection.saveUpDown()};
      selection.moveFocus(state.text.clampPositionIfNeeded(position) || position);
    }
    this._joinSelections(state);
    this._pushState(state);
  }

  performMoveDown() {
    let state = this._state.clone('selection');
    for (let selection of state.selections) {
      if (selection.isCollapsed()) {
        let position = {lineNumber: selection.focus().lineNumber + 1, columnNumber: selection.saveUpDown()};
        selection.setCaret(state.text.clampPositionIfNeeded(position) || position);
      } else {
        selection.setCaret(selection.range().to);
      }
    }
    this._joinSelections(state);
    this._pushState(state);
  }

  performSelectDown() {
    let state = this._state.clone('selection');
    for (let selection of state.selections) {
      let position = {lineNumber: selection.focus().lineNumber + 1, columnNumber: selection.saveUpDown()};
      selection.moveFocus(state.text.clampPositionIfNeeded(position) || position);
    }
    this._joinSelections(state);
    this._pushState(state);
  }

  performMoveLineStart() {
    let state = this._state.clone('selection');
    this._clearUpDown(state);
    for (let selection of state.selections)
      selection.setCaret(state.text.lineStartPosition(selection.focus()));
    this._joinSelections(state);
    this._pushState(state);
  }

  performSelectLineStart() {
    let state = this._state.clone('selection');
    this._clearUpDown(state);
    for (let selection of state.selections)
      selection.moveFocus(state.text.lineStartPosition(selection.focus()));
    this._joinSelections(state);
    this._pushState(state);
  }

  performMoveLineEnd() {
    let state = this._state.clone('selection');
    this._clearUpDown(state);
    for (let selection of state.selections)
      selection.setCaret(state.text.lineEndPosition(selection.focus()));
    this._joinSelections(state);
    this._pushState(state);
  }

  performSelectLineEnd() {
    let state = this._state.clone('selection');
    this._clearUpDown(state);
    for (let selection of state.selections)
      selection.moveFocus(state.text.lineEndPosition(selection.focus()));
    this._joinSelections(state);
    this._pushState(state);
  }

  // ---------- Editing API ----------

  performNewLine() {
    let state = this._state.clone('text');
    this._clearUpDown(state);
    this._replaceAtSelections(state, "\n", selection => selection.range());
    this._joinSelections(state);
    this._pushState(state);
  }

  /**
   * @param {string} s
   */
  performType(s) {
    let state = this._state.clone('text');
    this._clearUpDown(state);
    this._replaceAtSelections(state, s, selection => selection.range());
    this._joinSelections(state);
    this._pushState(state);
  }

  /**
   * @param {string} s
   */
  performPaste(s) {
    let state = this._state.clone('special');
    this._clearUpDown(state);
    this._replaceAtSelections(state, s, selection => selection.range());
    this._joinSelections(state);
    this._pushState(state);
  }

  performDeleteAfter() {
    let state = this._state.clone('text');
    this._clearUpDown(state);
    this._replaceAtSelections(state, "", selection => {
      let range = selection.range();
      if (selection.isCollapsed())
        range.to = state.text.nextPosition(range.to);
      return range;
    });
    this._joinSelections(state);
    this._pushState(state);
  }

  performDeleteBefore() {
    let state = this._state.clone('text');
    this._clearUpDown(state);
    this._replaceAtSelections(state, "", selection => {
      let range = selection.range();
      if (selection.isCollapsed())
        range.from = state.text.previousPosition(range.from);
      return range;
    });
    this._joinSelections(state);
    this._pushState(state);
  }

  // ---------- Markers API ----------

  /**
   * @param {!Marker} marker
   * @param {number} lineNumber
   */
  insertLineMarker(marker, lineNumber) {
    let state = this._state.clone('marker');
    state.text = state.text.insertLineMarker(marker, lineNumber);
    this._pushState(state);
  }

  // ---------- Internal ----------

  /**
   * @param {!State} state
   */
  _clearUpDown(state) {
    // TODO: do this when cloning state with opt-out?
    for (let selection of state.selections)
      selection.clearUpDown();
  }

  /**
   * @param {!State} state
   */
  _joinSelections(state) {
    let length = 1;
    for (let i = 1; i < state.selections.length; i++) {
      let last = state.selections[length - 1];
      let lastRange = last.range();
      let next = state.selections[i];
      let nextRange = next.range();
      if (TextRange.intersects(lastRange, nextRange))
        last.setRange(TextRange.join(lastRange, nextRange));
      else
        state.selections[length++] = next;
    }
    if (length !== state.selections.length)
      state.selections.splice(length, state.selections.length - length);
  }

  /**
   * @param {!State} state
   */
  _rebuildSelections(state) {
    for (let selection of state.selections) {
      let range = selection.range();
      selection.setRange(state.text.clampRangeIfNeeded(range) || range);
    }
    state.selections.sort((a, b) => TextRange.compare(a.range(), b.range()));
    this._joinSelections(state);
  }

  /**
   * @param {!State}
   * @param {string} s
   * @param {function(!Selection):!TextRange} rangeCallback
   */
  _replaceAtSelections(state, s, rangeCallback) {
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

    for (let selection of state.selections) {
      let range = selection.range();
      range.from = applyTextDelta(range.from, delta);
      range.to = applyTextDelta(range.to, delta);
      range = state.text.clampRangeIfNeeded(range) || range;
      selection.setRange(range);

      let {from, to} = rangeCallback.call(null, selection);
      let next = {
        startLine: to.lineNumber,
        startColumn: to.columnNumber,
        lineDelta: from.lineNumber + (last === null ? 0 : lines.length + 1) - to.lineNumber,
        columnDelta: (last === null ? from.columnNumber + first.length : last.length) - to.columnNumber
      };
      state.text = state.text.replaceRange({from, to}, first, middle, last);
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

    /**
     * @param {!TextPosition} position
     * @param {!{lineDelta: number, columnDelta: number, startLine: number, startColumn: number}} delta
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
   * @param {!State} state
   */
  _pushState(state) {
    // TODO: report diff.
    if (!this._state.coalesce(state)) {
      if (this._historyPosition === this._history.length - 1) {
        this._history.push(state);
        ++this._historyPosition;
      } else {
        this._history[++this._historyPosition] = state;
      }
      if (state.text !== this._state.text)
        this._state.text.resetCache();
      this._state = state;
    }
    if (this._history.length > this._historyPosition + 1)
      this._history.splice(this._historyPosition + 1, this._history.length - this._historyPosition + 1);
  }
}
