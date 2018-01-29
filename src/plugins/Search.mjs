import { Decorator } from "../core/Decorator.mjs";

/**
 * @typdef {{
 *   query: string,
 * }} SearchOptions
 */

export class Search {
  /**
   * @param {!Document} document
   * @param {!Selection} selection
   * @param {function()=} onUpdate
   */
  constructor(document, selection, onUpdate) {
    this._document = document;
    this._selection = selection;
    this._onUpdate = (onUpdate || function() {}).bind(null);
    this._decorator = new Decorator();
    this._currentMatchDecorator = new Decorator();
    this._options = null;
    this._currentMatch = null;
    // Range of possible starts of the query, |to| included.
    this._searchRange = null;
    this._scheduledTimeout = null;
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
  onBeforeViewport(viewport) {
    if (!this._searchRange || (this._searchRange.to - this._searchRange.from > 20000))
      return;
    this._searchChunk(this._searchRange.from, this._searchRange.to, true /* noReveal */);
    this._onUpdate();
  }

  /**
   * @override
   * @param {!Viewport} viewport
   */
  onViewport(viewport) {
    if (!this._searchRange)
      return;

    let query = this._options.query;
    let viewportRange = viewport.range();
    if (this._searchRange.from >= viewportRange.to || this._searchRange.to <= viewportRange.from - query.length)
      return;

    let updateSelection = false;
    for (let range of viewport.ranges()) {
      let from = Math.max(0, range.from - query.length);
      let to = Math.min(this._document.length() - query.length, range.to);
      to = Math.max(from, to);
      if (this._searchChunk(from, to, true /* noReveal */))
        updateSelection = true;
    }
    if (updateSelection)
      this._selection.onViewport(viewport);
    this._onUpdate();
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
    if (this._options) {
      let length = this._options.query.length;
      this._searched(from, to - length);
      this._search(Math.max(0, from - length), Math.min(this._document.length() - length, from + inserted));
    }
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
        this._search(0, this._document.length() - this._options.query.length);
        this._document.invalidate();
        this._onUpdate();
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
        this._onUpdate();
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
        this._onUpdate();
        return true;
      }
      case 'search.cancel': {
        this._cancel();
        this._document.invalidate();
        this._onUpdate();
        return true;
      }
    }
  }

  // ------ Internals -------

  _cancel() {
    this._clearScheduled();
    this._searchRange = null;
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

  /**
   * @param {number} from
   * @param {number} to
   */
  _search(from, to) {
    if (this._searchRange) {
      from = Math.min(from, this._searchRange.from);
      to = Math.max(to, this._searchRange.to);
    }
    this._searchRange = {from, to};
    this._schedule();
  }

  /**
   * @param {number} from
   * @param {number} to
   */
  _searched(from, to) {
    if (!this._searchRange)
      return;
    if (from <= this._searchRange.from && to >= this._searchRange.to) {
      this._searchRange = null;
      this._clearScheduled();
      return;
    }
    if (from <= this._searchRange.from && to >= this._searchRange.from)
      this._searchRange.from = to;
    else if (from <= this._searchRange.to && to >= this._searchRange.to)
      this._searchRange.to = from;
  }

  _schedule() {
    if (this._searchRange && !this._scheduledTimeout)
      this._scheduledTimeout = requestIdleCallback(this._performScheduledSearch.bind(this), {timeout: 1000});
  }

  _clearScheduled() {
    if (this._scheduledTimeout)
      cancelIdleCallback(this._scheduledTimeout);
    this._scheduledTimeout = null;
  }

  /**
   * @param {!IdleDeadline} deadline
   */
  _performScheduledSearch(deadline) {
    this._scheduledTimeout = null;
    while ((deadline.timeRemaining() > 0 || deadline.didTimeout) && this._searchRange) {
      let from = this._searchRange.from;
      let to = Math.min(this._searchRange.to, from + 10000);
      this._searchChunk(from, to);
    }
    this._onUpdate();
    this._schedule();
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {boolean=} noReveal
   * @return {boolean} Whether current match was updated.
   */
  _searchChunk(from, to, noReveal) {
    this._searched(from, to);
    let query = this._options.query;
    this._decorator.clearStarting(from, to);

    let currentMatchUpdated = false;
    let iterator = this._document.iterator(from, from, to + query.length);
    while (iterator.find(query)) {
      this._decorator.add(iterator.offset, iterator.offset + query.length, 'search.match');
      if (!this._currentMatch) {
        this._updateCurrentMatch({from: iterator.offset, to: iterator.offset + query.length}, noReveal);
        currentMatchUpdated = true;
      }
      iterator.advance(query.length);
    }
    return currentMatchUpdated;
  }
};

Search.Commands = new Set([
  'search.find',     // Takes SearchOptions.
  'search.next',     // Moves to closest match after current cursor position.
  'search.previous', // Moves to closest match before current cursor position.
  'search.cancel',
]);

Search.Decorations = new Set(['search.match', 'search.match.current']);
