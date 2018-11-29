import { RangeTree } from '../src/utils/RangeTree.mjs';
import { EventEmitter } from '../src/utils/EventEmitter.mjs';
import { WorkAllocator } from '../src/utils/WorkAllocator.mjs';
import { Document } from '../src/text/Document.mjs';

const CHUNK_SIZE = 200000;

export class Search extends EventEmitter {
  /**
   * @param {!Editor} editor
   */
  constructor(editor) {
    super();
    this._chunkSize = CHUNK_SIZE;
    this._editor = editor;
    this._document = editor.document();

    this._allocator = new WorkAllocator(0);
    this._matches = new RangeTree();
    this._options = null;
    this._currentMatch = null;
    this._shouldUpdateSelection = false;

    this._lastEnabled = false;
    this._lastReportedCurrentMatchIndex = -1;
    this._lastReportedMatchesCount = 0;

    this._eventListeners = [
      this._document.on(Document.Events.Changed, this._onDocumentChanged.bind(this)),
      this._editor.addDecorationCallback(this._onDecorate.bind(this)),
    ];
  }

  /**
   * @return {number}
   */
  matchesCount() {
    return this._matches.countAll();
  }

  /**
   * @return {!Array<!Range>}
   */
  matches() {
    return this._matches.listAll().map(d => ({from: d.from, to: d.to}));
  }

  /**
   * @return {?Range}
   */
  currentMatch() {
    return this._currentMatch;
  }

  /**
   * @return {number}
   */
  currentMatchIndex() {
    if (!this._currentMatch)
      return -1;
    return this._matches.countStarting(0, this._currentMatch.from);
  }

  /**
   * @param {string} query
   * @param {{caseInsensetive: boolean}=} options
   */
  find(query, options = {caseInsensetive: true}) {
    this._cancel();
    this._options = {query, caseInsensetive: !!options.caseInsensetive};
    this._allocator = new WorkAllocator(Math.max(0, this._document.text().length() - query.length + 1));
    this._needsProcessing(0, this._document.text().length());
    this._shouldUpdateSelection = true;
    this._editor.raf();
    this._emitUpdatedIfNeeded();
  }

  cancel() {
    this._cancel();
    this._editor.raf();
    this._emitUpdatedIfNeeded();
  }

  /**
   * @param {boolean}
   */
  enabled() {
    return !!this._options;
  }

  /**
   * Moves to closest match after current cursor offset.
   * @return {boolean}
   */
  nextMatch() {
    const lastCursor = this._document.lastCursor();
    let offset = lastCursor ? lastCursor.focus : null;
    if (offset === null && this._currentMatch)
      offset = this._currentMatch.to;
    if (offset === null)
      return false;
    let match = this._matches.firstStarting(offset, this._document.text().length());
    if (!match)
      match = this._matches.firstAll();
    if (!match)
      return false;
    this._updateCurrentMatch(match, true, true);
    this._editor.raf();
    this._emitUpdatedIfNeeded();
    return true;
  }

  /**
   * Moves to closest match before current cursor offset.
   * @return {boolean}
   */
  previousMatch() {
    const lastCursor = this._document.lastCursor();
    let offset = lastCursor ? lastCursor.focus : null;
    if (offset === null && this._currentMatch)
      offset = this._currentMatch.from;
    if (offset === null)
      return false;
    let match = this._matches.lastEnding(0, offset);
    if (!match)
      match = this._matches.lastAll();
    if (!match)
      return false;
    this._updateCurrentMatch(match, true, true);
    this._editor.raf();
    this._emitUpdatedIfNeeded();
    return true;
  }

  /**
   * @return {boolean}
   */
  _searchChunk() {
    this._jobId = 0;
    let budget = this._chunkSize;
    let range = null;
    while (budget > 0 && (range = this._allocator.workRange())) {
      if (range.to - range.from > budget)
        range.to = range.from + budget;
      range = this._searchRange(range);
      this._allocator.done(range.from, range.to);
      budget -= range.to - range.from;
    }
    if (!this._currentMatch && this._matches.countAll() > 0) {
      const lastCursor = this._document.lastCursor();
      let fromSelection = lastCursor ? Math.min(lastCursor.anchor, lastCursor.focus) : 0;
      // Prefer matches after cursor if possible.
      let match = this._matches.firstStarting(fromSelection, this._document.text().length()) ||
          this._matches.firstStarting(0, fromSelection);
      this._updateCurrentMatch(match, this._shouldUpdateSelection, this._shouldUpdateSelection);
    }

    this._editor.raf();
    if (this._allocator.hasWork())
      this._jobId = this._editor.platformSupport().requestIdleCallback(this._searchChunk.bind(this));
    this._emitUpdatedIfNeeded();
  }

  dispose() {
    EventEmitter.removeEventListeners(this._eventListeners);
    this._cancel();
    this._editor.raf();
  }

  // ------ Internals -------

  /**
   * @param {!VisibleContent} visibleContent
   * @return {?DecorationResult}
   */
  _onDecorate(visibleContent) {
    if (!this._options)
      return null;
    for (let range of visibleContent.ranges) {
      let searchRange = null;
      while (searchRange = this._allocator.workRange(range.from, range.to)) {
        searchRange = this._searchRange(searchRange);
        this._allocator.done(searchRange.from, searchRange.to);
      }
    }
    if (!this._currentMatch && this._matches.countAll() > 0) {
      const lastCursor = this._document.lastCursor();
      let fromSelection = lastCursor ? Math.min(lastCursor.anchor, lastCursor.focus) : 0;
      // Prefer matches after cursor if possible.
      let match = this._matches.firstStarting(fromSelection, this._document.text().length()) ||
          this._matches.firstStarting(0, fromSelection);
      this._updateCurrentMatch(match, this._shouldUpdateSelection, false);
    }

    this._emitUpdatedIfNeeded();
    const background = [this._matches];
    if (this._currentMatch) {
      const currentMatchDecorations = new RangeTree();
      currentMatchDecorations.add(this._currentMatch.from, this._currentMatch.to, 'search.match.current');
      background.push(currentMatchDecorations);
    }
    return {background, lines: [{style: kMatchStyle, ranges: this._matches}]};
  }

  _emitUpdatedIfNeeded() {
    let currentMatchIndex = this.currentMatchIndex();
    let matchesCount = this.matchesCount();
    let enabled = !!this._options;
    if (enabled === this._lastEnabled && currentMatchIndex === this._lastReportedCurrentMatchIndex && matchesCount === this._lastReportedMatchesCount)
      return;
    this._lastReportedCurrentMatchIndex = currentMatchIndex;
    this._lastReportedMatchesCount = matchesCount;
    this._lastEnabled = enabled;
    this.emit(Search.Events.Changed, { enabled, currentMatchIndex, matchesCount });
  }

  /**
   * @param {!DocumentChangedEvent} event
   */
  _onDocumentChanged({replacements, selectionChanged}) {
    if (selectionChanged)
      this._shouldUpdateSelection = false;
    if (!this._options)
      return;
    for (const replacement of replacements) {
      let from = replacement.offset;
      let to = from + replacement.removed.length();
      let inserted = replacement.inserted.length();
      this._matches.replace(from, to, inserted);
      this._allocator.replace(from, to, inserted);
      if (this._currentMatch && this._currentMatch.from >= to) {
        let delta = inserted - (to - from);
        this._updateCurrentMatch({from: this._currentMatch.from + delta, to: this._currentMatch.to + delta}, false, false);
      } else if (this._currentMatch && this._currentMatch.to > from) {
        this._updateCurrentMatch(null, false, false);
      } else if (this._currentMatch) {
        this._updateCurrentMatch(this._currentMatch, false, false);
      }
      if (this._options)
        this._needsProcessing(from - this._options.query.length, from + inserted);
    }
    this._emitUpdatedIfNeeded();
  }

  _cancel() {
    this._matches.clearAll();
    this._currentMatch = null;
    this._options = null;
    if (this._jobId) {
      this._editor.platformSupport().cancelIdleCallback(this._jobId);
      this._jobId = 0;
    }
  }

  /**
   * @param {?Range} match
   * @param {boolean} select
   * @param {boolean} reveal
   */
  _updateCurrentMatch(match, select, reveal) {
    this._currentMatch = match;
    if (this._currentMatch) {
      // TODO: this probably should not go into history, or it messes up with undo.
      if (select) {
        this._document.setSelection([{
          anchor: this._currentMatch.from,
          focus: this._currentMatch.to,
        }]);
      }
      if (reveal) {
        this._editor.revealRange(this._currentMatch);
      }
    }
  }

  /**
   * @param {number} from
   * @param {number} to
   */
  _needsProcessing(from, to) {
    this._allocator.undone(from, to);
    if (!this._jobId && this._allocator.hasWork())
      this._jobId = this._editor.platformSupport().requestIdleCallback(this._searchChunk.bind(this));
  }

  /**
   * @param {!Range} range
   * @return {!Range}
   */
  _searchRange(range) {
    let {from, to} = range;
    let query = this._options.query;
    const findOptions = { caseInsensetive: !!this._options.caseInsensetive };
    this._matches.clearStarting(from, to);
    // NB: iterator constraints are inclusive.
    let iterator = this._document.text().iterator(from, from, to + query.length - 1);
    while (iterator.find(query, findOptions)) {
      this._matches.add(iterator.offset, iterator.offset + query.length, kMatchStyle);
      to = Math.max(to, iterator.offset + query.length);
      iterator.advance(query.length);
    }
    return {from, to};
  }
};

Search.Events = {
  Changed: 'changed'
};

Search.test = {};
Search.test.setChunkSize = function(search, chunkSize) {
  search._chunkSize = chunkSize;
};

const kMatchStyle = 'search.match';
