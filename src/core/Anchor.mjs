/**
 * @typedef {{
 *   offset: number,
 *   end: number
 * }} Anchor
 */

/**
 * Start anchor at |x| stays immediately after character at offset |x - 1|. When
 * inserting text at position |x|, the anchor does not move.
 *
 * @param {number} offset
 * @return {!Anchor}
 */
export let Start = offset => ({offset, end: 0});
export let Left = offset => ({offset, end: 0});

/**
 * End anchor at |x| stays immediately before character at offset |x|. When
 * inserting text at position |x|, the anchor moves to the right.
 *
 * @param {number} offset
 * @return {!Anchor}
 */
export let End = offset => ({offset, end: 1});
export let Right = offset => ({offset, end: 1});

/**
 * Before anchor at |x| stays immediately before character at offset |x|. When
 * inserting text at position |x|, the anchor moves to the right.
 *
 * @param {number} offset
 * @return {!Anchor}
 */
export let Before = offset => ({offset: offset, end: 1});

/**
 * After anchor at |x| stays immediately after character at offset |x|. When
 * inserting text at position |x + 1|, the anchor does not move.
 *
 * @param {number} offset
 * @return {!Anchor}
 */
export let After = offset => ({offset: offset + 1, end: 0});

/**
 * @param {!Anchor} a
 * @param {!Anchor} b
 * @return {boolean}
 */
export let CompareAnchors = (a, b) => {
  return (a.offset - b.offset) || (a.end - b.end);
};

/**
 * @param {!Anchor} a
 * @param {!Anchor} b
 * @return {!Anchor}
 */
export let MaxAnchor = (a, b) => {
  return CompareAnchors(a, b) > 0 ? a : b;
};

/**
 * @param {!Anchor} anchor
 * @return {!Anchor}
 */
export let NextAnchor = anchor => {
  return anchor.end ? {offset: anchor.offset + 1, end: 0} : {offset: anchor.offset, end: 1};
};

/**
 * @param {!Anchor} anchor
 * @return {number}
 */
export let Offset = anchor => anchor.offset;

/**
 * @param {!{from: !Anchor, to: !Anchor}} anchor
 * @return {!Range}
 */
export let Range = anchorRange => ({from: anchorRange.from.offset, to: anchorRange.to.offset});
