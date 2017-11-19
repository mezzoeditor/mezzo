export class Cursor {
  /**
   * @param {!TextPosition} position
   */
  constructor(position) {
    this.position = position;
    this.upDownColumn = -1;
  }
}
