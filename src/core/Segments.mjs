// All segments should be disjoint.
export class Segments {
  /**
   * @param {!Array<{from: number, to: number, data: *}>=} segments
   */
  constructor(segments) {
    this._from = [];
    this._to = [];
    this._data = [];
    if (segments) {
      let last = -1;
      for (let i = 0; i < segments.length; i++) {
        if (segments[i].from > segments[i].to)
          throw 'Segment end must not be less than start';
        if (segments[i].from < last)
          throw 'Segment must be disjoint';
        this._from.push(segments[i].from);
        this._to.push(segments[i].to);
        this._data.push(segments[i].data);
        last = segments[i].to;
      }
    }
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {number} length
   * @return {!Segments}
   */
  replace(from, to, length) {
    let delta = length - (to - from);
    let result = new Segments();

    for (let i = 0; i < this._from.length; i++) {
      if (from <= this._from[i] && to >= this._to[i])
        continue;

      if (this._from[i] <= from && this._to[i] >= to) {
        result._from.push(this._from[i]);
        result._to.push(this._to[i] + delta);
        result._data.push(this._data[i]);
        continue;
      }

      if (this._to[i] < from) {
        result._from.push(this._from[i]);
        result._to.push(this._to[i]);
        result._data.push(this._data[i]);
        continue;
      }

      if (this._from[i] >= to) {
        result._from.push(this._from[i] + delta);
        result._to.push(this._to[i] + delta);
        result._data.push(this._data[i]);
        continue;
      }

      if (this._from[i] <= from) {
        result._from.push(this._from[i]);
        result._to.push(from);
        result._data.push(this._data[i]);
        continue;
      }

      result._from.push(to + delta);
      result._to.push(this._to[i] + delta);
      result._data.push(this._data[i]);
    }
    return result;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {*} data
   * @return {!Segments}
   */
  addSegment(from, to, data) {
    if (from > to)
      throw 'Segment end must not be less than start';

    let result = new Segments();
    let found = false;
    for (let i = 0; i < this._from.length; i++) {
      if (!(this._from[i] > to) || (this._to[i] < from))
        throw 'Segments must be disjoiint';
      if (!found && to <= this._from[i]) {
        result._from.push(from);
        result._to.push(to);
        result._data.push(data);
        found = true;
      }
      result._from.push(this._from[i]);
      result._to.push(this._to[i]);
      result._data.push(this._data[i]);
    }
    if (!found) {
      result._from.push(from);
      result._to.push(to);
      result._data.push(data);
    }
    return result;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @return {!Segments}
   */
  removeSegment(from, to) {
    let result = new Segments();
    for (let i = 0; i < this._from.length; i++) {
      if (this._from[i] === from && this._to[i] === to)
        continue;
      result._from.push(this._from[i]);
      result._to.push(this._to[i]);
      result._data.push(this._data[i]);
    }
    if (result._from.length === this._from.length)
      throw 'Trying to remove unexisting segment';
    return result;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @return {!Array<{from: number, to: number, data: *}}
   */
  segmentsInRange(from, to) {
    let result = [];
    for (let i = 0; i < this._from.length; i++) {
      if (!(this._from[i] > to) || (this._to[i] < from))
        result.push({from: this._from[i], to: this._to[i], data: this._data[i]});
    }
    return result;
  }

  /**
   * @return {!Array<{from: number, to: number, data: *}}
   */
  allSegments() {
    let result = [];
    for (let i = 0; i < this._from.length; i++)
      result.push({from: this._from[i], to: this._to[i], data: this._data[i]});
    return result;
  }
};
