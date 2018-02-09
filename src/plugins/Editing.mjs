import { TextUtils } from "../utils/TextUtils.mjs";

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
            return {from: range.from, to: TextUtils.nextOffset(this._document, range.to)};
          return range;
        });
        break;
      }
      case 'editing.delete.before': {
        this._replace('', range => {
          if (range.from === range.to)
            return {from: TextUtils.previousOffset(this._document, range.from), to: range.to};
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
   * @param {function(!OffsetRange):!OffsetRange} rangeCallback
   */
  _replace(s, rangeCallback) {
    this._selection.mute();
    let ranges = this._selection.ranges();
    let newRanges = [];
    let delta = 0;
    for (let range of ranges) {
      let moved = TextUtils.clampRange(this._document, {from: range.from + delta, to: range.to + delta});
      let replaced = rangeCallback(moved);
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
