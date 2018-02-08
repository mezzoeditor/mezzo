import { Random } from "./Random.mjs";
let random = Random(25);

/**
 * @typdef {{
 *   from: number,
 *   to: number,
 *   style: string,
 * }} Decoration
 */

/**
 * @typedef {{
 *   style: string,
 *   from: number,
 *   to: number,
 *   h: number,
 *   size: number,
 *   add: number|undefined,
 *   left: !Segment|undefined,
 *   right: !Segment|undefined,
 * }} TreeNode;
 */

/**
 * @param {!TreeNode} node
 * @return {!TreeNode}
 */
function normalize(node) {
  if (!node.add)
    return node;
  node.from += node.add;
  node.to += node.add;
  if (node.left)
    node.left.add = (node.left.add || 0) + node.add;
  if (node.right)
    node.right.add = (node.right.add || 0) + node.add;
  node.add = undefined;
  return node;
};

/**
 * @param {!TreeNode} node
 * @param {!TreeNode|undefined} left
 * @param {!TreeNode|undefined} right
 * @return {!TreeNode}
 */
function setChildren(node, left, right) {
  if (node.add)
    throw 'Inconsistent';
  node.size = 1;
  node.left = left;
  if (left)
    node.size += left.size;
  node.right = right;
  if (right)
    node.size += right.size;
  return node;
};

/**
 * @param {!TreeNode|undefined} left
 * @param {!TreeNode|undefined} right
 * @return {!TreeNode|undefined}
 */
function merge(left, right) {
  if (!left)
    return right;
  if (!right)
    return left;
  left = normalize(left);
  right = normalize(right);
  if (left.h > right.h)
    return setChildren(left, left.left, merge(left.right, right));
  else
    return setChildren(right, merge(left, right.left), right.right);
};

const kFrom = 0;
const kTo = 1;
const kBetween = 2;

/**
 * @param {!TreeNode|undefined} node
 * @param {number} offset
 * @param {number} splitBy
 * @return {{left: !TreeNode|undefined, right: !TreeNode|undefined}}
 */
function split(node, offset, splitBy) {
  if (!node)
    return {};
  node = normalize(node);
  let nodeToRight = splitBy === kFrom ? node.from >= offset :
      (splitBy === kTo ? node.to > offset : (node.from > offset || node.to > offset));
  if (nodeToRight) {
    let tmp = split(node.left, offset, splitBy);
    return {left: tmp.left, right: setChildren(node, tmp.right, node.right)};
  } else {
    let tmp = split(node.right, offset, splitBy);
    return {left: setChildren(node, node.left, tmp.left), right: tmp.right};
  }
};

/**
 * @param {!TreeNode|undefined} node
 * @param {function(!Decoration)} visitor
 */
function visit(node, visitor) {
  if (!node)
    return;

  node = normalize(node);
  let nodes = [];
  while (true) {
    while (node.left) {
      nodes.push(node);
      node = normalize(node.left);
    }
    visitor(node);
    while (!node.right) {
      node = nodes.pop();
      if (!node)
        return;
      visitor(node);
    }
    node = normalize(node.right);
  }
};

/**
 * @param {!TreeNode|undefined} node
 * @param {!Map<string, !OffsetRange>} result
 */
function visitMap(node, result) {
  if (!node)
    return;
  node = normalize(node);
  visitMap(node.left, result);
  let bucket = result.get(node.style);
  if (!bucket) {
    bucket = [];
    result.set(node.style, bucket);
  }
  bucket.push({from: node.from, to: node.to});
  visitMap(node.right, result);
};

/**
 * @param {!TreeNode} node
 * @return {!TreeNode}
 */
function first(node) {
  while (normalize(node).left)
    node = node.left;
  return node;
};

/**
 * @param {!TreeNode} node
 * @return {!TreeNode}
 */
function last(node) {
  while (normalize(node).right)
    node = node.right;
  return node;
};

/**
 * @param {!TreeNode|undefined} node
 * @param {number} from
 * @return {!TreeNode|undefined}
 */
function find(node, offset) {
  if (!node)
    return;
  if (node.from >= offset)
    return find(node.left, offset) || node;
  return find(node.right, offset);
};

export class Decorator {
  constructor() {
    this._root = undefined;
    this._scrollbarStyle = null;
  }

  /**
   * Decorations which should be visible on the scrollbar must have their own decorator.
   * The |scrollbarStyle| is used for these decorations to decorate the scrollbar.
   * Note that |style| passed with each decoration will still be used to decorate viewport.
   * @param {?string} scrollbarStyle
   */
  setScrollbarStyle(scrollbarStyle) {
    this._scrollbarStyle = scrollbarStyle;
  }

  /**
   * @return {?string}
   */
  scrollbarStyle() {
    return this._scrollbarStyle;
  }

  /**
   * Adds a single decoration. Note that decorations must be:
   *   - not degenerate (|from| <= |to|);
   *   - disjoiint (no decorations have common interior point);
   *   - different (no collapsed decorations are at the same point).
   * @param {number} from
   * @param {number} to
   * @param {string} style
   */
  add(from, to, style) {
    if (from > to)
      throw 'Reversed decorations are not allowed';
    let tmp = split(this._root, to, kFrom);
    if (tmp.left && last(tmp.left).to > from)
      throw 'Decorations must be disjoint';
    if (from === to && tmp.right && first(tmp.right).to === to)
      throw 'Two collapsed decorations at the same position are not allowed';
    let node = {style, from, to, h: random(), size: 1};
    this._root = merge(merge(tmp.left, node), tmp.right);
  }

  /**
   * Removes a single decoration. Typically throws if the decoration
   * is not present, but that can be disabled by |relaxed|.
   * @param {number} from
   * @param {number} to
   * @param {string} style
   * @param {boolean=} relaxed
   */
  remove(from, to, style, relaxed) {
    let collapsed = from === to;
    let tmp = split(this._root, from, collapsed ? kFrom : kBetween);
    let tmp2 = split(tmp.right, to, collapsed ? kBetween : kFrom);
    let removed = tmp2.left;
    if (!relaxed && (!removed || removed.from !== from || removed.to !== to))
      throw 'Decoration is not present';
    if (removed && (removed.left || removed.right))
      throw 'Inconsistent';
    this._root = merge(tmp.left, tmp2.right);
  }

  /**
   * Adjusts decoration according to the replacement.
   * The first of the following rules is applied to each decoration:
   *   - decorations covered by replaced range are removed;
   *   - decorations covering replaced range are resized by |inserted - to + from|;
   *   - decorations covering |from| are cropped to |from|;
   *   - decorations covering |to| are extended to |from + inserted];
   *   - decorations starting after |to| are moved by |inserted - to + from|.
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   */
  onReplace(from, to, inserted) {
    let delta = inserted - (to - from);
    let tmp = split(this._root, from - 1, kTo);
    let left = tmp.left;
    tmp = split(tmp.right, to + 1, kFrom);
    let right = tmp.right;
    tmp = split(tmp.left, from + 1, kFrom);
    let crossLeft = tmp.left;
    tmp = split(tmp.right, to - 1, kTo);
    let crossRight = tmp.right;
    // Decorations in tmp.left are strictly inside [from, to] and will be removed.

    let processed1 = this._process(crossLeft, from, to, inserted);
    let processed2 = this._process(crossRight, from, to, inserted);
    if (right)
      right.add = (right.add || 0) + delta;
    this._root = merge(left, merge(merge(processed1, processed2), right));
  }

  /**
   * Returns the total number of decorations.
   * @return {number}
   */
  countAll() {
    return this._root ? this._root.size : 0;
  }

  /**
   * Returns the number of decorations which start at [from, to].
   * @param {number} from
   * @param {number} to
   * @return {number}
   */
  countStarting(from, to) {
    return this._starting(from, to, node => node ? node.size : 0);
  }

  /**
   * Returns the number of decorations which end at [from, to].
   * @param {number} from
   * @param {number} to
   * @return {number}
   */
  countEnding(from, to) {
    return this._ending(from, to, node => node ? node.size : 0);
  }

  /**
   * Returns the number of decorations which intersect or touch [from, to].
   * @param {number} from
   * @param {number} to
   * @return {number}
   */
  countTouching(from, to) {
    return this._touching(from, to, node => node ? node.size : 0);
  }

  /**
   * Lists all decorations.
   * @return {!Array<!Decoration>}
   */
  listAll() {
    let result = [];
    visit(this._root, result.push.bind(result));
    return result;
  }

  /**
   * Lists all decorations which start at [from, to].
   * @param {number} from
   * @param {number} to
   * @return {!Array<!Decoration>}
   */
  listStarting(from, to) {
    let result = [];
    this._starting(from, to, node => visit(node, result.push.bind(result)));
    return result;
  }

  /**
   * Lists all decorations which end at [from, to].
   * @param {number} from
   * @param {number} to
   * @return {!Array<!Decoration>}
   */
  listEnding(from, to) {
    let result = [];
    this._ending(from, to, node => visit(node, result.push.bind(result)));
    return result;
  }

  /**
   * Lists all decorations which intersect or touch [from, to].
   * @param {number} from
   * @param {number} to
   * @return {!Array<!Decoration>}
   */
  listTouching(from, to) {
    let result = [];
    this._touching(from, to, node => visit(node, result.push.bind(result)));
    return result;
  }

  /**
   * Removes all decorations.
   */
  clearAll() {
    this._root = undefined;
  }

  /**
   * Removes all decorations which start at [from, to].
   * @param {number} from
   * @param {number} to
   */
  clearStarting(from, to) {
    this._starting(from, to, null);
  }

  /**
   * Removes all decorations which end at [from, to].
   * @param {number} from
   * @param {number} to
   */
  clearEnding(from, to) {
    this._ending(from, to, null);
  }

  /**
   * Removes all decorations which intersect or touch [from, to].
   * @param {number} from
   * @param {number} to
   */
  clearTouching(from, to) {
    this._touching(from, to, null);
  }

  /**
   * Visits all decorations.
   * @param {function(!Decoration)} visitor
   */
  visitAll(visitor) {
    visit(this._root, visitor);
  }

  /**
   * Visits all decorations which start at [from, to].
   * @param {number} from
   * @param {number} to
   * @param {function(!Decoration)} visitor
   */
  visitStarting(from, to, visitor) {
    this._starting(from, to, node => visit(node, visitor));
  }

  /**
   * Visits all decorations which end at [from, to].
   * @param {number} from
   * @param {number} to
   * @param {function(!Decoration)} visitor
   */
  visitEnding(from, to, visitor) {
    this._ending(from, to, node => visit(node, visitor));
  }

  /**
   * Visits all decorations which intersect or touch [from, to].
   * @param {number} from
   * @param {number} to
   * @param {function(!Decoration)} visitor
   */
  visitTouching(from, to, visitor) {
    this._touching(from, to, node => visit(node, visitor));
  }

  /**
   * Returns the first (sorted by position) decoration.
   * @return {?Decoration}
   */
  firstAll() {
    return this._root ? first(this._root) : null;
  }

  /**
   * Returns the first (sorted by position) decoration which starts at [from, to].
   * @param {number} from
   * @param {number} to
   * @return {?Decoration}
   */
  firstStarting(from, to) {
    return this._starting(from, to, node => node ? first(node) : null);
  }

  /**
   * Returns the first (sorted by position) decoration which ends at [from, to].
   * @param {number} from
   * @param {number} to
   * @return {?Decoration}
   */
  firstEnding(from, to) {
    return this._ending(from, to, node => node ? first(node) : null);
  }

  /**
   * Returns the first (sorted by position) decoration which intersects or touches [from, to].
   * @param {number} from
   * @param {number} to
   * @return {?Decoration}
   */
  firstTouching(from, to) {
    return this._touching(from, to, node => node ? first(node) : null);
  }

  /**
   * Returns the last (sorted by position) decoration.
   * @return {?Decoration}
   */
  lastAll() {
    return this._root ? last(this._root) : null;
  }

  /**
   * Returns the last (sorted by position) decoration which starts at [from, to].
   * @param {number} from
   * @param {number} to
   * @return {?Decoration}
   */
  lastStarting(from, to) {
    return this._starting(from, to, node => node ? last(node) : null);
  }

  /**
   * Returns the last (sorted by position) decoration which ends at [from, to].
   * @param {number} from
   * @param {number} to
   * @return {?Decoration}
   */
  lastEnding(from, to) {
    return this._ending(from, to, node => node ? last(node) : null);
  }

  /**
   * Returns the last (sorted by position) decoration which intersects or touches [from, to].
   * @param {number} from
   * @param {number} to
   * @return {?Decoration}
   */
  lastTouching(from, to) {
    return this._touching(from, to, node => node ? last(node) : null);
  }

  /**
   * Visits all decorations, skipping some.
   * The returned value of |visitor| is treated as the minimum |from| of the
   * next decoration to visit. This means that the range
   * from |decoration.to| to |returnValue| is effectively skipped.
   *
   * Passing the following function will not skip anything
   * (based on decorations being disjoint):
   *   let visitor = decoration => decoration.to;
   * @param {function(decoration: !Decoration):number} visitor
   */
  sparseVisitAll(visitor) {
    if (!this._root)
      return;
    let from = first(this._root).from;
    while (true) {
      let node = find(this._root, from);
      if (!node)
        return;
      let next = visitor(node);
      if (next < node.from)
        throw 'Return value of visitor must not be less than decoration.from';
      from = Math.max(from + 1, Math.max(node.to, next));
    }
  }

  /**
   * @template T
   * @param {number} from
   * @param {number} to
   * @param {?function(!TreeNode|undefined):T} callback
   * @return {T}
   */
  _starting(from, to, callback) {
    return this._handleRange(from, kFrom, to + 1, kFrom, callback);
  }

  /**
   * @template T
   * @param {number} from
   * @param {number} to
   * @param {?function(!TreeNode|undefined):T} callback
   * @return {T}
   */
  _ending(from, to, callback) {
    return this._handleRange(from - 1, kTo, to, kTo, callback);
  }

  /**
   * @template T
   * @param {number} from
   * @param {number} to
   * @param {?function(!TreeNode|undefined):T} callback
   * @return {T}
   */
  _touching(from, to, callback) {
    return this._handleRange(from - 1, kTo, to + 1, kFrom, callback);
  }

  /**
   * @template T
   * @param {number} offset1
   * @param {number} by1
   * @param {number} offset2
   * @param {number} by2
   * @param {?function(!TreeNode|undefined):T} callback
   * @return {T}
   */
  _handleRange(offset1, by1, offset2, by2, callback) {
    let tmp = split(this._root, offset1, by1);
    let tmp2 = split(tmp.right, offset2, by2);
    let result;
    if (callback)
      result = callback(tmp2.left);
    else
      tmp2.left = undefined;
    this._root = merge(tmp.left, merge(tmp2.left, tmp2.right));
    return result;
  }

  /**
   * @param {!TreeNode} root
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   * @return {!TreeNode}
   */
  _process(root, from, to, inserted) {
    let result = undefined;
    visit(root, decoration => {
      let start = decoration.from;
      let end = decoration.to;
      if (from < start && to > start)
        return;

      if (from <= start)
        start = to >= start ? from : start - (to - from);
      if (from <= end)
        end = to >= end ? from : end - (to - from);

      if (from <= start)
        start += inserted;
      if (from <= end)
        end += inserted;

      let node = {style: decoration.style, from: start, to: end, h: random(), size: 1};
      result = merge(result, node);
    });
    return result;
  }
};
