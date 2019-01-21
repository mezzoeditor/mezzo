import {TreeFactory as RealTreeFactory, Tree as RealTree, TreeIterator as RealTreeIterator} from './utils/OrderedMonoidTree.js';
import {TextIterator as RealTextIterator} from './text/TextIterator.js';
import {Text as RealText} from './text/Text.js';
export {};

declare global {
  module Mezzo {
    /**
     * Anchor represents a position between two offsets which is aligned
     * either to the left (stored as integer |offset|) or to the right (stored
     * as a number |offset + 0.5|).
     *
     * Left-aligned anchor at |x| stays immediately before offset |x|
     * and immediately after code unit at index |x - 1|.
     * When inserting elements at offset |x|, the anchor does not move.
     *
     * Right-aligned anchor at |x + 0.5| stays immediately after offset |x|
     * and immediately before character at index |x|.
     * When inserting elements at offset |x|, the anchor moves to the right.
     *
     * See README.md for some examples.
     */
    export type Anchor = number;
    /**
     * Align is either 0 or 0.5, it represents the alignment part of an
     * Anchor. It holds that |Anchor| === |Offset| + |Align|.
     *
     * It is easy to convert between offsets, anchors and aligns:
     *
     * toAnchor = (offset, align) => offset + align;
     * fromAnchor = anchor => ({offset: Math.floor(anchor), align: anchor - Math.floor(anchor)});
     */
    export type Align = number;

    /**
     * The range between to anchors. Usually, including |from| and not including |to|.
     */
    export type Range = {from: Mezzo.Anchor, to: Mezzo.Anchor};

    /**
     * Ordered monoid specifies some kind of data which can be computed and updated
     * efficiently using a tree-based data structure.
     *
     * Monoid is a semigroup with an identity element, meaning:
     *   - It has elements of the type |T| and operation |*|.
     *   - It has an identity element |e|, for which (a * e) = (e * a) = (a) for any |a|.
     *   - Operation is associative, (a * b) * c = a * (b * c) for any |a|, |b| and |c|.
     */
    export interface Monoid<V> {
      /**
       * Returns the identity element.
       */
      identityValue():V;

      /**
       * Performs a monoid operation over the two elements.
       */
      combineValues(a:V, b:V):V;
    }

    /**
     * Ordered monoid must define an operator |<=|, such that:
     *   - a <= b implies (x * a) <= (x * b) for any |x|.
     *   - a <= b implies (a * x) <= (b * x) for any |x|.
     * We actually use another type K for lookup to bring less constrains to the properties
     * of a monoid.
     */
    export interface OrderedMonoid<V,K> extends Mezzo.Monoid<V> {
      /**
       * Returns whether the passed monoid element is strictly greater
       * than the lookup key.
       */
      valueGreaterThanKey(value:V, key:K):boolean;

      /**
       * Returns whether the passed monoid element is greater or equal
       * than the lookup key.
       */
      valueGreaterOrEqualThanKey(value:V, key:K):boolean;
    }

    /**
     * The zero-based offset of a code unit inside a string.
     */
    export type Offset = number;

    /**
     * A 2-dimensional position in a text. Both dimensions zero-based.
     * Note that column measures code points, not code units.
     */
    export type Position = {line: number, column: number};

    /**
     * A key used to lookup in a tree - either by |offset|, or by |x| and |y|.
     */
    export type TextLookupKey = {
      offset?: number,
      x?: number,
      y?: number
    };

    /**
     * Represents metrics of a text chunk. This can be used
     * not only for text, but for any entities interleaving with text.
     *   - |length| is a total number of UTF-16 code units.
     *   - |lineBreaks| is a total number of line break characters (\n).
     *   - |firstWidth| is a number of code points in the first line.
     *   - |lastWidth| is a number of code points in the last line.
     *   - |longestWidth| is a number of code points in the longest line.
     * Note that we only support fixed height equal to one.
     */
    export type TextMetrics = {
      length: number,
      lineBreaks?: number,
      firstWidth: number,
      lastWidth: number,
      longestWidth: number
    };

    /**
     * State traits defines some opaque "state" type which supports equality check.
     * It also have to be serializable to a passable JavaScript value and reconstructed
     * from it.
     *
     * template S - type of the state values.
     */
    export interface StateTraits<S> {
      emptyState():S;
      statesAreEqual(s1:S, s2:S):boolean;
      serializeState(s:S):any;
      deserializeState(data:any):S;
    }

    /**
     * StringMonoid has string elements, the empty string as an identity element
     * and string concatenation as a composition operator.
     *
     * Text morphism |M| maps StringMonoid to an ordered monoid |V|, preserving the structure.
     *   - Maps identity element to an identity element: M('') = V.identityValue().
     *   - Preserves the operator: M(s1 + s2) = V.combineValues(M(s1), M(s2)).
     *
     * We also allow to use an optional running state to relax the locality requirement
     * and support linear processing morphisms.
     *
     * Templates:
     * - X - type of input (convertible to string).
     * - V - type of output monoid values.
     * - K - type of output monoid lookup key.
     * - S - type of the running state.
     */
    export interface TextMorphism<X,V,K,S> {
      monoid():Mezzo.OrderedMonoid<V,K>;

      stateTraits():(Mezzo.StateTraits<S>|null);

      /**
       * Maps a value (convertible to string) and previous state
       * to a monoid value given and a new state.
       */
      mapValue(string:X, state:(S|null)):{value:V, state: (S|null)};

      /**
       * Provides some kind of value for a string of particular length,
       * which can be used as a placeholder until the real value is calculated.
       */
      unmappedValue(length:number):V;
    }

    /**
     * Text morphism with string input.
     */
    export type StringMorphism<V,K,S> = TextMorphism<string, V, K, S>;

    export class TreeFactory<D,V,K> extends RealTreeFactory<D,V,K> {}
    export class Tree<D,K,V> extends RealTree<D,K,V> {}
    export class TreeIterator<D,V,K> extends RealTreeIterator<D,V,K> {}
    export class TextIterator extends RealTextIterator {}
    export class Text extends RealText {}

    /**
     * Text morphism with text iterator input for efficiency.
     */
    export type TextIteratorMorphism<V,K,S> = TextMorphism<TextIterator, V, K, S>;

    export type Replacement = {
      before: Mezzo.Text,
      offset: number,
      inserted: Mezzo.Text,
      removed: Mezzo.Text,
      after: Mezzo.Text,
    };

    export type SelectionRange = {
      anchor: number,
      focus: number,
      upDownX?: number
    };

    export type DocumentChangedEvent = {
      replacements: Array<Replacement>,
      oldSelection?: Array<SelectionRange>,
      selectionChanged: boolean,
    };
  }
}
