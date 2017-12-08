export class State {
  constructor() {
    this.text = null;
    // Always sorted and disjoiint.
    this.selections = null;

    // Diff compared to previous state.
    this.operation = 'special';
    this.lineWidgetsRemoved = [];
  }

  /**
   * @param {string} operation
   * @param {boolean=} keepUpDown
   * @return {!State}
   */
  clone(operation, keepUpDown) {
    let state = new State();
    state.text = this.text;
    state.selections = [];
    // TODO: should this be optimized?
    for (let selection of this.selections)
      state.selections.push(selection.clone());
    state.operation = operation;
    return state;
  }

  /**
   * @param {!State} other
   * @return {boolean}
   */
  coalesce(other) {
    // TODO: get this right.
    return false;

    if (other.operation === 'special' || this.operation === 'special')
      return false;
    if (this.operation === 'text' && other.operation !== 'text')
      return false;

    if (other.operation === 'text')
      this.operation = 'text';
    else if (other.operation === 'selection' && this.operation !== 'text')
      this.operation = 'selection';
    this.text = other.text;
    this.selections = other.selections;
    this.lineWidgetsRemoved.push(...other.lineWidgetsRemoved);
    return true;
  }
};

// Type of operation designates what has changed and affects how
// operations may be collapsed for history.
// Each operation may include preceeding ones.
//   - Marker does not affect user-editable text/selection,
//     but may affect what's visible.
//   - Special is meant to be never coalesced with the rest, e.g. cut or paste.
// TODO: typing should be collapsed per token?
// TODO: switch to mask if needed?
State.Operations = ['marker', 'selection', 'text', 'special'];
