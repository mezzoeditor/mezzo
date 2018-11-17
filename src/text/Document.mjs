import { Text } from './Text.mjs';
import { EventEmitter } from '../utils/EventEmitter.mjs';

/**
 * @typedef {{
 *   before: Text,
 *   offset: number,
 *   inserted: Text,
 *   removed: Text,
 *   after: Text,
 * }} Replacement;
 */

/**
 * @typedef {{
 *   anchor: number,
 *   focus: number,
 *   upDownX: (number|undefined),
 * }} SelectionRange;
 */

/**
 * @typedef {{
 *  replacements: Array<Replacement>,
 *  oldSelection: ?Array<SelectionRange>,
 *  selectionChanged: boolean,
 * }} DocumentChangedEvent
 */

export class Document extends EventEmitter {
  constructor() {
    super();
    this._text = new Text();
    /** @type {Array<SelectionRange>} */
    this._selection = [];

    this._operation = 0;
    /** @type {Array<Replacement>} */
    this._operationReplacements = [];
    /** @type {?Array<SelectionRange>} */
    this._oldSelection = null;
    this._dispatchingChangedEvent = false;

    this._muteHistory = false;
    this._historyGeneration = 0;
    /** @type {Array<HistoryEntry>} */
    this._history = [new HistoryEntry([] /* replacements */, [] /* selection */, ++this._historyGeneration)];
    this._historyIndex = 0;
  }

  static importable() {
    return {name: this.name, url: import.meta.url};
  }

  /**
   * @param {*} key
   * @param {*} value
   */
  setMetadata(key, value) {
    this._history[this._historyIndex].metadata.set(key, value);
  }

  /**
   * @param {*} key
   * @return {*}
   */
  metadata(key) {
    return this._history[this._historyIndex].metadata.get(key);
  }

  /**
   * @return {number}
   */
  generation() {
    return this._history[this._historyIndex].generation;
  }

  /**
   * @return {boolean}
   */
  hasSelection() {
    return !!this._selection.length;
  }

  /**
   * @return {boolean}
   */
  hasSingleCursor() {
    return this._selection.length === 1;
  }

  /**
   * @return {string}
   */
  selectedText() {
    let lines = [];
    for (let range of this._selection)
      lines.push(this._text.content(Math.min(range.anchor, range.focus), Math.max(range.anchor, range.focus)));
    return lines.join('\n');
  }

  /**
   * Returns selection ranges sorted in an ascending order wrt order
   * of insertion.
   * @return {Array<SelectionRange>}
   */
  selection() {
    return this._selection.slice();
  }

  /**
   * Returns selection ranges sorted in an ascending order wrt offsets
   * in the document.
   * @return {Array<SelectionRange>}
   */
  sortedSelection() {
    return this._selection.slice().sort(selectionRangeComparator);
  }

  /**
   * @param {Array<SelectionRange>} ranges
   * @return {boolean}
   */
  setSelection(ranges) {
    if (this._dispatchingChangedEvent)
      throw new Error('Cannot modify document from-inside change event');
    ranges = normalizeSelection(this._text, ranges);
    if (checkSelectionsEqual(ranges, this._selection))
      return false;
    this._oldSelection = this._selection;
    this._selection = ranges;
    this._maybeEmit();
    return true;
  }

  /**
   * @return {?SelectionRange}
   */
  lastCursor() {
    return this._selection.length ? this._selection[this._selection.length - 1] : null;
  }

  /**
   * @return {Text}
   */
  text() {
    return this._text;
  }

  /**
   * @param {function()} fun
   * @param {string} historyAction
   */
  operation(fun, historyAction) {
    if (this._dispatchingChangedEvent)
      throw new Error('Cannot modify document from-inside change event');
    ++this._operation;
    const result = fun();
    --this._operation;
    this._maybeEmit(historyAction);
  }

  /**
   * @param {string} historyAction
   */
  _maybeEmit(historyAction = Document.History.Push) {
    if (this._operation || (!this._operationReplacements.length && !this._oldSelection))
      return;
    // If there are some edits, make sure selection is consistent with document.
    if (this._operationReplacements.length) {
      const ranges = normalizeSelection(this._text, this._selection);
      if (!checkSelectionsEqual(ranges, this._selection)) {
        if (!this._oldSelection)
          this._oldSelection = this._selection;
        this._selection = ranges;
      }
    }

    const replacements = this._operationReplacements;
    const oldSelection = this._oldSelection;
    this._operationReplacements = [];
    this._oldSelection = null;

    if (!this._muteHistory) {
      let generation = replacements.length ? ++this._historyGeneration : this._history[this._historyIndex].generation;
      const newEntry = new HistoryEntry(replacements, this._selection, generation);
      if (historyAction !== Document.History.Reset && this._historyIndex === 0 || this._historyIndex < this._history.length - 1)
        historyAction = Document.History.Push;
      if (historyAction === Document.History.Push) {
        this._history.splice(++this._historyIndex, this._history.length, newEntry);
      } else if (historyAction === Document.History.Merge) {
        newEntry.merge(this._history[this._historyIndex]);
        this._history[this._historyIndex] = newEntry;
      } else if (historyAction === Document.History.Reset) {
        this._history = [newEntry];
        this._historyIndex = 0;
      } else {
        throw new Error('Unknown history action: ' + historyAction);
      }
    }

    if (this._dispatchingChangedEvent)
      throw new Error('Cannot modify document from-inside change event');
    this._dispatchingChangedEvent = true;
    this.emit(Document.Events.Changed, {replacements, oldSelection, selectionChanged: !!oldSelection});
    this._dispatchingChangedEvent = false;
  }

  /**
   * @param {Text|string} text
   * @param {Array<SelectionRange>} selection
   */
  reset(text, selection = []) {
    if (this._dispatchingChangedEvent)
      throw new Error('Cannot modify document from-inside change event');
    return this.operation(() => {
      this.replace(0, this._text.length(), text);
      this.setSelection(selection);
    }, Document.History.Reset);
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {Text|string} insertion
   * @return {Text}
   */
  replace(from, to, insertion) {
    if (this._dispatchingChangedEvent)
      throw new Error('Cannot modify document from-inside change event');
    if (typeof insertion === 'string')
      insertion = Text.fromString(insertion);
    let {result, removed} = this._text.replace(from, to, insertion);
    this._operationReplacements.push({
      before: this._text,
      offset: from,
      removed: removed,
      inserted: insertion,
      after: result
    });
    this._text = result;
    this._maybeEmit();
    return removed;
  }

  /**
   * @return {boolean}
   */
  undo() {
    if (!this._historyIndex)
      return false;
    let index = this._historyIndex - 1;
    while (index > 0 && !this._history[index + 1].hasTextChanges())
      --index;
    this._apply(index);
    return true;
  }

  /**
   * @return {boolean}
   */
  redo() {
    let index = this._historyIndex;
    while (index + 1 < this._history.length) {
      ++index;
      if (this._history[index].hasTextChanges()) {
        this._apply(index);
        return true;
      }
    }
    return false;
  }

  /**
   * @return {boolean}
   */
  softUndo() {
    if (this._historyIndex === 0)
      return false;
    this._apply(this._historyIndex - 1);
    return true;
  }

  /**
   * @return {boolean}
   */
  softRedo() {
    if (this._historyIndex + 1 >= this._history.length)
      return false;
    this._apply(this._historyIndex + 1);
    return true;
  }

  /**
   * @param {number} newHistoryIndex
   */
  _apply(newHistoryIndex) {
    this._muteHistory = true;
    this.operation(() => {
      if (newHistoryIndex > this._historyIndex) {
        for (let i = this._historyIndex + 1; i <= newHistoryIndex; ++i) {
          for (const replacement of this._history[i].replacements) {
            this.replace(replacement.offset, replacement.offset + replacement.removed.length(), replacement.inserted);
          }
        }
      } else {
        for (let i = this._historyIndex; i > newHistoryIndex; --i) {
          const replacements = this._history[i].replacements;
          for (let j = replacements.length - 1; j >= 0; --j) {
            this.replace(replacements[j].offset, replacements[j].offset + replacements[j].inserted.length(), replacements[j].removed);
          }
        }
      }
      this.setSelection(this._history[newHistoryIndex].selection);
      this._historyIndex = newHistoryIndex;
    });
    this._muteHistory = false;
  }
};

Document.History = {
  Push: 'push',
  Merge: 'merge',
  Reset: 'reset',
};

/**
 * @param {Array<SelectionRange>} aRanges
 * @param {Array<SelectionRange>} bRanges
 * @return {boolean}
 */
function checkSelectionsEqual(aRanges, bRanges) {
  if (aRanges.length !== bRanges.length)
    return false;
  for (let i = 0; i < aRanges.length; ++i) {
    const a = aRanges[i];
    const b = bRanges[i];
    if (a.anchor !== b.anchor || a.focus !== b.focus || a.upDownX !== b.upDownX)
      return false;
  }
  return true;
}

/**
 * @param {SelectionRange} a
 * @param {SelectionRange} b
 * @return {number}
 */
export function selectionRangeComparator(a, b) {
  let aFrom = Math.min(a.focus, a.anchor);
  let aTo = Math.max(a.focus, a.anchor);
  let bFrom = Math.min(b.focus, b.anchor);
  let bTo = Math.max(b.focus, b.anchor);
  return (aFrom - bFrom) || (aTo - bTo);
}

/**
 * @param {Text} text
 * @param {Array<SelectionRange>} ranges
 * @return {Array<SelectionRange>}
 */
function normalizeSelection(text, ranges) {
  if (!ranges.length)
    return [];

  // 1. Clamp ranges to document size.
  ranges = ranges.map(range => {
    return {
      anchor: Math.max(0, Math.min(range.anchor, text.length())),
      focus: Math.max(0, Math.min(range.focus, text.length())),
      upDownX: range.upDownX
    };
  });

  if (ranges.length === 1)
    return ranges;

  // 2. Memorize range ordering.
  const ordering = new Map();
  for (let i = 0; i < ranges.length; ++i)
    ordering.set(ranges[i], i);

  // 3. Sort ranges in ascending order.
  ranges.sort(selectionRangeComparator);

  // 4. Join ranges.
  let length = 1;
  for (let i = 1; i < ranges.length; i++) {
    let last = ranges[length - 1];
    let lastTo = Math.max(last.anchor, last.focus);
    let next = ranges[i];
    let nextFrom = Math.min(next.anchor, next.focus);
    let nextTo = Math.max(next.anchor, next.focus);
    if (nextTo < lastTo)
      throw new Error('Inconsistent');
    if (nextFrom < lastTo || lastTo === nextTo) {
      if (last.anchor > last.focus)
        last.anchor = nextTo;
      else
        last.focus = nextTo;
    } else {
      ranges[length++] = next;
    }
  }
  if (length !== ranges.length)
    ranges.splice(length, ranges.length - length);

  // 5. Restore ranges order.
  ranges.sort((a, b) => ordering.get(a) - ordering.get(b));
  return ranges;
}

Document.Events = {
  Changed: 'changed'
};

class HistoryEntry {
  /**
   * @param {Array<Replacement>} replacements
   * @param {Array<SelectionRange>} selection
   */
  constructor(replacements, selection, generation) {
    this.selection = selection;
    this.replacements = replacements;
    // TODO: make this map optional.
    this.metadata = new Map();
    this.generation = generation;
  }

  /**
   * @return {boolean}
   */
  hasTextChanges() {
    return !!this.replacements.length;
  }

  /**
   * @param {HistoryEntry} oldEntry
   */
  merge(oldEntry) {
    this.replacements = [...oldEntry.replacements, ...this.replacements];
  }
}

Document.test = {};

/**
 * @param {Document} document
 * @param {Array<string>} chunks
 */
Document.test.setChunks = function(document, chunks) {
  document._text = Text.test.fromChunks(chunks);
};

/**
 * @param {Document} document
 * @param {string} content
 * @param {number} chunkSize
 */
Document.test.setContent = function(document, content, chunkSize) {
  document._text = Text.test.fromStringChunked(content, chunkSize);
};
