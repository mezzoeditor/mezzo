/**
 * @implements OrderedMonoid<number, number>
 */
export class NumberMonoid {
  /**
   * @override
   * @return {number}
   */
  identityValue() {
    return 0;
  }

  /**
   * @param {number} a
   * @param {number} b
   * @return {number}
   */
  combineValues(a, b) {
    return a + b;
  }

  /**
   * @override
   * @param {number} value
   * @param {number} key
   * @return {boolean}
   */
  valueGreaterThanKey(value, key) {
    return value > key;
  }

  /**
   * @override
   * @param {number} value
   * @param {number} key
   * @return {boolean}
   */
  valueGreaterOrEqualThanKey(value, key) {
    return value >= key;
  }
};
