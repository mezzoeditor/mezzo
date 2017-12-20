import { Random } from "./Random.mjs";
let random = Random(25);

/**
 * @typedef {{
 *   data: *,
 *
 *   from: number,
 *   to: number,
 *   h: number,
 *
 *   add: number|undefined,
 *   left: !Segment|undefined,
 *   right: !Segment|undefined,
 *   parent: !Segment|undefined
 * }} Segment;
 */

/**
 * @param {!Segment} node
 */
function normalize(node) {
  if (!node.add)
    return;
  node.from += node.add;
  node.to += node.add;
  if (node.left)
    node.left.add = (node.left.add || 0) + node.add;
  if (node.right)
    node.right.add = (node.right.add || 0) + node.add;
  delete node.add;
};

/**
 * @param {!Segment} node
 * @param {!Segment|undefined} left
 * @param {!Segment|undefined} right
 */
function setChildren(node, left, right) {
  node.left = left;
  if (left)
    left.parent = node;
  node.right = right;
  if (right)
    right.parent = node;
};

/**
 * @param {!Segment|undefined} left
 * @param {!Segment|undefined} right
 */
function merge(left, right) {
  if (!left)
    return right;
  if (!right)
    return left;
  normalize(left);
  normalize(right);
  if (left.h > right.h)
    return setChildren(left, left.left, merge(left.right, right));
  else
    return setChildren(right, merge(left, right.left), right.right);
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
  normalize(node);
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
 * @param {!Segement|undefined} node
 * @param {!Array<!Segment>} result
 */
function visit(node, result) {
  if (!node)
    return;
  normalize(node);
  if (node.left)
    visit(node.left, result);
  result.push(node);
  if (node.right)
    visit(node.right, result);
};


/**
 * Note that two collapsed segments at the same position are not supported.
 * TODO: add runtime checks for that.
 */
export class Segments {
  constructor() {
    this._root = undefined;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {number} length
   */
  replace(from, to, length) {
    let delta = length - (to - from);
    let tmp = split(this._root, from, kTo);
    let left = tmp.left;
    tmp = split(tmp.right, to, kFrom);
    let right = tmp.right;
    tmp = split(tmp.left, from, kFrom);
    let crossLeft = tmp.left;
    tmp = split(tmp.right, to, kTo);
    let crossRight = tmp.right;
    // tmp.left is gone forever.

    let processed1 = this._process(crossLeft, from, to, length);
    let processed2 = this._process(crossRight, from, to, length);
    if (right)
      right.add = (right.add || 0) + delta;
    this._root = merge(left, merge(merge(processed1, processed2), right));
  }

  _process(root, from, to, inserted) {
    let list = [];
    visit(root, list);
    let result = undefined;
    let delta = inserted - (to - from);
    for (let node of list) {
      let start = node.from;
      let end = node.to;
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

      node.from = start;
      node.to = end;
      delete node.left;
      delete node.right;
      delete node.parent;
      delete node.add;
      result = merge(result, node);
    }
    return result;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {*} data
   * @return {!Segment}
   */
  add(from, to) {
    if (from > to)
      throw 'Segments must not be degenerate';
    let tmp = split(this._root, to, kTo);
    // TODO: check for disjoint.
    let node = {from: from, to: to, h: random(), data};
    this._root = merge(merge(tmp.left, node), tmp.right);
    return node;
  }

  /**
   * @param {!Segment} segment
   * @return {!Segment}
   */
  retrieve(segment) {
    let parents = [];
    let node = segment;
    while (node) {
      parents.push(node);
      node = node.parent;
    }
    for (let i = parents.length - 1; i >= 0; i--)
      normalize(parents[i]);
    return node;
  }

  /**
   * @param {!Segment} segment
   * @return {!Segment}
   */
  remove(segment) {
    let segment = this.retrieve(segment);
    let collapsed = segment.from === segment.to;
    let tmp = split(this._root, segment.from, collapsed ? kFrom : kBetween);
    let tmp2 = split(tmp.right, segment.from, collapsed ? kBetween : kFrom);
    if (tmp2.left !== segment)
      throw 'Attempt to remove unknown segment';
    this._root = merge(tmp.left, tmp2.right);
    return segment;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @return {!Array<!Segment>}
   */
  intersect(from, to) {
    let tmp = split(this._root, range.from, kFrom);
    let tmp2 = split(tmp.right, range.to, kTo);
    let result = [];
    visit(tmp2.left, result);
    this._root = merge(tmp.left, merge(tmp2.left, tmp2.right));
    return result;
  }

  /**
   * @return {!Array<!Segment>}
   */
  all() {
    let result = [];
    visit(this._root, result);
    return result;
  }
};
