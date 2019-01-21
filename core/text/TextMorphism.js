/**
 * Constructs a text iterator morphism given a string morphism.
 * @template V, K, S
 * @implements {Mezzo.TextIteratorMorphism<V, K, S>}
 */
export class StringToTextIteratorMorphismAdaptor {
  /**
   * @param {Mezzo.StringMorphism<V, K, S>} stringMorphism
   */
  constructor(stringMorphism) {
    this._stringMorphism = stringMorphism;
  }

  /**
   * @override
   * @return {Mezzo.OrderedMonoid<V, K>}
   */
  monoid() {
    return this._stringMorphism.monoid();
  }

  /**
   * @override
   * @return {?Mezzo.StateTraits<S>}
   */
  stateTraits() {
    return this._stringMorphism.stateTraits();
  }

  /**
   * @override
   * @param {Mezzo.TextIterator} iterator
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
