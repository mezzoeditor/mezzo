export class Operation {
  constructor() {
  }

  /**
   * @param {boolean} structure
   * @return {!Operation}
   */
  static selection(structure) {
    let op = new Operation();
    op.selection = true;
    if (structure)
      op.selectionStructure = true;
    return op;
  }
}
