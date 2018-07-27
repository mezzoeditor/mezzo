import { Start, End, Range } from '../core/Anchor.mjs';
import { LineDecorator } from '../core/Decorator.mjs';
import { Selection } from './Selection.mjs';
import { EventEmitter } from '../core/EventEmitter.mjs';
import { WorkAllocator } from '../core/WorkAllocator.mjs';
import { Document } from '../core/Document.mjs';

const CHUNK_SIZE = 200000;

export class Search extends EventEmitter {
  /**
   * @param {!Editor} editor
   */
  constructor(editor) {
    super();
    this._chunkSize = CHUNK_SIZE;
    this._editor = editor;
    this._viewport = editor.viewport();
    this._viewport.addDecorationCallback(this._onDecorate.bind(this));
    this._document = editor.document();
    this._document.on(Document.Events.Replaced, this._onReplace.bind(this));

    this._allocator = new WorkAllocator(0);

    this._selection = editor.selection();
    this._selection.on(Selection.Events.Changed, () => { this._shouldUpdateSelection = false; });
    this._decorator = new LineDecorator('search.match');
    this._currentMatchDecorator = new LineDecorator('search.match.current');
    this._options = null;
    this._currentMatch = null;
    this._shouldUpdateSelection = false;

    this._lastEnabled = false;
    this._lastReportedCurrentMatchIndex = -1;
    this._lastReportedMatchesCount = 0;
  }

  /**
   * @return {number}
   */
  matchesCount() {
    return this._decorator.countAll();
  }

  /**
   * @return {!Array<!Range>}
   */
  matches() {
    return this._decorator.listAll().map(Range);
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
    return this._decorator.countStarting(Start(0), End(this._currentMatch.from)) - 1;
  }

  /**
   * @param {string} query
   * @param {{caseInsensetive: boolean}=} options
   */
  find(query, options = {caseInsensetive: true}) {
    this._cancel();
    this._options = {query, caseInsensetive: !!options.caseInsensetive};
    this._allocator = new WorkAllocator(this._document.length() - query.length + 1);
    this._needsProcessing(0, this._document.length());
    this._shouldUpdateSelection = true;
    this._viewport.raf();
    this._emitUpdatedIfNeeded();
  }

  cancel() {
    this._cancel();
    this._viewport.raf();
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
    let offset = this._selection.focus();
    if (offset === null && this._currentMatch)
      offset = this._currentMatch.to;
    if (offset === null)
      return false;
    let match = this._decorator.firstStarting(Start(offset), End(this._document.length()));
    if (!match)
      match = this._decorator.firstAll();
    if (!match)
      return false;
    this._updateCurrentMatch(Range(match), true, true);
    this._viewport.raf();
    this._emitUpdatedIfNeeded();
    return true;
  }

  /**
   * Moves to closest match before current cursor offset.
   * @return {boolean}
   */
  previousMatch() {
    let offset = this._selection.focus();
    if (offset === null && this._currentMatch)
      offset = this._currentMatch.from;
    if (offset === null)
      return false;
    let match = this._decorator.lastEnding(Start(0), Start(offset));
    if (!match)
      match = this._decorator.lastAll();
    if (!match)
      return false;
    this._updateCurrentMatch(Range(match), true, true);
    this._viewport.raf();
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
    if (!this._currentMatch && this._decorator.countAll() > 0) {
      let fromSelection = this._selection.hasRanges() ? Math.min(this._selection.focus(), this._selection.anchor()) : 0;
      // Prefer matches after cursor if possible.
      let match = this._decorator.firstStarting(Start(fromSelection), Start(this._document.length())) ||
          this._decorator.firstStarting(Start(0), Start(fromSelection));
      this._updateCurrentMatch(Range(match), this._shouldUpdateSelection, this._shouldUpdateSelection);
    }

    this._viewport.raf();
    if (this._allocator.hasWork())
      this._jobId = this._editor.platformSupport().requestIdleCallback(this._searchChunk.bind(this));
    this._emitUpdatedIfNeeded();
  }

  // ------ Internals -------

  /**
   * @param {!Viewport.VisibleContent} visibleContent
   * @return {?Viewpor.DecorationResult}
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
    if (!this._currentMatch && this._decorator.countAll() > 0) {
      let fromSelection = this._selection.hasRanges() ? Math.min(this._selection.focus(), this._selection.anchor()) : 0;
      // Prefer matches after cursor if possible.
      let match = this._decorator.firstStarting(Start(fromSelection), Start(this._document.length())) ||
          this._decorator.firstStarting(Start(0), Start(fromSelection));
      this._updateCurrentMatch(Range(match), this._shouldUpdateSelection, false);
      this._selection._onDecorate(visibleContent);
    }

    this._emitUpdatedIfNeeded();
    return {background: [this._decorator, this._currentMatchDecorator], lines: [this._decorator]};
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
   * @param {!Replacement} replacement
   */
  _onReplace(replacement) {
    if (!this._options)
      return;
    let from = replacement.offset;
    let to = from + replacement.removed.length();
    let inserted = replacement.inserted.length();
    this._decorator.replace(from, to, inserted);
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
    this._emitUpdatedIfNeeded();
  }

  _cancel() {
    this._decorator.clearAll();
    this._currentMatchDecorator.clearAll();
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
    if (this._currentMatch)
      this._currentMatchDecorator.clearAll();
    this._currentMatch = match;
    if (this._currentMatch) {
      this._currentMatchDecorator.add(Start(this._currentMatch.from), Start(this._currentMatch.to));
      // TODO: this probably should not go into history, or it messes up with undo.
      if (select)
        this._selection.setRanges([this._currentMatch]);
      if (reveal) {
        this._viewport.reveal(this._currentMatch, {
          left: 10,
          right: 10,
          top: this._viewport.height() / 2,
          bottom: this._viewport.height() / 2,
        });
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
    this._decorator.clearStarting(Start(from), Start(to));
    // NB: iterator constraints are inclusive.
    let iterator = this._document.iterator(from, from, to + query.length - 1);
    while (iterator.find(query, findOptions)) {
      this._decorator.add(Start(iterator.offset), Start(iterator.offset + query.length));
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
}
