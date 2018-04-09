import { Selection } from './Selection.mjs';

export class History {
  /**
   * @param {!Document} document
   * @param {!Selection} selection
   */
  constructor(document, selection) {
    this._document = document;
    this._selection = selection;
    this._document.addReplaceCallback(this._onReplace.bind(this));

    this._changes = [];
    this._pos = -1;
    this._current = null;

    this._selectionChanged = false;
    this._selectionState = this._selection.save();
    this._selection.on(Selection.Events.Changed, this._onSelectionChanged.bind(this));

    this._muteOnReplace = false;
    this._muteOnSelectionChanged = false;
    this._operations = 0;
  }

  reset() {
    if (this._operations)
      throw new Error('Cannot reset during operation');
    this._changes = [];
    this._pos = -1;
  }

  beginOperation() {
    ++this._operations;
  }

  endOperation() {
    --this._operations;
    if (!this._operations && this._current) {
      this._current.selectionAfter = this._selectionState;
      this._pushChange();
    }
  }

  /**
   * @return {boolean}
   */
  undo() {
    if (this._operations)
      throw new Error('Cannot undo during operation');

    if (this._pos === -1)
      return false;

    this._selection.freeze();
    this._document.beginOperation('undo');
    let change = this._changes[this._pos--];
    for (let i = change.replacements.length - 1; i >= 0; i--) {
      let replacement = change.replacements[i];
      let inserted = this._document.replace(
          replacement.offset,
          replacement.offset + replacement.insertedLength,
          replacement.removed);
      replacement.removedLength = replacement.removed.length();
      delete replacement.removed;
      replacement.inserted = inserted;
      delete replacement.insertedLength;
    }
    this._document.endOperation('undo');
    this._muteOnSelectionChanged = true;
    this._selection.unfreeze(change.selectionBefore);
    this._muteOnSelectionChanged = false;
    this._selectionChanged = false;
    return true;
  }

  /**
   * @return {boolean}
   */
  redo() {
    if (this._operations)
      throw new Error('Cannot redo during operation');

    if (this._pos === this._changes.length - 1)
      return false;

    this._selection.freeze();
    this._document.beginOperation('redo');
    let change = this._changes[++this._pos];
    for (let replacement of change.replacements) {
      let removed = this._document.replace(
          replacement.offset,
          replacement.offset + replacement.removedLength,
          replacement.inserted);
      replacement.insertedLength = replacement.inserted.length();
      delete replacement.inserted;
      replacement.removed = removed;
      delete replacement.removedLength;
    }
    this._document.endOperation('redo');
    this._muteOnSelectionChanged = true;
    this._selection.unfreeze(change.selectionAfter || change.selectionBefore);
    this._muteOnSelectionChanged = false;
    this._selectionChanged = false;
    return true;
  }

  /**
   * @param {!Replacements} replacements
   */
  _onReplace(replacements) {
    for (let replacement of replacements) {
      if (replacement.operation === 'undo' || replacement.operation === 'redo')
        continue;

      if (!this._current) {
        this._current = {
          replacements: [],
          selectionBefore: this._selectionState,
          selectionAfter: null
        };
      }

      this._current.replacements.push({
        offset: replacement.offset,
        insertedLength: replacement.inserted.length(),
        removed: replacement.removed,
      });
    }
    if (!this._operations && this._current)
      this._pushChange();
}

  _pushChange() {
    if (this._pos === this._changes.length - 1) {
      this._changes.push(this._current);
      ++this._pos;
    } else {
      this._changes[++this._pos] = this._current;
    }
    if (this._changes.length > this._pos + 1)
      this._changes.splice(this._pos + 1, this._changes.length - this._pos + 1);
    this._current = null;
    this._selectionChanged = false;
  }

  _onSelectionChanged() {
    if (this._muteOnSelectionChanged)
      return;
    this._selectionChanged = true;
    this._selectionState = this._selection.save();
    if (this._pos >= 0) {
      let change = this._changes[this._pos];
      if (!change.selectionAfter)
        change.selectionAfter = this._selectionState;
    }
  }
};

History._documentFreeze = Symbol('History');
