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
  }
}
