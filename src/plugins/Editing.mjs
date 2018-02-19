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
   * @param {string} command
   * @param {*} data
   * @return {*|undefined}
   */
  onCommand(command, data) {
    if (!Editing.Commands.has(command))
      return;

    this._document.begin('editing');
    switch (command) {
      case 'editing.type': {
        let s = /** @type {string} */ (data);
        this._replace(s, range => range);
        break;
      }
      case 'editing.paste': {
        let s = /** @type {string} */ (data);
        this._replace(s, range => range);
        break;
      }
      case 'editing.newline': {
        this._replace('\n', range => range);
        break;
      }
      case 'editing.delete.after': {
        this._replace('', range => {
          if (range.from === range.to)
            return {from: range.from, to: Math.min(this._document.length(), range.to + 1)};
          return range;
        });
        break;
      }
      case 'editing.delete.before': {
        this._replace('', range => {
          if (range.from === range.to)
            return {from: Math.max(0, range.from - 1), to: range.to};
          return range;
        });
        break;
      }
    }
    this._document.end('editing');
    return true;
  }

  /**
   * @param {string} s
   * @param {function(!Range):!Range} rangeCallback
   */
  _replace(s, rangeCallback) {
    this._selection.mute();
    let ranges = this._selection.ranges();
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
  }
};

Editing.Commands = new Set([
  'editing.type',
  'editing.paste',
  'editing.newline',
  'editing.delete.before',
  'editing.delete.after',
]);
