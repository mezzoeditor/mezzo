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
 * @param {!Array<!Decoration>} result
 */
function visitList(node, result) {
  if (!node)
    return;
  node = normalize(node);
  visitList(node.left, result);
  result.push({from: node.from, to: node.to, style: node.style});
  visitList(node.right, result);
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

export class Decorator {
  constructor() {
    this._root = undefined;
  }

  /**
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
   * @param {number} from
   * @param {number} to
   * @param {string} style
   */
  remove(from, to, style) {
    let collapsed = from === to;
    let tmp = split(this._root, from, collapsed ? kFrom : kBetween);
    let tmp2 = split(tmp.right, to, collapsed ? kBetween : kFrom);
    let removed = tmp2.left;
    if (!removed || removed.from !== from || removed.to !== to)
      throw 'Decoration is not present';
    if (removed.left || removed.right)
      throw 'Inconsistent';
    this._root = merge(tmp.left, tmp2.right);
  }

  clearAll() {
    this._root = undefined;
  }

  /**
   * Removes all decorations which start at [from, to].
   * @param {number} from
   * @param {number} to
   */
  clearStarting(from, to) {
    let tmp = split(this._root, from, kFrom);
    let tmp2 = split(tmp.right, to + 1, kFrom);
    this._root = merge(tmp.left, tmp2.right);
  }

  /**
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
   * @param {!TreeNode} root
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   * @return {!TreeNode}
   */
  _process(root, from, to, inserted) {
    let decorations = [];
    visitList(root, decorations);
    let result = undefined;
    for (let decoration of decorations) {
      let start = decoration.from;
      let end = decoration.to;
      if (from < start && to > start)
        continue;

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
    }
    return result;
  }

  /**
   * @return {!Array<!Decoration>}
   */
  listAll() {
    let result = [];
    visitList(this._root, result);
    return result;
  }

  /**
   * Lists all decorations which intersect or touch [from, to].
   * @param {number} from
   * @param {number} to
   * @return {!Array<!Decoration>}
   */
  listTouching(from, to) {
    let tmp = split(this._root, range.from, kTo);
    let tmp2 = split(tmp.right, range.to, kFrom);
    let result = [];
    visitList(tmp2.left, result);
    this._root = merge(tmp.left, merge(tmp2.left, tmp2.right));
    return result;
  }

  /**
   * Returns the number of decorations which start at [from, to].
   * @param {number} from
   * @param {number} to
   * @return {number}
   */
  countStarting(from, to) {
    let tmp = split(this._root, from, kFrom);
    let tmp2 = split(tmp.right, to + 1, kFrom);
    let result = tmp2.left ? tmp2.left.size : 0;
    this._root = merge(tmp.left, merge(tmp2.left, tmp2.right));
    return result;
  }

  /**
   * @return {number}
   */
  countAll() {
    return this._root ? this._root.size : 0;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @return {?Decoration}
   */
  firstStarting(from, to) {
    let tmp = split(this._root, from, kFrom);
    let tmp2 = split(tmp.right, to + 1, kFrom);
    let result = null;
    if (tmp2.left) {
      let node = first(tmp2.left);
      result = {from: node.from, to: node.to, style: node.style};
    }
    this._root = merge(tmp.left, merge(tmp2.left, tmp2.right));
    return result;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @return {?Decoration}
   */
  lastEnding(offset) {
    let tmp = split(this._root, from - 1, kTo);
    let tmp2 = split(tmp.right, to, kTo);
    let result = null;
    if (tmp2.left) {
      let node = last(tmp2.left);
      result = {from: node.from, to: node.to, style: node.style};
    }
    this._root = merge(tmp.left, merge(tmp2.left, tmp2.right));
    return result;
  }

  /**
   * Maps all styles to decorations which intersect or touch [from, to].
   * @param {number} from
   * @param {number} to
   * @return {!Map<string, !Array<!OffsetRange>>}
   */
  mapTouching(range) {
    // TODO: creating this map is really slow, we should optimize iterating over
    // decorations.
    let result = new Map();
    let tmp = split(this._root, range.from, kTo);
    let tmp2 = split(tmp.right, range.to, kFrom);
    visitMap(tmp2.left, result);
    this._root = merge(tmp.left, merge(tmp2.left, tmp2.right));
    return result;
  }
};
