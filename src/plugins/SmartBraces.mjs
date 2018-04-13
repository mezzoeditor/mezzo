export class SmartBraces {
  /**
   * @param {!Editor} editor
   */
  constructor(editor) {
    this._editing = editor.editing();
    this._document = editor.document();
    this._pairs = [
      '()',
      '{}',
      '[]',
    ];
    this._editing.addEditingOverride(this._onEdit.bind(this));
  }

  /**
   * @param {!RangeEdit} edit
   * @return {?EditingOverride}
   */
  _onEdit(edit) {
    if (edit.from === edit.to)
      return this._handleInsert(edit.from, edit.s);
    if (edit.from !== edit.to && edit.s === '')
      return this._handleRemove(edit.from, edit.to);
    return null;
  }

  /**
   * @param {number} offset
   * @param {string} text
   * @return {?EditingOverride}
   */
  _handleInsert(offset, inserted) {
    for (const pair of this._pairs) {
      if (pair[0] === inserted) {
        return {
          edit: { from: offset, to: offset, s: pair },
          cursorOffset: offset + 1,
        };
      } else if (pair[1] === inserted && this._document.iterator(offset).current === inserted) {
        return {
          edit: { from: offset, to: offset, s: '' },
          cursorOffset: offset + 1,
        };
      }
    }
    return null;
  }

  /**
   * @param {number} offset
   * @param {string} text
   * @return {?EditingOverride}
   */
  _handleRemove(from, to) {
    if (from + 1 !== to)
      return null;
    let pair = this._document.content(from, to + 1);
    let index = this._pairs.indexOf(pair);
    if (index === -1)
      return null;
    return {
      edit: {
        from: from,
        to: to + 1,
        s: ''
      },
      cursorOffset: from,
    };
  }
};
