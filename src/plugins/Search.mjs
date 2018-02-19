import { TextDecorator, ScrollbarDecorator } from "../core/Decorator.mjs";
import { RangeScheduler } from "../core/RangeScheduler.mjs";

/**
 * @typdef {{
 *   query: string,
 * }} SearchOptions
 */

/**
 * @implements Plugin
 */
export class Search {
  /**
   * @param {!Document} document
   * @param {!Scheduler} scheduler
   * @param {!Selection} selection
   * @param {function(number, number)=} onUpdate
   *   Takes currentMatchIndex and totalMatchesCount.
   */
  constructor(document, scheduler, selection, onUpdate) {
    this._document = document;
    this._scheduler = new RangeScheduler(
        scheduler,
        this._visibleRangeToProcessingRange.bind(this),
        this._searchRange.bind(this),
        20000,
        () => document.invalidate());
    this._selection = selection;
    this._decorator = new ScrollbarDecorator('search.match');
    this._currentMatchDecorator = new TextDecorator();
    this._options = null;
    this._currentMatch = null;
    this._noReveal = false;

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

  // ------- Plugin -------

  /**
   * @override
   */
  onBeforeFrame() {
    this._scheduler.onBeforeFrame();
  }

  /**
   * @override
   * @param {!Frame} frame
   * @return {!PluginFrameResult}
   */
  onFrame(frame) {
    this._noReveal = true;
    let hadCurrentMatch = !!this._currentMatch;
    this._scheduler.onFrame(frame);
    this._noReveal = false;
    if (!hadCurrentMatch && this._currentMatch)
      this._selection.onFrame(frame);
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
    return {text: [this._decorator, this._currentMatchDecorator], scrollbar: [this._decorator]};
  }

  /**
   * @override
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   */
  onReplace(from, to, inserted) {
    this._decorator.onReplace(from, to, inserted);
    this._currentMatchDecorator.onReplace(from, to, inserted);
    this._noReveal = true;
    if (this._currentMatch && this._currentMatch.from >= to) {
      let delta = inserted - (to - from);
      this._updateCurrentMatch({from: this._currentMatch.from + delta, to: this._currentMatch.to + delta});
    } else if (this._currentMatch && this._currentMatch.to > from) {
      this._updateCurrentMatch(null);
    }
    this._noReveal = false;
    this._updated = true;
    if (this._options)
      this._scheduler.onReplace(from, to, inserted);
  }

  /**
   * @param {!Array<{from: number, to: number, inserted: number}>} replacements
   * @param {*|undefined} data
   */
  onRestore(replacements, data) {
    for (let replacement of replacements)
      this.onReplace(replacement.from, replacement.to, replacement.inserted);
  }

  /**
   * @param {string} command
   * @param {*} data
   * @return {*|undefined}
   */
  onCommand(command, data) {
    if (!Search.Commands.has(command))
      return;

    switch (command) {
      case 'search.find': {
        this._cancel();
        this._options = data;
        this._scheduler.start(this._document);
        this._updated = true;
        this._document.invalidate();
        return true;
      }
      case 'search.next': {
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
        this._updateCurrentMatch(match);
        this._updated = true;
        this._document.invalidate();
        return true;
      }
      case 'search.previous': {
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
        this._updateCurrentMatch(match);
        this._updated = true;
        this._document.invalidate();
        return true;
      }
      case 'search.cancel': {
        this._cancel();
        this._updated = true;
        this._document.invalidate();
        return true;
      }
    }
  }

  // ------ Internals -------

  _cancel() {
    this._scheduler.stop();
    this._decorator.clearAll();
    this._currentMatchDecorator.clearAll();
    this._currentMatch = null;
    this._options = null;
  }

  /**
   * @param {?Range} match
   * @param {boolean=} noReveal
   */
  _updateCurrentMatch(match, noReveal) {
    if (this._currentMatch)
      this._currentMatchDecorator.clearAll();
    this._currentMatch = match;
    if (this._currentMatch) {
      this._currentMatchDecorator.add(this._currentMatch.from, this._currentMatch.to, 'search.match.current');
      // TODO: this probably should not go into history, or it messes up with undo.
      this._selection.setRanges([this._currentMatch], noReveal);
    }
  }

  /**
   * @param {!Range} range
   * @return {!Range}
   */
  _searchRange(range) {
    let {from, to} = range;
    let query = this._options.query;
    this._decorator.clearStarting(from, to);
    let iterator = this._document.iterator(from, from, to + query.length);
    while (iterator.find(query)) {
      this._decorator.add(iterator.offset, iterator.offset + query.length);
      if (!this._currentMatch)
        this._updateCurrentMatch({from: iterator.offset, to: iterator.offset + query.length}, this._noReveal);
      iterator.advance(query.length);
    }
    this._updated = true;
    return range;
  }

  /**
   * @param {!Range} range
   * @return {?Range}
   */
  _visibleRangeToProcessingRange(range) {
    if (!this._options)
      return null;
    let from = Math.max(0, range.from - this._options.query.length);
    let to = Math.min(range.to, this._document.length() - this._options.query.length);
    to = Math.max(from, to);
    return {from, to};
  }
};

Search.Commands = new Set([
  'search.find',     // Takes SearchOptions.
  'search.next',     // Moves to closest match after current cursor offset.
  'search.previous', // Moves to closest match before current cursor offset.
  'search.cancel',
]);

Search.Decorations = new Set(['search.match', 'search.match.current']);
