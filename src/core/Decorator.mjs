import { CompareAnchors, NextAnchor, MaxAnchor, Start, End } from './Anchor.mjs';
import { Random } from './Random.mjs';
let random = Random(25);

/**
 * @template T
 * @typedef {{
 *   from: !Anchor,
 *   to: !Anchor,
 *   data: T,
 * }} Decoration
 */

/**
 * @template T
 * @typedef {{
 *   data: T,
 *   from: !Anchor,
 *   to: !Anchor,
 *   h: number,
 *   size: number,
 *   add: number|undefined,
 *   left: !TreeNode|undefined,
 *   right: !TreeNode|undefined,
 *   parent: !TreeNode|undefined
 * }} TreeNode;
 */

/**
 * @typedef {*} Decorator.Handle
 */

/**
 * @template T
 * @param {!TreeNode<T>} node
 * @return {!TreeNode<T>}
 */
function normalize(node) {
  if (!node.add)
    return node;
  node.from.offset += node.add;
  node.to.offset += node.add;
  if (node.left)
    node.left.add = (node.left.add || 0) + node.add;
  if (node.right)
    node.right.add = (node.right.add || 0) + node.add;
  node.add = undefined;
  return node;
};

/**
 * @template T
 * @param {!TreeNode<T>} node
 * @param {!TreeNode<T>|undefined} left
 * @param {!TreeNode<T>|undefined} right
 * @return {!TreeNode<T>}
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
 * @param {!TreeNode<T>|undefined} left
 * @param {!TreeNode<T>|undefined} right
 * @return {!TreeNode<T>|undefined}
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
 * @param {!TreeNode<T>|undefined} node
 * @param {!Anchor} key
 * @param {number} splitBy
 * @return {{left: !TreeNode<T>|undefined, right: !TreeNode<T>|undefined}}
 */
function split(node, key, splitBy) {
  if (!node)
    return {};
  node = normalize(node);
  let nodeToLeft = splitBy === kFrom ? CompareAnchors(node.from, key) < 0 : CompareAnchors(node.to, key) < 0;
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
 * @param {!TreeNode<T>|undefined} node
 * @param {function(!TreeNode<T>)} visitor
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
 * @param {!TreeNode<T>} node
 * @return {!TreeNode<T>}
 */
function first(node) {
  while (normalize(node).left)
    node = node.left;
  return node;
};

/**
 * @template T
 * @param {!TreeNode<T>} node
 * @return {!TreeNode<T>}
 */
function last(node) {
  while (normalize(node).right)
    node = node.right;
  return node;
};

/**
 * @template T
 * @param {!TreeNode<T>|undefined} node
 * @param {!Anchor} key
 * @return {!TreeNode<T>|undefined}
 */
function find(node, key) {
  if (!node)
    return;
  node = normalize(node);
  if (CompareAnchors(node.from, key) >= 0)
    return find(node.left, key) || node;
  return find(node.right, key);
};

/**
 * @template T
 */
export class Decorator {
  /**
   * Decorator with handles is slower on replace() operation, but keeps a handle
   * to each decoration which can be used to resolve or remove it later.
   *
   * @param {boolean=} createHandles
   */
  constructor(createHandles) {
    this._root = undefined;
    this._createHandles = !!createHandles;
  }

  /**
   * Adds a single decoration. Note that decorations must be:
   *   - not degenerate (|from| <= |to|);
   *   - disjoiint (no decorations have common interior point).
   * Only returns a handle if asked for in constructor.
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @param {T} data
   * @return {!Decorator.Handle|undefined}
   */
  add(from, to, data) {
    if (CompareAnchors(from, to) > 0)
      throw new Error('Reversed decorations are not allowed');
    let tmp = split(this._root, NextAnchor(from), kTo);
    if (tmp.left && CompareAnchors(last(tmp.left).to, from) > 0)
      throw new Error('Decorations must be disjoint');
    if (tmp.right && CompareAnchors(first(tmp.right).from, to) < 0)
      throw new Error('Decorations must be disjoint');
    let node = {data, from, to, h: random(), size: 1};
    this._root = merge(merge(tmp.left, node), tmp.right);
    return this._createHandles ? node : undefined;
  }

  /**
   * Removes a single decoration by handle and returns it's data if any.
   *
   * @param {!Decorator.Handle} handle
   * @return {!Decoration|undefined}
   */
  remove(handle) {
    let decoration = this.resolve(handle);
    if (!decoration)
      return;
    let tmp = split(this._root, decoration.from, kTo);
    let tmp2 = split(tmp.right, decoration.to, kFrom);
    let removed = tmp2.left;
    if (!removed || CompareAnchors(removed.from, decoration.from) !== 0 || CompareAnchors(removed.to, decoration.to) !== 0 || removed.left || removed.right)
      throw new Error('Inconsistent');
    removed.parent = undefined;
    this._root = merge(tmp.left, tmp2.right);
    return decoration;
  }

  /**
   * Returns the range of a single decoration if any.
   *
   * @param {!Decorator.Handle} handle
   * @return {!Decoration|undefined}
   */
  resolve(handle) {
    let node = handle;
    let stack = [];
    while (node) {
      stack.push(node);
      node = node.parent;
    }
    stack.reverse();
    if (stack[0] !== this._root)
      return;
    for (let parent of stack)
      normalize(parent);
    return {from: handle.from, to: handle.to, data: handle.data};
  }

  /**
   * Adjusts decorations according to the replacement.
   * The first of the following rules is applied to each decoration:
   *   - decorations covered by replaced range are removed;
   *   - decorations covering replaced range are resized by |inserted - to + from|;
   *   - decorations covering |from| or |to| are cropped by [from, to];
   *   - decorations starting after |to| are moved by |inserted - to + from|.
   * Returns the list of handles to removed decorations if asked for in constructor.
   *
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   * @return {!Array<!Decorator.Handle>|undefined}
   */
  replace(from, to, inserted) {
    // TODO: take offset, removed, inserted instead to align with Replacement?
    let delta = inserted - (to - from);
    let tmp = split(this._root, Start(from), kTo);
    let left = tmp.left;
    tmp = split(tmp.right, End(to), kFrom);
    let right = tmp.right;
    tmp = split(tmp.left, End(from), kFrom);
    let crossLeft = tmp.left;
    tmp = split(tmp.right, Start(to), kTo);
    let crossRight = tmp.right;

    let removed;
    if (this._createHandles) {
      removed = [];
      visit(tmp.left, node => {
        node.parent = undefined;
        removed.push(node);
      });
    }

    let processed1 = this._process(crossLeft, from, to, inserted, removed);
    let processed2 = this._process(crossRight, from, to, inserted, removed);
    if (right)
      right.add = (right.add || 0) + delta;
    this._root = merge(left, merge(merge(processed1, processed2), right));
    return removed;
  }

  /**
   * Returns the total number of decorations.
   *
   * @return {number}
   */
  countAll() {
    return this._root ? this._root.size : 0;
  }

  /**
   * Returns the number of decorations which start at [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @return {number}
   */
  countStarting(from, to) {
    return this._starting(from, to, node => node ? node.size : 0);
  }

  /**
   * Returns the number of decorations which end at [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @return {number}
   */
  countEnding(from, to) {
    return this._ending(from, to, node => node ? node.size : 0);
  }

  /**
   * Returns the number of decorations which intersect or touch [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @return {number}
   */
  countTouching(from, to) {
    return this._touching(from, to, node => node ? node.size : 0);
  }

  /**
   * Lists all decorations.
   *
   * @return {!Array<!Decoration>}
   */
  listAll() {
    let result = [];
    visit(this._root, result.push.bind(result));
    return result;
  }

  /**
   * Lists all decorations which start at [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @return {!Array<!Decoration>}
   */
  listStarting(from, to) {
    let result = [];
    this._starting(from, to, node => visit(node, result.push.bind(result)));
    return result;
  }

  /**
   * Lists all decorations which end at [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @return {!Array<!Decoration>}
   */
  listEnding(from, to) {
    let result = [];
    this._ending(from, to, node => visit(node, result.push.bind(result)));
    return result;
  }

  /**
   * Lists all decorations which intersect or touch [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
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
   * Removes all decorations which start at [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   */
  clearStarting(from, to) {
    this._starting(from, to, null);
  }

  /**
   * Removes all decorations which end at [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   */
  clearEnding(from, to) {
    this._ending(from, to, null);
  }

  /**
   * Removes all decorations which intersect or touch [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   */
  clearTouching(from, to) {
    this._touching(from, to, null);
  }

  /**
   * Visits all decorations.
   *
   * @param {function(!Decoration)} visitor
   */
  visitAll(visitor) {
    visit(this._root, visitor);
  }

  /**
   * Visits all decorations which start at [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @param {function(!Decoration)} visitor
   */
  visitStarting(from, to, visitor) {
    this._starting(from, to, node => visit(node, visitor));
  }

  /**
   * Visits all decorations which end at [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @param {function(!Decoration)} visitor
   */
  visitEnding(from, to, visitor) {
    this._ending(from, to, node => visit(node, visitor));
  }

  /**
   * Visits all decorations which intersect or touch [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @param {function(!Decoration)} visitor
   */
  visitTouching(from, to, visitor) {
    this._touching(from, to, node => visit(node, visitor));
  }

  /**
   * Returns the first (sorted by anchor) decoration.
   *
   * @return {?Decoration}
   */
  firstAll() {
    return this._root ? first(this._root) : null;
  }

  /**
   * Returns the first (sorted by anchor) decoration which starts at [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @return {?Decoration}
   */
  firstStarting(from, to) {
    return this._starting(from, to, node => node ? first(node) : null);
  }

  /**
   * Returns the first (sorted by anchor) decoration which ends at [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @return {?Decoration}
   */
  firstEnding(from, to) {
    return this._ending(from, to, node => node ? first(node) : null);
  }

  /**
   * Returns the first (sorted by anchor) decoration which intersects or touches [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @return {?Decoration}
   */
  firstTouching(from, to) {
    return this._touching(from, to, node => node ? first(node) : null);
  }

  /**
   * Returns the last (sorted by anchor) decoration.
   *
   * @return {?Decoration}
   */
  lastAll() {
    return this._root ? last(this._root) : null;
  }

  /**
   * Returns the last (sorted by anchor) decoration which starts at [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @return {?Decoration}
   */
  lastStarting(from, to) {
    return this._starting(from, to, node => node ? last(node) : null);
  }

  /**
   * Returns the last (sorted by anchor) decoration which ends at [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @return {?Decoration}
   */
  lastEnding(from, to) {
    return this._ending(from, to, node => node ? last(node) : null);
  }

  /**
   * Returns the last (sorted by anchor) decoration which intersects or touches [from, to).
   *
   * @param {!Anchor} from
   * @param {!Anchor} to
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
   *
   * @param {function(decoration: !Decoration):!Anchor} visitor
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
      if (CompareAnchors(next, node.from) < 0)
        throw new Error('Return value of visitor must not be less than decoration.from');
      from = MaxAnchor(NextAnchor(from), MaxAnchor(node.to, next));
    }
  }

  /**
   * @template P
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @param {?function(!TreeNode|undefined):P} callback
   * @return {P}
   */
  _starting(from, to, callback) {
    return this._handleRange(from, kFrom, to, kFrom, callback);
  }

  /**
   * @template P
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @param {?function(!TreeNode|undefined):P} callback
   * @return {P}
   */
  _ending(from, to, callback) {
    return this._handleRange(from, kTo, to, kTo, callback);
  }

  /**
   * @template P
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @param {?function(!TreeNode|undefined):P} callback
   * @return {P}
   */
  _touching(from, to, callback) {
    return this._handleRange(from, kTo, to, kFrom, callback);
  }

  /**
   * @template P
   * @param {!Anchor} anchor1
   * @param {number} by1
   * @param {!Anchor} anchor2
   * @param {number} by2
   * @param {?function(!TreeNode|undefined):P} callback
   * @return {P}
   */
  _handleRange(anchor1, by1, anchor2, by2, callback) {
    let tmp = split(this._root, anchor1, by1);
    let tmp2 = split(tmp.right, anchor2, by2);
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
   * @param {!Array<!Decorator.Handle>|undefined} removed
   * @return {!TreeNode}
   */
  _process(root, from, to, inserted, removed) {
    let less = (offset, anchor) => anchor.end ? offset <= anchor.offset : offset < anchor.offset;
    let more = (offset, anchor) => anchor.end ? offset > anchor.offset : offset >= anchor.offset;

    let all = [];
    visit(root, all.push.bind(all));

    let result = undefined;
    for (let node of all) {
      let start = node.from;
      let end = node.to;
      if (less(from, start) && more(to, end)) {
        node.parent = undefined;
        if (removed)
          removed.push(node);
        continue;
      }

      if (!less(from, start) && !more(to, end)) {
        end.offset += inserted - (to - from);
      } else if (!more(from, start) && !less(to, start)) {
        start.offset = from + inserted;
        end.offset = from + inserted + (end.offset - to);
      } else if (!more(from, end) && !less(to, end)) {
        end.offset = from;
      } else if (!more(to, start)) {
        start.offset += inserted - (to - from);
        end.offset += inserted - (to - from);
      }

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
 * @extends Decorator<string>
 */
export class TextDecorator extends Decorator {
};

export class LineDecorator extends TextDecorator {
  /**
   * Decorations which should be visible on the scrollbar must have their own decorator.
   * The |style| is used for these decorations to decorate the scrollbar.
   * @param {string} style
   */
  constructor(style) {
    super();
    this._style = style;
  }

  /**
   * @return {string}
   */
  style() {
    return this._style;
  }

  /**
   * @override
   * @param {!Anchor} from
   * @param {!Anchor} to
   */
  add(from, to, data) {
    if (data !== undefined)
      throw new Error('LineDecorator only supports a single style passed in constructor');
    super.add(from, to, this._style);
  }
};
