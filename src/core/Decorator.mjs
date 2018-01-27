/**
 * @typdef {{
 *   from: number,
 *   to: number,
 *   style: string,
 * }} Decoration
 */

 export class Decorator {
  constructor() {
    this._decorations = [];
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {string} style
   */
  add(from, to, style) {
    this._decorations.push({from, to, style});
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {string} style
   */
  remove(from, to, style) {
    for (let i = 0; i < this._decorations.length; i++) {
      let decoration = this._decorations[i];
      if (decoration.from === from && decoration.to === to && decoration.style === style) {
        this._decorations.splice(i, 1);
        return;
      }
    }
  }

  clearAll() {
    this._decorations = [];
  }

  /**
   * Leaves all decorations start..end, for which
   *   end <= from  or  start >= to.
   * @param {number} from
   * @param {number} to
   */
  clear(from, to) {
    let decorations = [];
    for (let decoration of this._decorations) {
      if (decoration.from >= to || decoration.to <= from)
        decorations.push(decoration);
    }
    this._decorations = decorations;
  }

  /**
   * Removes all decorations which start at [from, to].
   * @param {number} from
   * @param {number} to
   */
  clearStarting(from, to) {
    let decorations = [];
    for (let decoration of this._decorations) {
      if (decoration.from < from || decoration.from > to)
        decorations.push(decoration);
    }
    this._decorations = decorations;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   */
  onReplace(from, to, inserted) {
    let decorations = [];
    for (let decoration of this._decorations) {
      let start = decoration.from;
      let end = decoration.to;
      if (from < start && to > start)
        continue;

      if (from <= start)
        start = to >= start ? from : start - (to - from);
      if (from <= end)
        end = to >= end ? from : end - (to - from);

      if (from <= start)
        start += inserted;
      if (from <= end)
        end += inserted;

      decorations.push({from: start, to: end, style: decoration.style});
    }
    this._decorations = decorations;
  }

  /**
   * @return {!Array<!Decoration>}
   */
  all() {
    return this._decorations;
  }

  /**
   * @param {number} from
   * @param {number} to
   */
  count(from, to) {
    let count = 0;
    for (let decoration of this._decorations) {
      if (!(decoration.from > to || decoration.to < from))
        count++;
    }
    return count;
  }

  /**
   * @param {number} offset
   * @return {?Decoration}
   */
  after(offset) {
    let result = null;
    for (let decoration of this._decorations) {
      if (decoration.from < offset)
        continue;
      if (!result || result.from > decoration.from ||
          (result.from === decoration.from && result.to > decoration.to)) {
        result = decoration;
      }
    }
    return result;
  }

  /**
   * @param {number} offset
   * @return {?Decoration}
   */
  before(offset) {
    let result = null;
    for (let decoration of this._decorations) {
      if (decoration.to > offset)
        continue;
      if (!result || result.to < decoration.to ||
          (result.to === decoration.to && result.from < decoration.from)) {
        result = decoration;
      }
    }
    return result;
  }

  /**
   * @package
   * @param {!OffsetRange} range
   * @return {!Map<string, !Array<!OffsetRange>>}
   */
  styleToDecorations(range) {
    let result = new Map();
    for (let {from, to, style} of this._decorations) {
      if (from > range.to || to < range.from)
        continue;
      let bucket = result.get(style);
      if (!bucket) {
        bucket = [];
        result.set(style, bucket);
      }
      bucket.push({from, to});
    }
    return result;
  }
};
