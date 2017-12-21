import { Random } from "./Random.mjs";
let random = Random(25);

/**
 * @typedef {{
 *   data: *,
 *   from: number,
 *   to: number,
 *   h: number,
 *   add: number|undefined,
 *   left: !Segment|undefined,
 *   right: !Segment|undefined,
 * }} Segment;
 */

/**
 * @param {!Segment} node
 * @return {!Segment}
 */
function normalize(node) {
  if (!node.add)
    return node;
  let result = {from: node.from + node.add, to: node.to + node.add, data: node.data, h: node.h};
  if (node.left) {
    result.left = clone(node.left, node.left.left, node.left.right);
    result.left.add = (result.left.add || 0) + node.add;
  }
  if (node.right) {
    result.right = clone(node.right, node.right.left, node.right.right);
    result.right.add = (result.right.add || 0) + node.add;
  }
  return result;
};

/**
 * @param {!Segment} node
 * @param {!Segment|undefined} left
 * @param {!Segment|undefined} right
 * @return {!Segment}
 */
function clone(node, left, right) {
  let result = {data: node.data, from: node.from, to: node.to, h: node.h};
  if (node.add)
    result.add = node.add;
  result.left = left;
  result.right = right;
  return result;
};

/**
 * @param {!Segment|undefined} left
 * @param {!Segment|undefined} right
 * @return {!Segment|undefined}
 */
function merge(left, right) {
  if (!left)
    return right;
  if (!right)
    return left;
  left = normalize(left);
  right = normalize(right);
  if (left.h > right.h)
    return clone(left, left.left, merge(left.right, right));
  else
    return clone(right, merge(left, right.left), right.right);
};

const kFrom = 0;
const kTo = 1;
const kBetween = 2;

/**
 * @param {!Segment|undefined} node
 * @param {number} offset
 * @param {number} splitBy
 * @return {{left: !Segment|undefined, right: !Segment|undefined}}
 */
function split(node, offset, splitBy) {
  if (!node)
    return {};
  node = normalize(node);
  let nodeToRight = splitBy === kFrom ? node.from >= offset :
      (splitBy === kTo ? node.to > offset : (node.from > offset || node.to > offset));
  if (nodeToRight) {
    let tmp = split(node.left, offset, splitBy);
    return {left: tmp.left, right: clone(node, tmp.right, node.right)};
  } else {
    let tmp = split(node.right, offset, splitBy);
    return {left: clone(node, node.left, tmp.left), right: tmp.right};
  }
};


/**
 * @param {!Segement|undefined} node
 * @param {number} add
 * @param {!Array<{from: number, to: number, data: *}>} result
 */
function visit(node, add, result) {
  if (!node)
    return;
  add += node.add || 0;
  if (node.left)
    visit(node.left, add, result);
  result.push({from: node.from + add, to: node.to + add, data: node.data});
  if (node.right)
    visit(node.right, add, result);
};


/**
 * Note that two collapsed segments at the same position are not supported.
 * TODO: add runtime checks for that.
 */
export class Segments {
  /**
   * @param {!Segment|undefined} root
   */
  constructor(root) {
    this._root = root;
  }

  /**
   * @return {!Segments}
   */
  static empty() {
    return new Segments(undefined);
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   * @return {!Segments}
   */
  replace(from, to, inserted) {
    let delta = inserted - (to - from);
    let tmp = split(this._root, from - 1, kTo);
    let left = tmp.left;
    tmp = split(tmp.right, to + 1, kFrom);
    let right = tmp.right;
    tmp = split(tmp.left, from + 1, kFrom);
    let crossLeft = tmp.left;
    tmp = split(tmp.right, to - 1, kTo);
    let crossRight = tmp.right;
    // tmp.left is gone forever.

    let processed1 = this._process(crossLeft, from, to, inserted);
    let processed2 = this._process(crossRight, from, to, inserted);
    if (right) {
      right = clone(right, right.left, right.right);
      right.add = (right.add || 0) + delta;
    }
    return new Segments(merge(left, merge(merge(processed1, processed2), right)));
  }

  /**
   * @param {!Segment} root
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   * @return {!Segment}
   */
  _process(root, from, to, inserted) {
    let segments = [];
    visit(root, 0, segments);
    let result = undefined;
    let delta = inserted - (to - from);
    for (let segment of segments) {
      let start = segment.from;
      let end = segment.to;
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

      let node = {from: start, to: end, h: random(), data: segment.data};
      result = merge(result, node);
    }
    return result;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {*} data
   * @return {!Segments}
   */
  add(from, to, data) {
    if (from > to)
      throw 'Segments must not be degenerate';
    let tmp = split(this._root, to, kTo);
    // TODO: check for disjoint.
    let node = {from: from, to: to, h: random(), data};
    return new Segments(merge(merge(tmp.left, node), tmp.right));
  }

  /**
   * @param {number} from
   * @param {number} to
   * @return {!Segments}
   */
  remove(from, to) {
    let collapsed = from === to;
    let tmp = split(this._root, from, collapsed ? kFrom : kBetween);
    let tmp2 = split(tmp.right, to, collapsed ? kBetween : kFrom);
    let removed = tmp2.left;
    if (!removed || removed.from !== from || removed.to !== to)
      throw 'Attempt to remove unknown segment';
    if (removed.left || removed.right)
      throw 'Inconsistent';
    return new Segments(merge(tmp.left, tmp2.right));
  }

  /**
   * @param {number} from
   * @param {number} to
   * @return {!Array<{from: number, to: number, data: *}>}
   */
  intersect(from, to) {
    let tmp = split(this._root, range.from, kTo);
    tmp = split(tmp.right, range.to, kFrom);
    let result = [];
    visit(tmp.left, 0, result);
    return result;
  }

  /**
   * @return {!Array<{from: number, to: number, data: *}>}
   */
  all() {
    let result = [];
    visit(this._root, 0, result);
    return result;
  }
};
