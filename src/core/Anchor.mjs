/**
 * @typedef {number} Anchor
 *
 * Anchor represents a position between two characters which is aligned
 * either to the left (stored as integer offset) or to the right (stored
 * as any non-integer between |offset| and |offset + 1|).
 */

/**
 * Start anchor at |x| stays immediately after character at offset |x - 1|. When
 * inserting text at position |x|, the anchor does not move.
 *
 * @param {number} offset
 * @return {!Anchor}
 */
export let Start = offset => offset;
export let Left = offset => offset;

/**
 * End anchor at |x| stays immediately before character at offset |x|. When
 * inserting text at position |x|, the anchor moves to the right.
 *
 * @param {number} offset
 * @return {!Anchor}
 */
export let End = offset => offset + 0.5;
export let Right = offset => offset + 0.5;

/**
 * Before anchor at |x| stays immediately before character at offset |x|. When
 * inserting text at position |x|, the anchor moves to the right.
 *
 * @param {number} offset
 * @return {!Anchor}
 */
export let Before = offset => offset + 0.5;

/**
 * After anchor at |x| stays immediately after character at offset |x|. When
 * inserting text at position |x + 1|, the anchor does not move.
 *
 * @param {number} offset
 * @return {!Anchor}
 */
export let After = offset => offset + 1;

/**
 * @param {!Anchor} a
 * @param {!Anchor} b
 * @return {boolean}
 */
export let CompareAnchors = (a, b) => a - b;

/**
 * @param {!Anchor} a
 * @param {!Anchor} b
 * @return {!Anchor}
 */
export let MaxAnchor = (a, b) => Math.max(a, b);

/**
 * @param {!Anchor} anchor
 * @return {!Anchor}
 */
export let NextAnchor = anchor => {
  return anchor === Math.floor(anchor) ? anchor + 0.5 : Math.floor(anchor + 1);
};

/**
 * @param {!Anchor} anchor
 * @return {number}
 */
export let Offset = anchor => Math.floor(anchor);

/**
 * @param {!{from: !Anchor, to: !Anchor}} anchorRange
 * @return {!Range}
 */
export let Range = anchorRange => ({from: Math.floor(anchorRange.from), to: Math.floor(anchorRange.to)});
