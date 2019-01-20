/**
 * @typedef {number} Anchor
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
 *
 *
 * @typedef {number} Align
 * Align is either 0 or 0.5, it represents the alignment part of an
 * Anchor. It holds that |Anchor| === |Offset| + |Align|.
 *
 * It is easy to convert between offsets, anchors and aligns:
 *
 * toAnchor = (offset, align) => offset + align;
 * fromAnchor = anchor => ({offset: Math.floor(anchor), align: anchor - Math.floor(anchor)});
 *
 *
 * @typedef {{from: Anchor, to: Anchor}} Range
 * The range between to anchors. Usually, including |from| and not including |to|.
 */
