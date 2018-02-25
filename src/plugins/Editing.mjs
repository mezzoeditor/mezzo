/**
 * @implements Plugin
 */
export class Editing {
  /**
   * @param {!Document} document
   * @param {!Selection} selection
   */
  constructor(document, selection) {
    this._document = document;
    this._selection = selection;
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
      // TODO: this does not work with unicode.
      if (range.from === range.to)
        return {from: Math.max(0, range.from - 1), to: range.to};
      return range;
    });
  }

  /**
   * @return {boolean}
   */
  deleteAfter() {
    return this._replace('', range => {
      // TODO: this does not work with unicode.
      if (range.from === range.to)
        return {from: range.from, to: Math.min(this._document.length(), range.to + 1)};
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
    this._document.begin('editing');
    this._selection.mute();
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
    this._selection.unmute();
    this._selection.updateRanges(newRanges);
    this._document.end('editing');
    return true;
  }
};
