import { EventEmitter } from '../src/utils/EventEmitter.mjs';

export class BlockIndentation {
  /**
   * @param {!Editor} editor
   */
  constructor(editor) {
    this._input = editor.input();
    this._document = editor.document();
    this._eventListeners = [
      this._input.addInputOverride(this._onInput.bind(this)),
    ];
  }

  /**
   * @param {!RangeEdit} edit
   * @return {?InputOverride}
   */
  _onInput(edit) {
    if (edit.from !== edit.to || edit.from === 0)
      return null;
    if (!edit.s.length || edit.s[0] !== '\n')
      return null;
    let it = this._document.text().iterator(edit.from - 1);
    if (it.current !== '{')
      return null;
    let s = edit.s + this._input.indent();
    let cursorOffset = edit.from + s.length;
    if (it.charAt(1) === '}')
      s += edit.s;
    return {
      edit: { from: edit.from, to: edit.to, s},
      cursorOffset,
    };
  }

  /**
   * @override
   */
  dispose() {
    EventEmitter.removeEventListeners(this._eventListeners);
  }
};
