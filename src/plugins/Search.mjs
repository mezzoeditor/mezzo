import { TextDecorator, ScrollbarDecorator } from '../core/Decorator.mjs';

/**
 * @typdef {{
 *   query: string,
 * }} SearchOptions
 */

export class Search {
  /**
   * @param {!Viewport} viewport
   * @param {!Selection} selection
   * @param {function(number, number)=} onUpdate
   *   Takes currentMatchIndex and totalMatchesCount.
   */
  constructor(viewport, selection, onUpdate) {
    this._viewport = viewport;
    this._viewport.addDecorationCallback(this._onDecorate.bind(this));
    this._document = viewport.document();
    this._document.addReplaceCallback(this._onReplace.bind(this));
    this._chunkSize = 20000;
    this._rangeToProcess = null;  // [from, to] inclusive.
    this._selection = selection;
    this._selection.addChangeCallback(() => { this._shouldUpdateSelection = false; });
    this._decorator = new ScrollbarDecorator('search.match');
    this._currentMatchDecorator = new TextDecorator();
    this._options = null;
    this._currentMatch = null;
    this._shouldUpdateSelection = false;

    this._onUpdate = (onUpdate || function() {}).bind(null);
    this._updated = false;
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
    return this._decorator.listAll();
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
    return this._decorator.countStarting(0, this._currentMatch.from) - 1;
  }

  /**
   * @param {!SearchOptions} options
   */
  search(options) {
    this._cancel();
    this._options = options;
    this._needsProcessing({from: 0, to: this._document.length() - options.query.length});
    this._updated = true;
    this._shouldUpdateSelection = true;
    this._document.invalidate();
  }

  cancel() {
    this._cancel();
    this._updated = true;
    this._document.invalidate();
  }

  /**
   * Moves to closest match after current cursor offset.
   * @return {boolean}
   */
  nextMatch() {
    let offset = this._selection.focus();
    if (offset === null && this._currentMatch)
      offset = this._currentMatch.from;
    if (offset === null)
      return false;
    let match = this._decorator.firstStarting(offset + 1, this._document.length());
    if (!match)
      match = this._decorator.firstStarting(0, this._document.length());
    if (!match)
      return false;
    this._updateCurrentMatch(match, true, true);
    this._updated = true;
    this._document.invalidate();
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
    let match = this._decorator.lastEnding(0, offset - 1);
    if (!match)
      match = this._decorator.lastEnding(0, this._document.length());
    if (!match)
      return false;
    this._updateCurrentMatch(match, true, true);
    this._updated = true;
    this._document.invalidate();
    return true;
  }

  /**
   * @return {boolean}
   */
  searchChunk() {
    if (!this._rangeToProcess)
      return false;

    let from = this._rangeToProcess.from;
    let to = Math.min(this._rangeToProcess.to, from + this._chunkSize);
    this._searchRange({from, to}, this._shouldUpdateSelection, this._shouldUpdateSelection);
    this._processed({from, to});
    this._document.invalidate();
    return !!this._rangeToProcess;
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

    if (this._updated) {
      this._updated = false;
      let currentMatchIndex = this.currentMatchIndex();
      let matchesCount = this.matchesCount();
      if (currentMatchIndex !== this._lastReportedCurrentMatchIndex ||
          matchesCount !== this._lastReportedMatchesCount) {
        this._lastReportedCurrentMatchIndex = currentMatchIndex;
        this._lastReportedMatchesCount = matchesCount;
        this._onUpdate(currentMatchIndex, matchesCount);
      }
    }

    return {background: [this._decorator, this._currentMatchDecorator], scrollbar: [this._decorator]};
  }

  /**
   * @param {!Replacement} replacement
   */
  _onReplace(replacement) {
    let {from, to, inserted} = replacement;
    this._decorator.replace(from, to, inserted);
    this._currentMatchDecorator.replace(from, to, inserted);
    if (this._currentMatch && this._currentMatch.from >= to) {
      let delta = inserted - (to - from);
      this._updateCurrentMatch({from: this._currentMatch.from + delta, to: this._currentMatch.to + delta}, false, false);
    } else if (this._currentMatch && this._currentMatch.to > from) {
      this._updateCurrentMatch(null, false, false);
    } else if (this._currentMatch) {
      this._updateCurrentMatch(this._currentMatch, false, false);
    }
    this._updated = true;
    if (this._options) {
      this._processed({from: from - this._options.query.length, to});
      this._needsProcessing({
        from: Math.max(from - this._options.query.length, 0),
        to: Math.min(from + inserted, this._document.length())
      });
    }
  }

  _cancel() {
    this._rangeToProcess = null;
    this._decorator.clearAll();
    this._currentMatchDecorator.clearAll();
    this._currentMatch = null;
    this._options = null;
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
      this._currentMatchDecorator.add(this._currentMatch.from, this._currentMatch.to, 'search.match.current');
      // TODO: this probably should not go into history, or it messes up with undo.
      if (select)
        this._selection.setRanges([this._currentMatch]);
      if (reveal)
        this._viewport.reveal(this._currentMatch);
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
    this._decorator.clearStarting(from, to);
    let iterator = this._document.iterator(from, from, to + query.length);
    while (iterator.find(query)) {
      this._decorator.add(iterator.offset, iterator.offset + query.length);
      if (!this._currentMatch)
        this._updateCurrentMatch({from: iterator.offset, to: iterator.offset + query.length}, selectCurrentMatch, revealCurrentMatch);
      iterator.advance(query.length);
    }
    this._updated = true;
    return range;
  }
};
