export class Selection {
  /**
   * @param {!TextPosition} position
   */
  constructor(position) {
    this.position = position;
    this.upDownColumn = -1;
  }
}
