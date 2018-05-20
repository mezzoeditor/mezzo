import { Start, End, Range } from '../core/Anchor.mjs';
import { LineDecorator } from '../core/Decorator.mjs';
import { Selection } from './Selection.mjs';
import { EventEmitter } from '../core/EventEmitter.mjs';

export class Search extends EventEmitter {
  /**
   * @param {!Editor} editor
   */
  constructor(editor) {
    super();
    this._editor = editor;
    this._viewport = editor.viewport();
    this._viewport.addDecorationCallback(this._onDecorate.bind(this));
    this._document = editor.document();
    this._document.addReplaceCallback(this._onReplace.bind(this));
    this._chunkSize = 20000;
    this._rangeToProcess = null;  // [from, to] inclusive.
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
    this._needsProcessing({from: 0, to: this._document.length() - query.length});
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
    if (!this._rangeToProcess)
      return;

    let from = this._rangeToProcess.from;
    let to = Math.min(this._rangeToProcess.to, from + this._chunkSize);
    this._searchRange({from, to}, this._shouldUpdateSelection, this._shouldUpdateSelection);
    this._processed({from, to});
    this._viewport.raf();
    if (this._rangeToProcess)
      this._jobId = this._editor.platformSupport().requestIdleCallback(this._searchChunk.bind(this));
    this._emitUpdatedIfNeeded();
  }

  // ------ Internals -------

  /**
   * @param {!Viewport.VisibleContent} visibleContent
   * @return {!Viewpor.DecorationResult}
   */
  _onDecorate(visibleContent) {
    if (this._rangeToProcess &&
        this._rangeToProcess.from <= visibleContent.range.to &&
        this._rangeToProcess.to >= visibleContent.range.from - this._options.query.length) {
      let hadCurrentMatch = !!this._currentMatch;
      for (let range of visibleContent.ranges) {
        let from = Math.max(0, range.from - this._options.query.length);
        let to = Math.min(range.to, this._document.length() - this._options.query.length);
        to = Math.max(from, to);
        this._searchRange({from, to}, this._shouldUpdateSelection, false);
        this._processed({from, to});
      }
      if (!hadCurrentMatch && this._currentMatch)
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
   * @param {!Replacements} replacements
   */
  _onReplace(replacements) {
    for (let replacement of replacements) {
      let from = replacement.offset;
      let to = from + replacement.removed.length();
      let inserted = replacement.inserted.length();
      this._decorator.replace(from, to, inserted);
      if (this._currentMatch && this._currentMatch.from >= to) {
        let delta = inserted - (to - from);
        this._updateCurrentMatch({from: this._currentMatch.from + delta, to: this._currentMatch.to + delta}, false, false);
      } else if (this._currentMatch && this._currentMatch.to > from) {
        this._updateCurrentMatch(null, false, false);
      } else if (this._currentMatch) {
        this._updateCurrentMatch(this._currentMatch, false, false);
      }
      if (this._options) {
        this._processed({from: from - this._options.query.length, to});
        this._needsProcessing({
          from: Math.max(from - this._options.query.length, 0),
          to: Math.min(from + inserted, replacement.after.length())
        });
      }
    }
    this._emitUpdatedIfNeeded();
  }

  _cancel() {
    this._rangeToProcess = null;
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
      if (reveal)
        this._viewport.reveal(this._currentMatch, {
          left: 10,
          right: 10,
          top: this._viewport.height() / 2,
          bottom: this._viewport.height() / 2,
        });
    }
  }

  /**
   * @param {!Range} range
   */
  _needsProcessing(range) {
    let {from, to} = range;
    if (this._rangeToProcess) {
      from = Math.min(from, this._rangeToProcess.from);
      to = Math.max(to, this._rangeToProcess.to);
    }
    this._rangeToProcess = {from, to};
    if (!this._jobId)
      this._jobId = this._editor.platformSupport().requestIdleCallback(this._searchChunk.bind(this));
  }

  /**
   * @param {!Range} range
   */
  _processed(range) {
    if (!this._rangeToProcess)
      return;
    let {from, to} = range;
    if (from <= this._rangeToProcess.from && to >= this._rangeToProcess.to) {
      this._rangeToProcess = null;
      return;
    }
    if (from <= this._rangeToProcess.from && to >= this._rangeToProcess.from)
      this._rangeToProcess.from = to;
    else if (from <= this._rangeToProcess.to && to >= this._rangeToProcess.to)
      this._rangeToProcess.to = from;
  }

  /**
   * @param {!Range} range
   * @param {boolean} selectCurrentMatch
   * @param {boolean} revealCurrentMatch
   * @return {!Range}
   */
  _searchRange(range, selectCurrentMatch, revealCurrentMatch) {
    let {from, to} = range;
    let query = this._options.query;
    const findOptions = { caseInsensetive: !!this._options.caseInsensetive };
    this._decorator.clearStarting(Start(from), End(to));
    let iterator = this._document.iterator(from, from, to + query.length);
    while (iterator.find(query, findOptions)) {
      this._decorator.add(Start(iterator.offset), Start(iterator.offset + query.length));
      if (!this._currentMatch)
        this._updateCurrentMatch({from: iterator.offset, to: iterator.offset + query.length}, selectCurrentMatch, revealCurrentMatch);
      iterator.advance(query.length);
    }
    return range;
  }
};

Search.Events = {
  Changed: 'changed'
};
