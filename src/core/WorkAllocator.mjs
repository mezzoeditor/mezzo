import { Left, Right, CompareAnchors, Offset } from './Anchor.mjs';
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
    if (from === to)
      return;
    // Enforce all range to be |Left| anchors.
    this._work.add(Left(from), Left(to));
  }

  /**
   * @param {number=} from
   * @param {number=} to
   */
  done(from = 0, to = this._size) {
    // Use |Left| and |Right| anchors to merge adjacent ranges.
    from = Left(this._clamp(from));
    to = Right(this._clamp(to));
    const workRanges = this._work.listTouching(from, to);
    this._work.clearTouching(from, to);
    for (const workRange of workRanges) {
      // if dirty range belongs to the cleared range - drop it.
      if (CompareAnchors(from, workRange.from) < 0 && CompareAnchors(workRange.to, to) < 0)
        continue;
      if (CompareAnchors(workRange.from, from) < 0)
        this._addWork(Offset(workRange.from), Offset(from));
      if (CompareAnchors(to, workRange.to) < 0)
        this._addWork(Offset(to), Offset(workRange.to));
    }
  }

  /**
   * @param {number=} from
   * @param {number=} to
   */
  undone(from = 0, to = this._size) {
    // Use |Left| and |Right| anchors to merge adjacent ranges.
    from = Left(this._clamp(from));
    to = Right(this._clamp(to));
    const workRanges = this._work.listTouching(from, to);
    this._work.clearTouching(from, to);

    for (const range of workRanges) {
      if (CompareAnchors(range.from, from) < 0)
        from = range.from;
      if (CompareAnchors(range.to, to) > 0)
        to = range.to;
    }
    this._addWork(Offset(from), Offset(to));
  }

  /**
   * @param {number=} from
   * @param {number=} to
   * @return {?Range}
   */
  workRange(from = 0, to = this._size) {
    // Use |Right| anchor to avoid zero-length ranges.
    from = Right(this._clamp(from));
    to = Left(this._clamp(to));
    let workRange = this._work.firstTouching(from, to);
    if (!workRange)
      return null;
    return {
      from: Math.max(Offset(from), Offset(workRange.from)),
      to: Math.min(Offset(to), Offset(workRange.to))
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

