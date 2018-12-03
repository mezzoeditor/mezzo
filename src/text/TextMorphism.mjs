/**
 * Morphism |M| maps monoid |X| to an ordered monoid |V|, preserving the structure.
 *   - Maps identity element to an identity element: M(X.identityValue()) = V.identityValue().
 *   - Preserves the operator: M(X.combineValues(x1, x2)) = V.combineValues(M(x1), M(x2)).
 *
 * We also allow to use an optional running state to relax the locality requirement
 * and support linear processing morphisms.
 *
 * @template X - type of input monoid values.
 * @template V - type of output monoid values.
 * @template K - type of output monoid lookup key.
 * @template S - type of the running state.
 * @interface
 */
class Morphism {
  /**
   * @return {OrderedMonoid<V, K>}
   */
  monoid() {
  }

  /**
   * @return {?StateTraits<S>}
   */
  stateTraits() {
  }

  /**
   * @param {X} value
   * @param {?S} state
   * @return {{value: V, state: ?S}}
   */
  mapValue(value, state) {
  }
};


/**
 * @typedef {Monoid<string>} StringMonoid
 * StringMonoid has string elements, the empty string as an identity element
 * and string concatenation as a composition operator.
 *
 *
 * @template V, K, S
 * @typedef {Morhpism<string, V, K, S>} StringMorphism
 * Morphism with StringMonoid as an input.
 *
 *
 * @template V, K, S
 * @typedef {Morhpism<TextIterator, V, K, S>} TextMorphism
 * Morphism with StringMonoid as an input. Strings a represented as text iterators
 * for efficiency.
 */



/**
 * State traits defines some opaque "state" type which supports equality check.
 * It also have to be serializable to a passable JavaScript value and reconstructed
 * from it.
 *
 * @template S - type of the state values.
 * @interface
 */
class StateTraits {
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
 * Constructs a text morphism given a string morphism.
 * @template V, K, S
 * @implements {TextMorphism<V, K, S>}
 */
export class StringToTextMorphismAdaptor {
  /**
   * @param {StringMorphism<V, K, S>}
   */
  constructor(stringMorphism) {
    this._stringMorphism = stringMorphism;
  }

  /**
   * @override
   * @return {OrderedMonoid<V, K>}
   */
  monoid() {
    return this._stringMorphism.monoid();
  }

  /**
   * @override
   * @return {?StateTraits<S>}
   */
  stateTraits() {
    return this._stringMorphism.stateTraits();
  }

  /**
   * @override
   * @param {TextIterator} iterator
   * @param {?S} state
   * @return {{value: V, state: ?S}}
   */
  mapValue(iterator, state) {
    return this._stringMorphism.mapValue(iterator.read(iterator.length()), state);
  }
};
