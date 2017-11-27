export class Line {
  /**
   * @param {string} s
   */
  constructor(s) {
    this._s = s;
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
   */
  replace(from, to, s) {
    this._s = this._s.substring(0, from) + s + this._s.substring(to);
  }

  /**
   * @param {number} pos
   */
  split(pos) {
    let line = new Line(this._s.substring(pos));
    this._s = this._s.substring(0, pos);
    return line;
  }

  /**
   * @param {!Line} line
   * @return {!Line}
   */
  merge(line) {
    this._s = this._s + line._s;
    return this;
  }
}
