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
 * @typedef {Monoid<string>} StringMonoid
 * StringMonoid has string elements, the empty string as an identity element
 * and string concatenation as a composition operator.
 */


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
   * @param {V} e
   * @param {K} k
   * @return {boolean}
   */
  valueGreaterThanKey(e, k) {
  }

  /**
   * Returns whether the passed monoid element is greater or equal
   * than the lookup key.
   * @param {V} e
   * @param {K} k
   * @return {boolean}
   */
  valueGreaterOrEqualThanKey(e, k) {
  }
};


/**
 * State space defines some opaque "state" type which support equality check.
 * It also have to be serializable to a passable JavaScript value and reconstructed
 * from it.
 *
 * @template S - type of the state values.
 */
class StateSpace {
  /**
   * @return {S}
   */
  emptyState() {
  }

  /**
   * @param {S} s1
   * @param {S} s2
   * @return {boolean}
   */
  statesAreEqual(s1, s2) {
  }

  /**
   * @param {S} s
   * @return {*}
   */
  serializeState(s) {
  }

  /**
   * @param {*} data
   * @return {S}
   */
  deserializeState(data) {
  }
};


/**
 * String morphism |M| maps StringMonoid to an ordered monoid |V|, preserving the structure.
 *   - Maps identity element to an identity element: M('') = V.identityValue().
 *   - Preserves the operator: M(s1 + s2) = V.combineValues(M(s1), M(s2)).
 *
 * We also allow to use an optional running state space to relax the locality requirement
 * and support linear processing morphisms.
 *
 * @template V - type of monoid values.
 * @template K - type of monoid lookup key.
 * @template S - type of the running state.
 * @interface
 */
class StringMorphism {
  /**
   * @return {OrderedMonoid<V, K>}
   */
  monoid() {
  }

  /**
   * @return {?StateSpace<S>}
   */
  stateSpace() {
  }

  /**
   * @param {string} s
   * @param {?S} state
   * @return {{value: V, state: ?S}}
   */
  mapString(s, state) {
  }
};
