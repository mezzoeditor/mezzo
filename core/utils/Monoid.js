/**
 * Ordered monoid specifies some kind of data which can be computed and updated
 * efficiently using a tree-based data structure.
 *
 * Monoid is a semigroup with an identity element, meaning:
 *   - It has elements of the type |T| and operation |*|.
 *   - It has an identity element |e|, for which (a * e) = (e * a) = (a) for any |a|.
 *   - Operation is associative, (a * b) * c = a * (b * c) for any |a|, |b| and |c|.
 *
 * @interface
 * @template V - a type of monoid elements.
 */
class Monoid {
  /**
   * Returns the identity element.
   * @return {V}
   */
  identityValue() {
  }

  /**
   * Performs a monoid operation over the two elements.
   * @param {V} a
   * @param {V} b
   * @return {V}
   */
  combineValues(a, b) {
  }
};


/**
 * Ordered monoid must define an operator |<=|, such that:
 *   - a <= b implies (x * a) <= (x * b) for any |x|.
 *   - a <= b implies (a * x) <= (b * x) for any |x|.
 * We actually use another type K for lookup to bring less constrains to the properties
 * of a monoid.
 *
 * @interface
 * @template V - a type of monoid elements.
 * @template K - a type of lookup key.
 * @extends Monoid<V>
 */
class OrderedMonoid {
  /**
   * Returns whether the passed monoid element is strictly greater
   * than the lookup key.
   * @param {V} value
   * @param {K} key
   * @return {boolean}
   */
  valueGreaterThanKey(value, key) {
  }

  /**
   * Returns whether the passed monoid element is greater or equal
   * than the lookup key.
   * @param {V} value
   * @param {K} key
   * @return {boolean}
   */
  valueGreaterOrEqualThanKey(value, key) {
  }
};

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
