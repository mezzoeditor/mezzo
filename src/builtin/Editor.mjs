import { State } from "./State.mjs";
import { Selection } from "./Selection.mjs";
import { TextPosition, TextRange, OffsetRange } from "../utils/Types.mjs";
import { Text } from "../core/Text.mjs";
import { TextUtils } from "../utils/TextUtils.mjs";

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
   * @return {!Text}
   */
  text() {
    return this._state.text;
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
    selection.setRange({from: 0, to: this._state.text.lastOffset()});
    state.selections = [selection];
    this._pushState(state);
  }

  performMoveLeft() {
    let state = this._state.clone('selection');
    this._clearUpDown(state);
    for (let selection of state.selections) {
      if (selection.isCollapsed())
        selection.setCaret(TextUtils.previousOffset(state.text, selection.focus()));
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
      selection.moveFocus(TextUtils.previousOffset(state.text, selection.focus()));
    this._joinSelections(state);
    this._pushState(state);
  }

  performMoveRight() {
    let state = this._state.clone('selection');
    this._clearUpDown(state);
    for (let selection of state.selections) {
      if (selection.isCollapsed())
        selection.setCaret(TextUtils.nextOffset(state.text, selection.focus()));
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
      selection.moveFocus(TextUtils.nextOffset(state.text, selection.focus()));
    this._joinSelections(state);
    this._pushState(state);
  }

  performMoveUp() {
    let state = this._state.clone('selection');
    for (let selection of state.selections) {
      if (selection.isCollapsed()) {
        let position = state.text.offsetToPosition(selection.focus());
        position = {
          line: position.line ? position.line - 1 : position.line,
          column: selection.saveUpDown(position.column)
        };
        selection.setCaret(state.text.positionToOffset(position, true /* clamp */));
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
      let position = state.text.offsetToPosition(selection.focus());
      position = {
        line: position.line ? position.line - 1 : position.line,
        column: selection.saveUpDown(position.column)
      };
      selection.moveFocus(state.text.positionToOffset(position, true /* clamp */));
    }
    this._joinSelections(state);
    this._pushState(state);
  }

  performMoveDown() {
    let state = this._state.clone('selection');
    for (let selection of state.selections) {
      if (selection.isCollapsed()) {
        let position = state.text.offsetToPosition(selection.focus());
        position = {
          line: position.line < state.text.lineCount() - 1 ? position.line + 1 : position.line,
          column: selection.saveUpDown(position.column)
        };
        selection.setCaret(state.text.positionToOffset(position, true /* clamp */));
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
      let position = state.text.offsetToPosition(selection.focus());
      position = {
        line: position.line < state.text.lineCount() - 1 ? position.line + 1 : position.line,
        column: selection.saveUpDown(position.column)
      };
      selection.moveFocus(state.text.positionToOffset(position, true /* clamp */));
    }
    this._joinSelections(state);
    this._pushState(state);
  }

  performMoveLineStart() {
    let state = this._state.clone('selection');
    this._clearUpDown(state);
    for (let selection of state.selections)
      selection.setCaret(TextUtils.lineStartOffset(state.text, selection.focus()));
    this._joinSelections(state);
    this._pushState(state);
  }

  performSelectLineStart() {
    let state = this._state.clone('selection');
    this._clearUpDown(state);
    for (let selection of state.selections)
      selection.moveFocus(TextUtils.lineStartOffset(state.text, selection.focus()));
    this._joinSelections(state);
    this._pushState(state);
  }

  performMoveLineEnd() {
    let state = this._state.clone('selection');
    this._clearUpDown(state);
    for (let selection of state.selections)
      selection.setCaret(TextUtils.lineEndOffset(state.text, seleciton.focus()));
    this._joinSelections(state);
    this._pushState(state);
  }

  performSelectLineEnd() {
    let state = this._state.clone('selection');
    this._clearUpDown(state);
    for (let selection of state.selections)
      selection.moveFocus(TextUtils.lineEndOffset(state.text, selection.focus()));
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
        range.to = TextUtils.nextOffset(state.text, range.to);
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
        range.from = TextUtils.previousOffset(state.text, range.from);
      return range;
    });
    this._joinSelections(state);
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
      if (OffsetRange.intersects(lastRange, nextRange))
        last.setRange(OffsetRange.join(lastRange, nextRange));
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
    for (let selection of state.selections)
      selection.setRange(TextUtils.clampRange(state.text, selection.range()));
    state.selections.sort((a, b) => OffsetRange.compare(a.range(), b.range()));
    this._joinSelections(state);
  }

  /**
   * @param {!State}
   * @param {string} s
   * @param {function(!Selection):!OffsetRange} rangeCallback
   */
  _replaceAtSelections(state, s, rangeCallback) {
    let delta = 0;
    for (let selection of state.selections) {
      let range = selection.range();
      range = TextUtils.clampRange(state.text, {from: range.from + delta, to: range.to + delta});
      selection.setRange(range);

      let replaced = rangeCallback.call(null, selection);
      state.text = state.text.replace(replaced.from, replaced.to, s);
      selection.setCaret(replaced.from + s.length);
      delta += s.length - (replaced.to - replaced.from);
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
