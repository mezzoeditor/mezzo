export class History {
  /**
   * @param {*} state
   */
  constructor(state) {
    this._states = [state];
    this._pos = 0;
  }

  /**
   * @param {*} state
   */
  reset(state) {
    this._states = [state];
    this._pos = 0;
  }

  /**
   * @return {*}
   */
  current() {
    return this._states[this._pos];
  }

  /**
   * @param {*} state
   */
  push(state) {
    if (this._pos === this._states.length - 1) {
      this._states.push(state);
      ++this._pos;
    } else {
      this._states[++this._pos] = state;
    }
    if (this._states.length > this._pos + 1)
      this._states.splice(this._pos + 1, this._states.length - this._pos + 1);
  }

  /**
   * @param {function(*):boolean} filter
   * @return {!Array<*>|undefined}
   */
  undo(filter) {
    let undone = [];
    for (let pos = this._pos; pos > 0; pos--) {
      let state = this._states[pos];
      undone.push(state);
      if (filter(state)) {
        this._pos = pos - 1;
        return undone;
      }
    }
  }

  /**
   * @param {function(*):boolean} filter
   * @return {!Array<*>|undefined}
   */
  redo(filter) {
    let redone = [];
    for (let pos = this._pos + 1; pos < this._states.length; pos++) {
      let state = this._states[pos];
      redone.push(state);
      if (filter(state)) {
        this._pos = pos;
        return redone;
      }
    }
  }
};
