import { TextUtils } from "../utils/TextUtils.mjs";

export class Editing {
  /**
   * @param {!WebEditor} editor
   * @param {!Selection} selection
   */
  constructor(editor, selection) {
    this._editor = editor;
    this._document = editor.document();
    this._selection = selection;
    editor.element().addEventListener('paste', event => {
      let data = event.clipboardData;
      if (data.types.indexOf('text/plain') === -1)
        return;
      this._document.perform('editing.paste', data.getData('text/plain'));
      event.preventDefault();
      event.stopPropagation();
    });
    editor.element().addEventListener('cut', event => {
      const text = this._document.perform('selection.copy');
      if (!text)
        return;
      event.clipboardData.setData('text/plain', text);
      this._document.perform('editing.delete.before');
      event.preventDefault();
      event.stopPropagation();
    });
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
    let ranges = this._selection.ranges().map(range => range.range());
    let delta = 0;
    for (let range of ranges) {
      let moved = TextUtils.clampRange(this._document, {from: range.from + delta, to: range.to + delta});
      let replaced = rangeCallback(moved);
      this._document.replace(replaced.from, replaced.to, s);
      delta += s.length - (replaced.to - replaced.from);
    }
  }
};

Editing.Commands = new Set([
  'editing.type',
  'editing.paste',
  'editing.newline',
  'editing.delete.before',
  'editing.delete.after',
]);
