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
   */
  canUndo(filter) {
    for (let pos = this._pos - 1; pos >= 0; pos--) {
      if (filter(this._states[pos]))
        return true;
    }
    return false;
  }

  /**
   * @param {function(*):boolean} filter
   */
  canRedo(filter) {
    for (let pos = this._pos + 1; pos < this._states.length; pos++) {
      if (filter(this._states[pos]))
        return true;
    }
    return false;
  }

  /**
   * @return {*|undefined}
   */
  undo() {
    if (this._pos === 0)
      return;
    --this._pos;
    return this._states[this._pos];
  }

  /**
   * @return {*|undefined}
   */
  redo() {
    if (this._pos === this._states.length - 1)
      return;
    ++this._pos;
    return this._states[this._pos];
  }
};
