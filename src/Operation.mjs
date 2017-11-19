export class Operation {
  constructor() {
  }

  /**
   * @param {boolean} moveOnly
   * @return {!Operation}
   */
  static cursors(moveOnly) {
    let op = new Operation();
    op.cursorsMoved = true;
    if (!moveOnly)
      op.cursorsChanged = true;
    return op;
  }
}
