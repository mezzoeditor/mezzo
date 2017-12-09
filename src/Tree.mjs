import { Random } from "./Types.mjs";

export let Tree = function(initFrom, combineTo, selfSize) {
  let random = Random(42);

  /**
   * @typedef {{
   *   size: number,
   *   left: !TreeNode|undefined,
   *   right: !TreeNode|undefined,
   *   h: number,
   * }} TreeNode;
   */

  /**
   * @param {!TreeNode} node
   * @param {!TreeNode|undefined} left
   * @param {!TreeNode|undefined} right
   * @return {!TreeNode}
   */
  let setChildren = function(node, left, right) {
    if (left) {
      node.left = left;
      node.size += left.size;
      combineTo(node.left, node);
    }
    if (right) {
      node.right = right;
      node.size += right.size;
      combineTo(node.right, node);
    }
    return node;
  };


  /**
   * @param {!TreeNode} node
   * @return {!TreeNode}
   */
  let clone = function(node) {
    let result = initFrom(node);
    result.h = node.h;
    result.size = selfSize(result);
    return result;
  };


  /**
   * @param {!Object} node
   * @return {!TreeNode}
   */
  let wrap = function(node) {
    node.size = selfSize(node);
    node.h = random();
    return node;
  };


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
   * Left part contains all nodes up to (value - 1);
   * @param {!TreeNode|undefined} root
   * @param {number} value
   * @return {{left: !TreeNode|undefined, right: !TreeNode|undefined}}
   */
  let split = function(root, value) {
    if (!root)
      return {};
    if (value >= root.size)
      return {left: root};
    if (value < 0)
      return {right: root};

    let leftSize = root.left ? root.left.size : 0;
    if (leftSize < value) {
      let tmp = split(root.right, value - leftSize - 1);
      return {left: setChildren(clone(root), root.left, tmp.left), right: tmp.right};
    } else {
      let tmp = split(root.left, value);
      return {left: tmp.left, right: setChildren(clone(root), tmp.right, root.right)};
    }
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
   * @return {number}
   */
  let size = function(node) {
    return node.size;
  };

  /**
   * @param {number} value
   * @return {!TreeNode|undefined}
   */
  let find = function(root, value) {
    while (true) {
      if (root.left) {
        if (root.left.size > value) {
          root = root.left;
          continue;
        }
        value -= root.left.size;
      }
      let self = selfSize(root);
      if (self > value)
        return root;
      value -= self;
      if (!root.right)
        return;
      root = root.right;
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
  }

  return { wrap, build, split, merge, size, find, visit };
};
