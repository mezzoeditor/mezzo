import { Random } from './Random.js';

/**
 * @template T
 * @extends Range
 * @typedef {{
 *   from: Anchor,
 *   to: Anchor,
 *   data: T,
 * }} RangeData
 * This is an immutable range with some data attached to it.
 */

/**
 * @typedef {*} RangeHandle
 * Opaque handle to a specific range in a RangeTree.
 */

/**
 * This is a mutable collection of disjoint ranges with some data attached.
 * Ranges are efficiently rebased on top of replacement-like changes, providing
 * a way to track current position in a constantly changing linear environment
 * like a text being edited.
 *
 * It also supports optional handles allowing to remove specific ranges and resolve
 * their current bounds. Note that handles slightly degrade performance, so only
 * use them when really needed.
 *
 * @template T - the type of data attached to each range.
 */
export class RangeTree {
  /**
   * Tree with handles is slower on replace() operation, but keeps a handle
   * to each decoration which can be used to resolve or remove it later.
   * @param {boolean} createHandles
   */
  constructor(createHandles = false) {
    this._root = undefined;
    this._createHandles = !!createHandles;
  }

  /**
   * Adds a single range. Note that ranges must be:
   *   - not degenerate (|from| <= |to|);
   *   - disjoiint (no ranges have common interior point).
   * Only returns a handle if created with handles support.
   * @param {Anchor} from
   * @param {Anchor} to
   * @param {T} data
   * @return {RangeHandle|undefined}
   */
  add(from, to, data) {
    if (from > to)
      throw new Error('Reversed decorations are not allowed');
    let tmp = split(this._root, from + 0.5, kTo);
    if (tmp.left && last(tmp.left).to > from)
      throw new Error('Decorations must be disjoint');
    if (tmp.right && first(tmp.right).from < to)
      throw new Error('Decorations must be disjoint');
    let node = {data, from, to, h: random(), size: 1};
    this._root = merge(merge(tmp.left, node), tmp.right);
    return this._createHandles ? node : undefined;
  }

  /**
   * Similar to add, but takes an object.
   * @param {RangeData<T>} rangeData
   * @return {RangeHandle|undefined}
   */
  addRangeData(rangeData) {
    return add(rangeData.from, rangeData.to, rangeData.data);
  }

  /**
   * Removes a single range by handle and returns it's data if any.
   * @param {RangeHandle} handle
   * @return {RangeData|undefined}
   */
  remove(handle) {
    const range = this.resolve(handle);
    if (!range)
      return;
    const tmp = split(this._root, range.from, kTo);
    let tmp2;
    if (range.from === range.to)
      tmp2 = split(tmp.right, range.to + 0.5, kTo);
    else
      tmp2 = split(tmp.right, range.to, kFrom);
    const removed = tmp2.left;
    if (!removed || removed.from !== range.from || removed.to !== range.to || removed.left || removed.right)
      throw new Error('Inconsistent');
    removed.parent = undefined;
    this._root = merge(tmp.left, tmp2.right);
    return range;
  }

  /**
   * Returns the range's current bounds.
   * @param {RangeHandle} handle
   * @return {RangeData|undefined}
   */
  resolve(handle) {
    const stack = [];
    for (let node = handle; node; node = node.parent)
      stack.push(node);
    stack.reverse();
    if (stack[0] !== this._root)
      return;
    for (const parent of stack)
      normalize(parent);
    return {from: handle.from, to: handle.to, data: handle.data};
  }

  /**
   * Adjusts ranges according to the replacement.
   * The first of the following rules is applied to each range:
   *   - ranges covered by replaced range are removed;
   *   - ranges covering replaced range are resized by |inserted - to + from|;
   *   - ranges covering |from| or |to| are cropped by [from, to];
   *   - ranges starting after |to| are moved by |inserted - to + from|.
   * Returns the list of handles to removed ranges if supports handles.
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   * @return {Array<RangeHandle>|undefined}
   */
  replace(from, to, inserted) {
    // TODO: take offset, removed, inserted instead to align with Replacement?
    const delta = inserted - (to - from);
    let tmp = split(this._root, from, kTo);
    const left = tmp.left;
    tmp = split(tmp.right, to + 0.5, kFrom);
    const right = tmp.right;
    tmp = split(tmp.left, from + 0.5, kFrom);
    const crossLeft = tmp.left;
    tmp = split(tmp.right, to, kTo);
    const crossRight = tmp.right;

    let removed;
    if (this._createHandles) {
      removed = [];
      visit(tmp.left, node => {
        node.parent = undefined;
        removed.push(node);
      });
    }

    const processed1 = this._process(crossLeft, from, to, inserted, removed);
    const processed2 = this._process(crossRight, from, to, inserted, removed);
    if (right)
      right.add = (right.add || 0) + delta;
    this._root = merge(left, merge(merge(processed1, processed2), right));
    return removed;
  }

  /**
   * Returns the total number of ranges.
   * @return {number}
   */
  countAll() {
    return this._root ? this._root.size : 0;
  }

  /**
   * Returns the number of ranges which start at [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   * @return {number}
   */
  countStarting(from, to) {
    return this._starting(from, to, node => node ? node.size : 0);
  }

  /**
   * Returns the number of ranges which end at [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   * @return {number}
   */
  countEnding(from, to) {
    return this._ending(from, to, node => node ? node.size : 0);
  }

  /**
   * Returns the number of ranges which intersect or touch [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   * @return {number}
   */
  countTouching(from, to) {
    return this._touching(from, to, node => node ? node.size : 0);
  }

  /**
   * Lists all ranges.
   * @return {Array<RangeData>}
   */
  listAll() {
    const result = [];
    visit(this._root, result.push.bind(result));
    return result;
  }

  /**
   * Lists all ranges which start at [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   * @return {Array<RangeData>}
   */
  listStarting(from, to) {
    const result = [];
    this._starting(from, to, node => visit(node, result.push.bind(result)));
    return result;
  }

  /**
   * Lists all ranges which end at [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   * @return {Array<RangeData>}
   */
  listEnding(from, to) {
    const result = [];
    this._ending(from, to, node => visit(node, result.push.bind(result)));
    return result;
  }

  /**
   * Lists all ranges which intersect or touch [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   * @return {Array<RangeData>}
   */
  listTouching(from, to) {
    const result = [];
    this._touching(from, to, node => visit(node, result.push.bind(result)));
    return result;
  }

  /**
   * Removes all ranges.
   */
  clearAll() {
    this._root = undefined;
  }

  /**
   * Removes all ranges which start at [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   */
  clearStarting(from, to) {
    this._starting(from, to, null);
  }

  /**
   * Removes all ranges which end at [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   */
  clearEnding(from, to) {
    this._ending(from, to, null);
  }

  /**
   * Removes all ranges which intersect or touch [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   */
  clearTouching(from, to) {
    this._touching(from, to, null);
  }

  /**
   * Visits all ranges.
   * @param {function(RangeData)} visitor
   */
  visitAll(visitor) {
    visit(this._root, visitor);
  }

  /**
   * Visits all ranges which start at [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   * @param {function(RangeData)} visitor
   */
  visitStarting(from, to, visitor) {
    this._starting(from, to, node => visit(node, visitor));
  }

  /**
   * Visits all ranges which end at [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   * @param {function(RangeData)} visitor
   */
  visitEnding(from, to, visitor) {
    this._ending(from, to, node => visit(node, visitor));
  }

  /**
   * Visits all ranges which intersect or touch [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   * @param {function(RangeData)} visitor
   */
  visitTouching(from, to, visitor) {
    this._touching(from, to, node => visit(node, visitor));
  }

  /**
   * Returns the first (sorted by start anchor) range.
   * @return {?RangeData}
   */
  firstAll() {
    return this._root ? first(this._root) : null;
  }

  /**
   * Returns the first (sorted by start anchor) range which starts at [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   * @return {?RangeData}
   */
  firstStarting(from, to) {
    return this._starting(from, to, node => node ? first(node) : null);
  }

  /**
   * Returns the first (sorted by start anchor) range which ends at [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   * @return {?RangeData}
   */
  firstEnding(from, to) {
    return this._ending(from, to, node => node ? first(node) : null);
  }

  /**
   * Returns the first (sorted by start anchor) range which intersects or touches [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   * @return {?RangeData}
   */
  firstTouching(from, to) {
    return this._touching(from, to, node => node ? first(node) : null);
  }

  /**
   * Returns the last (sorted by start anchor) range.
   * @return {?RangeData}
   */
  lastAll() {
    return this._root ? last(this._root) : null;
  }

  /**
   * Returns the last (sorted by start anchor) range which starts at [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   * @return {?RangeData}
   */
  lastStarting(from, to) {
    return this._starting(from, to, node => node ? last(node) : null);
  }

  /**
   * Returns the last (sorted by start anchor) range which ends at [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   * @return {?RangeData}
   */
  lastEnding(from, to) {
    return this._ending(from, to, node => node ? last(node) : null);
  }

  /**
   * Returns the last (sorted by start anchor) range which intersects or touches [from, to).
   * @param {Anchor} from
   * @param {Anchor} to
   * @return {?RangeData}
   */
  lastTouching(from, to) {
    return this._touching(from, to, node => node ? last(node) : null);
  }

  /**
   * Visits all ranges, skipping some.
   * The returned value of |visitor| is treated as the minimum |from| of the
   * next range to visit. This means that the range
   * from |range.to| to |returnValue| is effectively skipped.
   *
   * Passing the following function will not skip anything
   * (based on ranges being disjoint):
   *   let visitor = range => range.to;
   *
   * @param {function(range: RangeData):Anchor} visitor
   *
   * TODO: this could be done more effectively.
   */
  sparseVisitAll(visitor) {
    if (!this._root)
      return;
    let from = first(this._root).from;
    while (true) {
      const node = find(this._root, from);
      if (!node)
        return;
      const next = visitor(node);
      if (next < node.from)
        throw new Error('Return value of visitor must not be less than decoration.from');
      from = Math.max(from + 0.5, Math.max(node.to, next));
    }
  }

  /**
   * @template P
   * @param {Anchor} from
   * @param {Anchor} to
   * @param {?function(RangeTreeNode<T>|undefined):P} callback
   * @return {P}
   */
  _starting(from, to, callback) {
    return this._handleRange(from, kFrom, to, kFrom, callback);
  }

  /**
   * @template P
   * @param {Anchor} from
   * @param {Anchor} to
   * @param {?function(RangeTreeNode<T>|undefined):P} callback
   * @return {P}
   */
  _ending(from, to, callback) {
    return this._handleRange(from, kTo, to, kTo, callback);
  }

  /**
   * @template P
   * @param {Anchor} from
   * @param {Anchor} to
   * @param {?function(RangeTreeNode<T>|undefined):P} callback
   * @return {P}
   */
  _touching(from, to, callback) {
    return this._handleRange(from, kTo, to, kFrom, callback);
  }

  /**
   * @template P
   * @param {Anchor} anchor1
   * @param {number} by1
   * @param {Anchor} anchor2
   * @param {number} by2
   * @param {?function(RangeTreeNode<T>|undefined):P} callback
   * @return {P}
   */
  _handleRange(anchor1, by1, anchor2, by2, callback) {
    const tmp = split(this._root, anchor1, by1);
    const tmp2 = split(tmp.right, anchor2, by2);
    let result;
    if (callback)
      result = callback(tmp2.left);
    else
      tmp2.left = undefined;
    this._root = merge(tmp.left, merge(tmp2.left, tmp2.right));
    return result;
  }

  /**
   * @param {RangeTreeNode<T>|undefined} root
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   * @param {Array<RangeHandle>|undefined} removed
   * @return {RangeTreeNode<T>|undefined}
   */
  _process(root, from, to, inserted, removed) {
    const all = [];
    visit(root, all.push.bind(all));

    let result = undefined;
    for (const node of all) {
      let start = node.from;
      let end = node.to;
      if (from < start && to >= end) {
        node.parent = undefined;
        if (removed)
          removed.push(node);
        continue;
      }

      if (from >= start && to < end) {
        end += inserted - (to - from);
      } else if (from < start && to >= start) {
        start = from + inserted;
        end = from + inserted + (end - to);
      } else if (from < end && to >= end) {
        end = from;
      } else if (to < start) {
        start += inserted - (to - from);
        end += inserted - (to - from);
      }
      node.from = start;
      node.to = end;

      delete node.left;
      delete node.right;
      node.parent = node.add = undefined;
      node.size = 1;
      result = merge(result, node);
    }
    return result;
  }
};

/**
 * @template T
 * @extends RangeData<T>
 * @typedef {{
 *   data: T,
 *   from: Anchor,
 *   to: Anchor,
 *   h: number,
 *   size: number,
 *   add: number|undefined,
 *   left: TreeNode|undefined,
 *   right: TreeNode|undefined,
 *   parent: TreeNode|undefined
 * }} RangeTreeNode
 */

const random = Random(25);

/**
 * @template T
 * @param {RangeTreeNode<T>} node
 * @return {RangeTreeNode<T>}
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
 * @template T
 * @param {RangeTreeNode<T>} node
 * @param {RangeTreeNode<T>|undefined} left
 * @param {RangeTreeNode<T>|undefined} right
 * @return {RangeTreeNode<T>}
 */
function setChildren(node, left, right) {
  if (node.add)
    throw new Error('Inconsistent');
  node.size = 1;
  node.left = left;
  if (left) {
    node.size += left.size;
    left.parent = node;
  }
  node.right = right;
  if (right) {
    node.size += right.size;
    right.parent = node;
  }
  return node;
};

/**
 * @template T
 * @param {RangeTreeNode<T>|undefined} left
 * @param {RangeTreeNode<T>|undefined} right
 * @return {RangeTreeNode<T>|undefined}
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

/**
 * @template T
 * @param {RangeTreeNode<T>|undefined} node
 * @param {Anchor} key
 * @param {number} splitBy
 * @return {{left: RangeTreeNode<T>|undefined, right: RangeTreeNode<T>|undefined}}
 */
function split(node, key, splitBy) {
  if (!node)
    return {};
  node = normalize(node);
  let nodeToLeft = splitBy === kFrom ? node.from < key : node.to < key;
  if (nodeToLeft) {
    let tmp = split(node.right, key, splitBy);
    node.parent = undefined;
    return {left: setChildren(node, node.left, tmp.left), right: tmp.right};
  } else {
    let tmp = split(node.left, key, splitBy);
    node.parent = undefined;
    return {left: tmp.left, right: setChildren(node, tmp.right, node.right)};
  }
};

/**
 * @template T
 * @param {RangeTreeNode<T>|undefined} node
 * @param {function(RangeTreeNode<T>)} visitor
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
 * @template T
 * @param {RangeTreeNode<T>} node
 * @return {RangeTreeNode<T>}
 */
function first(node) {
  while (normalize(node).left)
    node = node.left;
  return node;
};

/**
 * @template T
 * @param {RangeTreeNode<T>} node
 * @return {RangeTreeNode<T>}
 */
function last(node) {
  while (normalize(node).right)
    node = node.right;
  return node;
};

/**
 * @template T
 * @param {RangeTreeNode<T>|undefined} node
 * @param {Anchor} key
 * @return {RangeTreeNode<T>|undefined}
 */
function find(node, key) {
  if (!node)
    return;
  node = normalize(node);
  if (node.from >= key)
    return find(node.left, key) || node;
  return find(node.right, key);
};
