export class Operation {
  /**
   * @param {!Operaion.Type} type
   */
  constructor(type) {
    this.type = type;
  }

  /**
   * @param {boolean} moveOnly
   * @return {!Operation}
   */
  static cursors(moveOnly) {
    let op = new Operation(Operation.Type.Cursors);
    op.moveOnly = moveOnly;
    return op;
  }
}

/** @enum {string} */
Operation.Type = {
  Cursors: 'Cursors',
  Replace: 'Replace',
};

