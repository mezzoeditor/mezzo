import { Text } from './Text.mjs';
import { EventEmitter } from './EventEmitter.mjs';

/**
 * @typedef {{
 *   before: !Text,
 *   offset: number,
 *   inserted: !Text,
 *   removed: !Text,
 *   after: !Text,
 * }} Replacement;
 */

/**
 * @typedef {{
 *   anchor: number,
 *   focus: number,
 *   upDownX: (number|undefined),
 * }} SelectionRange;
 */

export class Document extends EventEmitter {
  constructor() {
    super();
    this._text = new Text();
    this._selection = [];

    this._operation = 0;
    this._operationReplacements = [];
    this._oldSelection = null;
    this._dispatchingChangedEvent = false;
  }

  /**
   * @return {!Array<!SelectionRange>}
   */
  selection() {
    return this._selection.slice();
  }

  /**
   * @return {!Array<!SelectionRange>}
   */
  sortedSelection() {
    return this._selection.slice().sort(rangeComparator);
  }

  /**
   * @param {!Array<!SelectionRange>} ranges
   */
  setSelection(ranges) {
    ranges = normalizeSelection(ranges);
    if (checkSelectionsEqual(ranges, this._selection))
      return;
    this._oldSelection = this._selection;
    this._selection = ranges;
    this._maybeEmit();
  }

  /**
   * @return {!Text}
   */
  text() {
    return this._text;
  }

  /**
   * @param {function()} fun
   */
  operation(fun) {
    ++this._operation;
    const result = fun();
    --this._operation;
    this._maybeEmit();
  }

  _maybeEmit() {
    if (this._operation || (!this._operationReplacements.length && !this._oldSelection))
      return;
    // If there are some edits, make sure selection is consistent with document.
    if (this._operationReplacements.length) {
      const ranges = normalizeSelection(this._selection);
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

    this._dispatchingChangedEvent = true;
    this.emit(Document.Events.Changed, {replacements, oldSelection});
    this._dispatchingChangedEvent = false;
  }

  /**
   * @param {!Text|string} text
   */
  reset(text) {
    if (this._dispatchingChangedEvent)
      throw new Error('Cannot replace from replacement callback');
    if (typeof text === 'string')
      text = Text.fromString(text);
    const removed = this._text;
    this._operationReplacements.push({
      before: this._text,
      offset: 0,
      removed: this._text,
      inserted: text,
      after: text
    });
    this._text = text;
    this._maybeEmit();
    return removed;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {!Text|string} insertion
   * @return {!Text}
   */
  replace(from, to, insertion) {
    if (this._dispatchingChangedEvent)
      throw new Error('Cannot replace from replacement callback');
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
};


/**
 * @param {!Array<!SelectionRange>} aRanges
 * @param {!Array<!SelectionRange>} bRanges
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
 * @param {!SelectionRange} a
 * @param {!SelectionRange} b
 * @return {number}
 */
function rangeComparator(a, b) {
  let aFrom = Math.min(a.focus, a.anchor);
  let aTo = Math.max(a.focus, a.anchor);
  let bFrom = Math.min(b.focus, b.anchor);
  let bTo = Math.max(b.focus, b.anchor);
  return (aFrom - bFrom) || (aTo - bTo);
}

/**
 * @param {!Array<!SelectionRange>} ranges
 * @return {!Array<!SelectionRange>}
 */
function normalizeSelection(ranges) {
  if (!ranges.length)
    return [];

  // 1. Clamp ranges to document size.
  ranges = ranges.map(range => {
    return {
      anchor: Math.max(0, Math.min(range.anchor, this._text.length())),
      focus: Math.max(0, Math.min(range.focus, this._text.length())),
      upDownX: range.upDownX
    };
  });

  if (ranges.length === 1)
    return ranges;

  // 2. Memorize range ordering.
  const ordering = new Map();
  for (let i = 0; i < ranges.length; ++i)
    ordering.set(range[i], i);

  // 3. Sort ranges in ascending order.
  ranges.sort(rangeComparator);

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

Document.test = {};

/**
 * @param {!Document} document
 * @param {!Array<string>} chunks
 */
Document.test.setChunks = function(document, chunks) {
  document._text = Text.fromChunks(chunks);
};

/**
 * @param {!Document} document
 * @param {string} content
 * @param {number} chunkSize
 */
Document.test.setContent = function(document, content, chunkSize) {
  document._text = Text.fromString(content, chunkSize);
};
