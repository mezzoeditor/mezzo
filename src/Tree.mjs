import { Random } from "./Types.mjs";

/**
 * @param {function(!Object):!Object} initFrom
 * Inits any auxilary data for the node from another one,
 * not accounting for any subtrees.
 *
 * @param {function(!Object, !Object|undefined, !Object|undefined)} updateData
 * Updates auxilary data for node from it's left and right
 * subtree (possibly missing).
 *
 * @param {function(!Object):!Metrics} selfMetrics
 * Returns metrics for the node, not accounting for any subtrees.
 */
export let Tree = function(initFrom, updateData, selfMetrics) {
  let random = Random(42);

  /**
   * @typedef {{
   *   TODO: make first and lines optional (defaulting to last and 0).
   *   lines: number,
   *   chars: number,
   *   first: number,
   *   last: number
   * }} Metrics;
   */

  /**
   * @typedef {{
   *   metrics: !Metrics,
   *   left: !TreeNode|undefined,
   *   right: !TreeNode|undefined,
   *   h: number
   * }} TreeNode;
   */

  /**
   * @typedef {{
   *   char: number|undefined,
   *   line: number|undefined,
   *   column: number|undefined
   * }} Position;
   */


  /**
   * @param {!Position} position
   * @param {!Metrics} metrics
   * @return {!Position}
   */
  let advance = function(position, metrics) {
    return {
      char: position.char + metrics.chars,
      line: position.line + metrics.lines,
      column: metrics.last + (metrics.lines ? 0 : position.column)
    };
  };


  /**
   * @param {!Position} position
   * @param {!Position} key
   */
  let greater = function(position, key) {
    if (key.char !== undefined)
      return position.char > key.char;
    return position.line > key.line || (position.line === key.line && position.column > key.column);
  };


  /**
   * @param {!Position} position
   * @param {!Position} key
   */
  let greaterEqual = function(position, key) {
    if (key.char !== undefined)
      return position.char >= key.char;
    return position.line > key.line || (position.line === key.line && position.column >= key.column);
  };


  /**
   * @param {!TreeNode} node
   * @param {!TreeNode|undefined} left
   * @param {!TreeNode|undefined} right
   * @return {!TreeNode}
   */
  let setChildren = function(node, left, right) {
    if (left) {
      node.left = left;
      node.metrics.first = left.metrics.first + (left.metrics.lines ? 0 : node.metrics.first);
      node.metrics.last = node.metrics.last + (node.metrics.lines ? 0 : left.metrics.last);
      node.metrics.chars += left.metrics.chars;
      node.metrics.lines += left.metrics.lines;
    }
    if (right) {
      node.right = right;
      node.metrics.first = node.metrics.first + (node.metrics.lines ? 0 : right.metrics.first);
      node.metrics.last = right.metrics.last + (right.metrics.lines ? 0 : node.metrics.last);
      node.metrics.chars += right.metrics.chars;
      node.metrics.lines += right.metrics.lines;
    }
    updateData(node, left, right);
    return node;
  };


  /**
   * @param {!TreeNode} node
   * @return {!TreeNode}
   */
  let clone = function(node) {
    let result = initFrom(node);
    result.metrics = selfMetrics(result);
    result.h = node.h;
    return result;
  };


  /**
   * @param {!Object} node
   * @return {!TreeNode}
   */
  let wrap = function(node) {
    node.h = random();
    node.metrics = selfMetrics(node);
    return node;
  };


  /**
   * @param {!TreeNode} node
   * @return {!Position}
   */
  let end = function(root) {
    return {
      char: root.metrics.chars,
      line: root.metrics.lines,
      column: root.metrics.last
    };
  };


  /** @type {!Position} */
  let origin = { char: 0, line: 0, column: 0 };


  /**
   * @param {!Array<!TreeNode>} nodes
   * @return {!Array<!TreeNode>}
   */
  let build = function(nodes) {
    let stack = [];
    let p = Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      while (stack.length && nodes[stack[stack.length - 1]].h <= nodes[i].h)
        stack.pop();
      p[i] = stack.length ? stack[stack.length - 1] : -1;
      stack.push(i);
    }
    stack = [];

    let l = Array(nodes.length).fill(-1);
    let r = Array(nodes.length).fill(-1);
    let root = -1;
    for (let i = nodes.length - 1; i >= 0; i--) {
      while (stack.length && nodes[stack[stack.length - 1]].h <= nodes[i].h)
        stack.pop();
      let parent = stack.length ? stack[stack.length - 1] : -1;
      if (parent === -1 || (p[i] !== -1 && nodes[p[i]].h < nodes[parent].h))
        parent = p[i];
      if (parent === -1)
        root = i;
      else if (parent > i)
        l[parent] = i;
      else
        r[parent] = i;
      stack.push(i);
    }
    stack = [];

    function fill(i) {
      let left = l[i] === -1 ? undefined : fill(l[i]);
      let right = r[i] === -1 ? undefined : fill(r[i]);
      return setChildren(nodes[i], left, right);
    }
    return fill(root);
  };


  /**
   * @param {!TreeNode|undefined} root
   * @param {!Position} current
   * @param {!Position} key
   * @return {{left: !TreeNode|undefined, right: !TreeNode|undefined}}
   */
  let innerSplit = function(root, current, key) {
    if (!root)
      return {};
    if (greaterEqual(current, key))
      return {right: root};
    if (!greater(advance(current, root.metrics), key))
      return {left: root};

    let next = root.left ? advance(current, root.left.metrics) : current;
    next = advance(next, selfMetrics(root));
    if (!greater(next, key)) {
      let tmp = innerSplit(root.right, next, key);
      return {left: setChildren(clone(root), root.left, tmp.left), right: tmp.right};
    } else {
      let tmp = innerSplit(root.left, current, key);
      return {left: tmp.left, right: setChildren(clone(root), tmp.right, root.right)};
    }
  };


  /**
   * Left part contains all nodes up to key.
   * If node contains a key position inside, it will be returned in right part.
   * @param {!TreeNode|undefined} root
   * @param {!Position} key
   * @return {{left: !TreeNode|undefined, right: !TreeNode|undefined}}
   */
  let split = function(root, key) {
    return innerSplit(root, origin, key);
  };


  /**
   * @param {!TreeNode|undefined} left
   * @param {!TreeNode|undefined} right
   * @return {!TreeNode|undefined}
   */
  let merge = function(left, right) {
    if (!left)
      return right;
    if (!right)
      return left;
    if (left.h > right.h)
      return setChildren(clone(left), left.left, merge(left.right, right));
    else
      return setChildren(clone(right), merge(left, right.left), right.right);
  };


  /**
   * @param {!TreeNode} node
   * @param {!Position} key
   * @return {{node: !TreeNode, position: !Position}|undefined}
   */
  let find = function(node, key) {
    let current = origin;
    while (true) {
      if (node.left) {
        let next = advance(current, node.left.metrics);
        if (greater(next, key)) {
          node = node.left;
          continue;
        }
        current = next;
      }
      let next = advance(current, selfMetrics(node));
      if (greater(next, key))
        return {node, position: current};
      current = next;
      if (!node.right)
        return;
      node = node.right;
    }
  };


  /**
   * @param {!TreeNode} node
   * @param {function(!TreeNode)} visitor
   */
  let visit = function(node, visitor) {
    if (node.left)
      visit(node.left);
    visitor(node);
    if (node.right)
      visit(node.right);
  };


  return { wrap, build, split, merge, find, visit, end };
};
