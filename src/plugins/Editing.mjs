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
      if (range.from !== range.to)
        return range;
      let {line, column} = this._document.offsetToPosition(range.from);
      if (!column)
        return {s: range.s, from: Math.max(0, range.from - 1), to: range.to};
      return {s: range.s, from: this._document.positionToOffset({line, column: column - 1}), to: range.to};
    });
  }

  /**
   * @return {boolean}
   */
  deleteAfter() {
    return this._replace('', range => {
      if (range.from !== range.to)
        return range;
      let {line, column} = this._document.offsetToPosition(range.to);
      let next = this._document.positionToOffset({line, column: column + 1});
      if (next === range.to)
        return {s: range.s, from: range.from, to: Math.min(this._document.length(), range.to + 1)};
      return {s: range.s, from: range.from, to: next};
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
    return this._replace('\n', range => {
      let position = this._document.offsetToPosition(range.from);
      let linePosition = {line: position.line, column: 0};
      let startOffset = this._document.positionToOffset(linePosition);
      let it = this._document.iterator(startOffset, 0, startOffset + 1000);
      while (it.current === ' ' && !it.outOfBounds())
        it.next();
      let indent = ' '.repeat(it.offset - startOffset);
      return {s: range.s + indent, from: range.from, to: range.to};
    });
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
      let replaced = rangeCallback({from, to, s});
      this._document.replace(replaced.from, replaced.to, replaced.s);
      newRanges.push({from: replaced.from + replaced.s.length, to: replaced.from + replaced.s.length});
      delta += replaced.s.length - (replaced.to - replaced.from);
    }
    this._selection.unfreeze(savedSelection, newRanges);
    this._history.endOperation();
    return true;
  }
};
