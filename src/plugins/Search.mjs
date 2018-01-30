import { Decorator } from "../core/Decorator.mjs";
import { RangeScheduler } from "../core/RangeScheduler.mjs";

/**
 * @typdef {{
 *   query: string,
 * }} SearchOptions
 */

export class Search {
  /**
   * @param {!Document} document
   * @param {!Scheduler} scheduler
   * @param {!Selection} selection
   * @param {function()=} onUpdate
   */
  constructor(document, scheduler, selection, onUpdate) {
    this._document = document;
    this._scheduler = new RangeScheduler(
        scheduler,
        this._visibleRangeToProcessingRange.bind(this),
        this._searchRange.bind(this),
        20000,
        this._updated.bind(this));
    this._selection = selection;
    this._onUpdate = (onUpdate || function() {}).bind(null);
    this._decorator = new Decorator();
    this._currentMatchDecorator = new Decorator();
    this._options = null;
    this._currentMatch = null;
    this._noReveal = false;
  }

  /**
   * @return {number}
   */
  matchesCount() {
    return this._decorator.all().length;
  }

  /**
   * @return {!Array<!OffsetRange>}
   */
  matches() {
    return this._decorator.all();
  }

  /**
   * @return {?OffsetRange}
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
    return this._decorator.count(0, this._currentMatch.from) - 1;
  }

  // ------- Plugin -------

  /**
   * @override
   * @param {!Document} document
   */
  onAdded(document) {
    document.addDecorator(this._decorator);
    document.addDecorator(this._currentMatchDecorator);
  }

  /**
   * @override
   * @param {!Document} document
   */
  onRemoved(document) {
    document.removeDecorator(this._decorator);
    document.removeDecorator(this._currentMatchDecorator);
  }

  /**
   * @override
   * @param {!Viewport} viewport
   */
  onBeforeViewport() {
    this._scheduler.onBeforeViewport();
  }

  /**
   * @override
   * @param {!Viewport} viewport
   */
  onViewport(viewport) {
    this._noReveal = true;
    let hadCurrentMatch = !!this._currentMatch;
    this._scheduler.onViewport(viewport);
    this._noReveal = false;
    if (!hadCurrentMatch && this._currentMatch)
      this._selection.onViewport(viewport);
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
    if (this._options)
      this._scheduler.onReplace(from, to, inserted);
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
        this._updated();
        return true;
      }
      case 'search.next': {
        let offset = this._selection.focus();
        if (offset === null && this._currentMatch)
          offset = this._currentMatch.from;
        if (offset === null)
          return false;
        let match = this._decorator.after(offset + 1);
        if (!match)
          match = this._decorator.after(0);
        if (!match)
          return false;
        this._updateCurrentMatch(match);
        this._updated();
        return true;
      }
      case 'search.previous': {
        let offset = this._selection.focus();
        if (offset === null && this._currentMatch)
          offset = this._currentMatch.from;
        if (offset === null)
          return false;
        let match = this._decorator.before(offset - 1);
        if (!match)
          match = this._decorator.before(this._document.length());
        if (!match)
          return false;
        this._updateCurrentMatch(match);
        this._updated();
        return true;
      }
      case 'search.cancel': {
        this._cancel();
        this._updated();
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
   * @param {?OffsetRange} match
   * @param {boolean=} noReveal
   */
  _updateCurrentMatch(match, noReveal) {
    if (this._currentMatch)
      this._currentMatchDecorator.remove(this._currentMatch.from, this._currentMatch.to, 'search.match.current');
    this._currentMatch = match;
    if (this._currentMatch) {
      this._currentMatchDecorator.add(this._currentMatch.from, this._currentMatch.to, 'search.match.current');
      this._selection.setRanges([this._currentMatch], noReveal);
    }
  }

  _updated() {
    this._document.invalidate();
    this._onUpdate();
  }

  /**
   * @param {!OffsetRange} range
   * @return {!OffsetRange}
   */
  _searchRange(range) {
    let {from, to} = range;
    let query = this._options.query;
    this._decorator.clearStarting(from, to);
    let iterator = this._document.iterator(from, from, to + query.length);
    while (iterator.find(query)) {
      this._decorator.add(iterator.offset, iterator.offset + query.length, 'search.match');
      if (!this._currentMatch)
        this._updateCurrentMatch({from: iterator.offset, to: iterator.offset + query.length}, this._noReveal);
      iterator.advance(query.length);
    }
    return range;
  }

  /**
   * @param {!OffsetRange} range
   * @return {?OffsetRange}
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
  'search.next',     // Moves to closest match after current cursor position.
  'search.previous', // Moves to closest match before current cursor position.
  'search.cancel',
]);

Search.Decorations = new Set(['search.match', 'search.match.current']);
