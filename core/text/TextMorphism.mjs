/**
 * @typedef {Monoid<string>} StringMonoid
 * StringMonoid has string elements, the empty string as an identity element
 * and string concatenation as a composition operator.
 */

/**
 * Text morphism |M| maps StringMonoid to an ordered monoid |V|, preserving the structure.
 *   - Maps identity element to an identity element: M('') = V.identityValue().
 *   - Preserves the operator: M(s1 + s2) = V.combineValues(M(s1), M(s2)).
 *
 * We also allow to use an optional running state to relax the locality requirement
 * and support linear processing morphisms.
 *
 * @template X - type of input (convertible to string).
 * @template V - type of output monoid values.
 * @template K - type of output monoid lookup key.
 * @template S - type of the running state.
 * @interface
 */
class TextMorphism {
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
   * Maps a value (convertible to string) and previous state
   * to a monoid value given and a new state.
   * @param {X} string
   * @param {?S} state
   * @return {{value: V, state: ?S}}
   */
  mapValue(string, state) {
  }

  /**
   * Provides some kind of value for a string of particular length,
   * which can be used as a placeholder until the real value is calculated.
   * @param {number} length
   * @return {V}
   */
  unmappedValue(length) {
  }
};


/**
 * @template V, K, S
 * @typedef {TextMorphism<string, V, K, S>} StringMorphism
 * Text morphism with string input.
 *
 *
 * @template V, K, S
 * @typedef {TextMorphism<TextIterator, V, K, S>} TextIteratorMorphism
 * Text morphism with text iterator input for efficiency.
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
 * Constructs a text iterator morphism given a string morphism.
 * @template V, K, S
 * @implements {TextIteratorMorphism<V, K, S>}
 */
export class StringToTextIteratorMorphismAdaptor {
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

  /**
   * @override
   * @param {number} length
   * @return {V}
   */
  unmappedValue(length) {
    return this._stringMorphism.unmappedValue(length);
  }
};
