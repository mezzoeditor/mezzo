import { Document } from '../core/Document.mjs';

/**
 * History is designed as follows:
 *
 * 1. All document changes *always* end up in history. This way we never miss any data.
 * 2. History is an array of HistoryEntry objects and a current position in this array. There's always at least one HistoryEntry in this array - initial document position.
 * 3. For every document operation, a new "HistoryEntry" object is created. It is then added to
 * the history array using one of the following VERBS (aka "decisions"):
 *  - PUSH: all history entries after the current position are dropped; a new entry is added to the end.
 *  - SUBSTITUTE: current history entry is substituted with the new one. This could be done only for the LAST history entry and never for the first one.
 * 4: By default, History applies SUBSTITUTE to all new HistoryEntries when possible and falls back to PUSH if not.
 *
 * Default history behavior results in two history entries: initial and current.
 *
 * -- ARBITRATION --
 *
 * In order to modify History behavior, History supports "arbitration" - a way to override
 * decisions for new history entries.
 *
 * Syntax: history.arbitrate(operation, callback);
 *
 * This will call |operation|, and for every document change that happens inside |operation|, a
 * |callback| will be called.
 *
 * Callback will be passed in three arguments:
 * - currentEntry
 * - newEntry
 * - DocumentChangedEvent
 *
 * Callback must return either History.Decisions.Push or History.Decisions.Substitute.
 * If callback returns SUBSTITUTE but this verb is illebal, History will silently fallback
 * to PUSH.
 *
 *
 * Example:
 *
 *   history.arbitrate(() => {
 *     // Run any modification operations
 *     document.replace(0, 2, 'yo');
 *   }, (currentEntry, newEntry, event) => {
 *     // Figure out what to do with the new entry.
 *     return History.Decisions.Push;
 *   });
 *
 * -- METAINFORMATION --
 *
 * HistoryEntry instances can be assigned metainformation using symbols. This metainformation
 * might come handy in future arbitration.
 *
 * NOTE: since not all history entries are arbitrated by the same owners, be sure to check
 * if current entry has metainformation set.
 *
 * Example:
 *
 *   history.arbitrate(() => {
 *     document.replace(0, 2, 'yo');
 *   }, (entry, newEntry, event) => {
 *     newEntry[mySymbol] = { origin: 'foo' };
 *     if (entry[mySymbol] && entry[mySymbol].origin === 'foo')
 *       // ...
 *   });
 */

export class History {
  /**
   * @param {!Document} document
   */
  constructor(document) {
    this._document = document;
    this._muteDocumentChanged = false;
    this._document.on(Document.Events.Changed, this._onDocumentChanged.bind(this));

    this._position = 0;
    this._entries = [new HistoryEntry(document)];

    this._arbitrator = null;
  }

  _onDocumentChanged(event) {
    if (this._muteDocumentChanged)
      return;
    const entry = this._entries[this._position];
    const newEntry = new HistoryEntry(this._document);
    let decision = this._arbitrator ? this._arbitrator(entry, newEntry, event) : History.Decisions.Substitute;
    if (this._position === 0 || this._position < this._entries.length - 1)
      decision = History.Decisions.Push;
    if (decision === History.Decisions.Push)
      this._entries.splice(++this._position, this._entries.length, newEntry);
    else if (decision === History.Decisions.Substitute)
      this._entries[this._position] = newEntry;
    else
      throw new Error('Unknown history arbitrator decision: ' + decision);
  }

  arbitrate(operation, callback) {
    if (this._arbitrator)
      throw new Error('history.arbitrate cannot be called from-inside another history.arbitrate call.');
    this._arbitrator = callback;
    const result = operation.call(null);
    this._arbitrator = null;
    return result;
  }

  reset() {
    this._position = 0;
    this._entries = [new HistoryEntry(this._document)];
  }

  undo() {
    while (this._position > 0) {
      const entry = this._entries[this._position];
      const newEntry = this._entries[--this._position];
      if (entry.text !== newEntry.text) {
        this._apply(newEntry);
        return;
      }
    }
    this._apply(this._entries[this._position]);
  }

  redo() {
    while (this._position + 1 < this._entries.length) {
      const entry = this._entries[this._position];
      const newEntry = this._entries[++this._position];
      if (entry.text !== newEntry.text) {
        this._apply(newEntry);
        return;
      }
    }
  }

  softUndo() {
    if (this._position === 0)
      return;
    this._apply(this._entries[--this._position]);
  }

  softRedo() {
    if (this._position + 1 >= this._entries.length)
      return;
    this._apply(this._entries[++this._position]);
  }

  /**
   * @param {!HistoryEntry} entry
   * @param {string} origin
   */
  _apply(entry) {
    this._muteDocumentChanged = true;
    this._document.operation(() => {
      if (this._document.text() !== entry.text)
        this._document.reset(entry.text);
      this._document.setSelection(entry.selection);
    });
    this._muteDocumentChanged = false;
  }
}

History.Decisions = {
  Push: 'push',
  Substitute: 'substitute',
};

class HistoryEntry {
  /**
   * @param {!Text} text
   * @param {!Array<!SelectionRange>} selection
   */
  constructor(document) {
    this.text = document.text();
    this.selection = document.selection();
  }
}
