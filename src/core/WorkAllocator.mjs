import { Decorator } from './Decorator.mjs';

export class WorkAllocator {
  /**
   * @param {number} size
   */
  constructor(size) {
    this._size = size;
    this._work = new Decorator(false /* createHandles */);
    this._addWork(0, size);
  }

  /**
   * @param {number} x
   * @return {number}
   */
  _clamp(x) {
    if (x < 0)
      return 0;
    if (x > this._size)
      return this._size;
    return x;
  }

  /**
   * @param {number} from
   * @param {number} to
   */
  _addWork(from, to) {
    if (from !== to)
      this._work.add(from, to);
  }

  /**
   * @param {number=} from
   * @param {number=} to
   */
  done(from = 0, to = this._size) {
    from = this._clamp(from);
    to = this._clamp(to);
    // Use +0.5 to merge with ranges starting at |to|.
    const workRanges = this._work.listTouching(from, to + 0.5);
    this._work.clearTouching(from, to + 0.5);
    for (const workRange of workRanges) {
      // if dirty range belongs to the cleared range - drop it.
      if (from < workRange.from && workRange.to < to)
        continue;
      if (workRange.from < from)
        this._addWork(workRange.from, from);
      if (to < workRange.to)
        this._addWork(to, workRange.to);
    }
  }

  /**
   * @param {number=} from
   * @param {number=} to
   */
  undone(from = 0, to = this._size) {
    from = this._clamp(from);
    to = this._clamp(to);
    // Use +0.5 to merge with ranges starting at |to|.
    const workRanges = this._work.listTouching(from, to + 0.5);
    this._work.clearTouching(from, to + 0.5);

    for (const range of workRanges) {
      if (range.from < from)
        from = range.from;
      if (range.to > to)
        to = range.to;
    }
    this._addWork(from, to);
  }

  /**
   * @param {number=} from
   * @param {number=} to
   * @return {?Range}
   */
  workRange(from = 0, to = this._size) {
    from = this._clamp(from);
    to = this._clamp(to);
    // Use +0.5 to return non-zero length range.
    let workRange = this._work.firstTouching(from + 0.5, to);
    if (!workRange)
      return null;
    return {
      from: Math.max(from, workRange.from),
      to: Math.min(to, workRange.to)
    };
  }

  /**
   * @return {boolean}
   */
  hasWork() {
    return this._work.countAll() > 0;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   */
  replace(from, to, inserted) {
    this._work.replace(from, to, inserted);
    this._size += from - to + inserted;
  }

  /**
   * @param {number} size
   */
  resize(size) {
    if (size === this._size)
      return;
    if (size > this._size) {
      this._addWork(this._size, size);
      this._size = size;
    } else {
      this.undone(size);
      this._size = size;
    }
  }
}

