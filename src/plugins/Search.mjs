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
    this._onUpdate = onUpdate;
    this._decorator = new Decorator();
    this._options = null;
    this._currentMatch = null;
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
  }

  /**
   * @override
   * @param {!Document} document
   */
  onRemoved(document) {
    document.removeDecorator(this._decorator);
  }

  /**
   * @override
   * @param {!Viewport} viewport
   */
  onViewport(viewport) {
    if (!this._options)
      return;

    let query = this._options.query;
    for (let range of viewport.ranges()) {
      let from = Math.max(0, range.from - query.length);
      let to = Math.min(this._document.length(), range.to + query.length);
      this._decorator.clear(from, range.to);

      let iterator = viewport.document().iterator(from, from, to);
      while (iterator.find(query)) {
        this._decorator.add(iterator.offset, iterator.offset + query.length, 'search.match');
        if (!this._currentMatch) {
          this._currentMatch = {from: iterator.offset, to: iterator.offset + query.length};
          setTimeout(() => this._updateCurrentMatch(this._currentMatch), 0);
        }
        iterator.advance(query.length);
      }

      this._searched(from, range.to);
    }

    if (this._onUpdate)
      this._onUpdate.call(null);
  }

  /**
   * @override
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   */
  onReplace(from, to, inserted) {
    this._decorator.onReplace(from, to, inserted);
    this._searched(from, to);
    if (this._options) {
      from = Math.max(0, from - this._options.query.length);
      to = Math.min(this._document.length(), from + inserted + this._options.query.length);
      this._search(from, to);
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
        this._search(0, this._document.length());
        this._document.invalidate();
        if (this._onUpdate)
          this._onUpdate.call(null);
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
        if (this._onUpdate)
          this._onUpdate.call(null);
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
        if (this._onUpdate)
          this._onUpdate.call(null);
        return true;
      }
      case 'search.cancel': {
        this._cancel();
        this._document.invalidate();
        if (this._onUpdate)
          this._onUpdate.call(null);
        return true;
      }
    }
  }

  _cancel() {
    this._clearScheduled();
    this._searchRange = null;
    this._decorator.clearAll();
    this._currentMatch = null;
    this._options = null;
  }

  /**
   * @param {?OffsetRange} match
   */
  _updateCurrentMatch(match) {
    if (this._currentMatch) {
      this._decorator.remove(this._currentMatch.from, this._currentMatch.to, 'search.match.current');
      this._decorator.add(this._currentMatch.from, this._currentMatch.to, 'search.match');
    }
    this._currentMatch = match;
    if (this._currentMatch) {
      this._decorator.remove(this._currentMatch.from, this._currentMatch.to, 'search.match');
      this._decorator.add(this._currentMatch.from, this._currentMatch.to, 'search.match.current');
      this._selection.setRanges([this._currentMatch]);
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
      this._scheduledTimeout = setTimeout(this._performScheduledSearch.bind(this), 100);
  }

  _clearScheduled() {
    if (this._scheduledTimeout)
      clearTimeout(this._scheduledTimeout);
    this._scheduledTimeout = null;
  }

  _performScheduledSearch() {
    this._scheduledTimeout = null;

    let from = this._searchRange.from;
    let to = Math.min(this._searchRange.to, from + 10000);
    this._searched(from, to);

    let query = this._options.query;
    to = Math.min(this._document.length(), to + query.length);
    let iterator = this._document.iterator(from, from, to);
    while (iterator.find(query)) {
      this._decorator.add(iterator.offset, iterator.offset + query.length, 'search.match');
      if (!this._currentMatch)
        this._updateCurrentMatch({from: iterator.offset, to: iterator.offset + query.length});
      iterator.advance(query.length);
    }

    if (this._onUpdate)
      this._onUpdate.call(null);

    this._schedule();
  }
};

Search.Commands = new Set([
  'search.find',     // Takes SearchOptions.
  'search.next',     // Moves to closest match after current cursor position.
  'search.previous', // Moves to closest match before current cursor position.
  'search.cancel',
]);

Search.Decorations = new Set(['search.match', 'search.match.current']);
