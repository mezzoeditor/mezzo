export class Editing {
  /**
   * @param {!Document} document
   * @param {!Selection} selection
   * @param {!History} history
   */
  constructor(document, selection, history) {
    this._document = document;
    this._selection = selection;
    this._history = history;
  }

  /**
   * @param {string} text
   * @return {boolean}
   */
  paste(text) {
    return this._replace(text, range => range);
  }

  /**
   * @return {boolean}
   */
  deleteBefore() {
    return this._replace('', range => {
      if (range.from === range.to) {
        let {line, column} = this._document.offsetToPosition(range.from);
        if (!column)
          return {from: Math.max(0, range.from - 1), to: range.to};
        return {from: this._document.positionToOffset({line, column: column - 1}), to: range.to};
      }
        return ;
      return range;
    });
  }

  /**
   * @return {boolean}
   */
  deleteAfter() {
    return this._replace('', range => {
      if (range.from === range.to) {
        let {line, column} = this._document.offsetToPosition(range.to);
        let next = this._document.positionToOffset({line, column: column + 1});
        if (next === range.to)
          return {from: range.from, to: Math.min(this._document.length(), range.to + 1)};
        return {from: range.from, to: next};
      }
      return range;
    });
  }

  /**
   * @param {string} text
   * @return {boolean}
   */
  type(text) {
    return this._replace(text, range => range);
  }

  /**
   * @return {boolean}
   */
  insertNewLine() {
    return this._replace('\n', range => range);
  }

  /**
   * @param {string} s
   * @param {function(!Range):!Range} rangeCallback
   * @return {boolean}
   */
  _replace(s, rangeCallback) {
    let ranges = this._selection.ranges();
    if (!ranges.length)
      return false;
    this._history.beginOperation();
    let savedSelection = this._selection.freeze();
    let newRanges = [];
    let delta = 0;
    for (let range of ranges) {
      let from = Math.max(0, Math.min(range.from + delta, this._document.length()));
      let to = Math.max(0, Math.min(range.to + delta, this._document.length()));
      let replaced = rangeCallback({from, to});
      this._document.replace(replaced.from, replaced.to, s);
      newRanges.push({from: replaced.from + s.length, to: replaced.from + s.length});
      delta += s.length - (replaced.to - replaced.from);
    }
    this._selection.unfreeze(savedSelection, newRanges);
    this._history.endOperation();
    return true;
  }
};
