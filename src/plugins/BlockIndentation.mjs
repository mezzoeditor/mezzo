export class BlockIndentation {
  /**
   * @param {!Document} document
   * @param {!Editing} editing
   */
  constructor(document, editing) {
    this._editing = editing;
    this._document = document;
    editing.addEditingOverride(this._onEdit.bind(this));
  }

  /**
   * @param {!RangeEdit} edit
   * @return {?EditingOverride}
   */
  _onEdit(edit) {
    if (edit.from !== edit.to || edit.from === 0)
      return null;
    if (!edit.s.length || edit.s[0] !== '\n')
      return null;
    let it = this._document.iterator(edit.from - 1);
    if (it.current !== '{')
      return null;
    let s = edit.s + this._editing.indent();
    let cursorOffset = edit.from + s.length;
    if (it.charAt(1) === '}')
      s += edit.s;
    return {
      edit: { from: edit.from, to: edit.to, s},
      cursorOffset,
    };
  }
};
