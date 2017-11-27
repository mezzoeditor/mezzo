export class Line {
  /**
   * @param {string} s
   */
  constructor(s) {
    this._s = s;
  }

  /**
   * @return {!Line}
   */
  static empty() {
    return Line._empty;
  }

  /**
   * @return {string}
   */
  lineContent() {
    return this._s;
  }

  /**
   * @return {number}
   */
  length() {
    return this._s.length;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {string} s
   * @return {!Line}
   */
  replace(from, to, s) {
    return new Line(this._s.substring(0, from) + s + this._s.substring(to));
  }

  /**
   * @param {number} pos
   * @return {{left: !Line, right: !Line}}
   */
  split(pos) {
    let left = new Line(this._s.substring(0, pos));
    let right = new Line(this._s.substring(pos));
    return {left, right};
  }

  /**
   * @param {!Line} line
   * @return {!Line}
   */
  merge(line) {
    return new Line(this._s + line._s);
  }
}

Line._empty = new Line("");
