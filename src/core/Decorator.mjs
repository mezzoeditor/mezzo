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

  clear() {
    this._decorations = [];
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
