import { Random } from '../utils/Random.js';

/**
 * @template D
 * @template V
 * @template K
 */
export class TreeFactory {
  /**
   * @param {Mezzo.OrderedMonoid<V, K>} monoid
   */
  constructor(monoid) {
    this._helpers = new TreeHelpers(monoid);
    this.test = {buildFromNodes: this._helpers.buildFromNodes.bind(this._helpers)};
  }

  /**
   * Constructs a tree from a sequence of values and data.
   * @param {Array<D>} data
   * @param {Array<V>} values
   * @return {Tree<D, K, V>}
   */
  build(data, values) {
    if (values.length !== data.length)
      throw new Error('Values and data must be of the same length');
    const nodes = [];
    for (let i = 0; i < values.length; i++)
      nodes.push({value: values[i], data: data[i], h: this._helpers.random()});
    return this._helpers.buildFromNodes(nodes);
  }

  /**
   * Constructs a tree by merging two other trees in the order left -> right.
   * Note that |left| and |right| are not invalidated and can be used
   * afterwards.
   * @param {Tree<D, K, V>} left
   * @param {Tree<D, K, V>} right
   * @return {Tree<D, K, V>}
   */
  merge(left, right) {
    return new Tree(this._helpers, this._helpers.mergeNodes(left._root, right._root));
  }
}

/**
 * @template D
 * @template K
 * @template V
 *
 * This is an immutable tree which efficiently calculates composition
 * for continuous ranges of the ordered monoid elements of type |V|.
 *
 * It also supports split and merge operations producing new trees, and lookup by
 * the key of type |K| in the ordered monoid.
 *
 * Each node in the tree contains some data of type |D| and a monoid element of
 * type |V|, called value.
 */
export class Tree {
  /**
   * @param {TreeHelpers} helpers
   * @param {TreeNode<D, V>=} root
   */
  constructor(helpers, root) {
    this._helpers = helpers;
    this._root = root;
  }

  /**
   * Returns a monoid element corresponding to the whole tree.
   * @return {V}
   */
  value() {
    return this._root ? this._root.value : this._helpers.identity;
  }

  /**
   * Creates an iterator. See TreeIterator.
   * @return {TreeIterator<D,V,K>}
   */
  iterator() {
    return new TreeIterator(this._helpers, this._root);
  }

  /**
   * Splits the tree by two lookup keys, putting the nodes containing |from| and |to|
   * to the middle part.
   * @param {K} from
   * @param {K} to
   * @return {{left: Tree<D,K,V>, right: Tree<D,K,V>, middle: Tree<D,K,V>}}
   */
  split(from, to) {
    let tmp = this._helpers.splitNodes(this._root, to, kSplitIntersectionToLeft, this._helpers.identity);
    const right = new Tree(this._helpers, tmp.right);
    tmp = this._helpers.splitNodes(tmp.left, from, kSplitIntersectionToRight, this._helpers.identity);
    const left = new Tree(this._helpers, tmp.left);
    const middle = new Tree(this._helpers, tmp.right);
    return {left, right, middle};
  }

  /**
   * Returns data of the first node.
   * @return {{data: ?D, value: ?V}}
   */
  first() {
    if (!this._root)
      return {data: null, value: null};
    let node = this._root;
    while (node.left) node = node.left;
    return {data: node.data, value: node.value};
  }

  /**
   * Returns data of the last node.
   * @return {{data: ?D, value: ?V}}
   */
  last() {
    if (!this._root)
      return {data: null, value: null};
    let node = this._root;
    while (node.right) node = node.right;
    return {data: node.data, value: node.value};
  }

  /**
   * Splits the first node of the tree if any.
   * @return {{data: ?D, value: ?V, tree: Tree<D,K,V>}}
   */
  splitFirst() {
    const tmp = this._helpers.splitFirstNode(this._root);
    return {
      data: tmp.left ? tmp.left.data : null,
      value: tmp.left ? tmp.left.value : null,
      tree: new Tree(this._helpers, tmp.right)
    };
  }

  /**
   * Splits the last node of the tree if any.
   * @return {{data: ?D, value: ?V, tree: Tree<D,K,V>}}
   */
  splitLast() {
    const tmp = this._helpers.splitLastNode(this._root);
    return {
      data: tmp.right ? tmp.right.data : null,
      value: tmp.right ? tmp.right.value : null,
      tree: new Tree(this._helpers, tmp.left)
    };
  }

  /**
   * Returns every node's data and value.
   * @return {Array<{data: D, value: V}>}
   */
  collect() {
    const list = [];
    if (this._root)
      this._helpers.collectNodes(this._root, list);
    return list;
  }
};

/**
 * Iterator points to a specific node of the Tree, position before the first node
 * or position after the last node. It provides current node's |value| and |data|,
 * as well as values |before| and |after| the node.
 *
 * When pointing after the last node, everything except |before| is undefined.
 * When pointing before the first node, everything except |after| is undefined.
 *
 * @template D
 * @template V
 * @template K
 */
export class TreeIterator {
  /**
   * @param {TreeHelpers} helpers
   * @param {TreeNode<D, V>|undefined} root
   */
  constructor(helpers, root) {
    this._helpers = helpers;

    /** @type {V|undefined} */
    this.before = undefined;

    /** @type {V|undefined} */
    this.after = undefined;

    /** @type {V|undefined} */
    this.value = undefined;

    /** @type {D|undefined} */
    this.data = undefined;

    /** @type {Array<{node: TreeNode<D, V>, value: V}>} */
    this._stack = null;

    /** @type {TreeNode<D, V>|undefined} */
    this._root = root;
  }

  /**
   * Clones this iterator, which can be used independetly from now on.
   * @return {TreeIterator}
   */
  clone() {
    let iterator = new TreeIterator(this._helpers, this._root);
    iterator.before = this.before;
    iterator.after = this.after;
    iterator.value = this.value;
    iterator.data = this.data;
    iterator._stack = this._stack.slice();
    return iterator;
  }

  /**
   * Moves iterator to a first node which covers |key|, or
   * to the position after the last node, if |key| is more than the
   * whole tree's value.
   * @param {K} key
   */
  locate(key) {
    this._helpers.locateIterator(this, key);
  }

  /**
   * Moves iterator to the next node or to the position after the last node.
   * Returns whether new position does point to a node.
   * @return {boolean}
   */
  next() {
    return this._helpers.iteratorNext(this);
  }

  /**
   * Moves iterator to the next node or to the position before the first node.
   * Returns whether new position does point to a node.
   * @return {boolean}
   */
  prev() {
    return this._helpers.iteratorPrev(this);
  }
};

/**
 * |value| is a composition over the whole subtree.
 * For non-leafs, |selfValue| is a monoid element for just that node.
 * |h| is a heap value for balancing the treap.
 *
 * @template D
 * @template V
 * @typedef {{
 *   data: D,
 *   value: V,
 *   h: number,
 *   selfValue?: V,
 *   left?: TreeNode<D, V>,
 *   right?: TreeNode<D, V>,
 * }} TreeNode
 */

const kSplitIntersectionToLeft = true;
const kSplitIntersectionToRight = false;


/**
 * @template D
 * @template K
 * @template V
 */
class TreeHelpers {
  /**
   * @param {Mezzo.OrderedMonoid<V, K>} monoid
   */
  constructor(monoid) {
    this.monoid = monoid;
    this.random = Random(42);
    this.identity = monoid.identityValue();
  }

  /**
   * @param {TreeNode<D, V>} node
   * @param {TreeNode<D, V>|undefined} left
   * @param {TreeNode<D, V>|undefined} right
   * @return {TreeNode<D, V>}
   */
  setChildren(node, left, right) {
    if (!node.selfValue && (left || right))
      node.selfValue = node.value;
    if (left) {
      node.left = left;
      node.value = this.monoid.combineValues(left.value, node.value);
    }
    if (right) {
      node.right = right;
      node.value = this.monoid.combineValues(node.value, right.value);
    }
    return node;
  }

  /**
   * Left part contains all nodes up to key.
   * If node contains a key anchor inside, it will be returned in right part,
   * unless |intersectionToLeft| is true.
   * @param {TreeNode<D, V>|undefined} root
   * @param {K} key
   * @param {boolean} intersectionToLeft
   * @param {V} current
   * @return {{left?: TreeNode<D, V>, right?: TreeNode<D, V>}}
   */
  splitNodes(root, key, intersectionToLeft, current) {
    if (!root)
      return {};
    const before = root.left ? this.monoid.combineValues(current, root.left.value) : current;
    const after = this.monoid.combineValues(before, root.selfValue !== undefined ? root.selfValue : root.value);
    const rootToLeft = this.monoid.valueGreaterOrEqualThanKey(before, key) ? false :
        (this.monoid.valueGreaterThanKey(after, key) ? intersectionToLeft === kSplitIntersectionToLeft : true);
    if (rootToLeft) {
      const tmp = this.splitNodes(root.right, key, intersectionToLeft, after);
      return {left: this.setChildren(this.clone(root), root.left, tmp.left), right: tmp.right};
    } else {
      const tmp = this.splitNodes(root.left, key, intersectionToLeft, current);
      return {left: tmp.left, right: this.setChildren(this.clone(root), tmp.right, root.right)};
    }
  }

  /**
   * @param {TreeNode<D, V>|undefined} root
   * @return {{left?: TreeNode<D, V>, right?: TreeNode<D, V>}}
   */
  splitFirstNode(root) {
    if (!root)
      return {};
    if (root.left) {
      const tmp = this.splitFirstNode(root.left);
      return {left: tmp.left, right: this.setChildren(this.clone(root), tmp.right, root.right)};
    } else {
      return {left: this.setChildren(this.clone(root), undefined, undefined), right: root.right};
    }
  }

  /**
   * @param {TreeNode<D, V>|undefined} root
   * @return {{left?: TreeNode<D, V>, right?: TreeNode<D, V>}}
   */
  splitLastNode(root) {
    if (!root)
      return {};
    if (root.right) {
      const tmp = this.splitLastNode(root.right);
      return {left: this.setChildren(this.clone(root), root.left, tmp.left), right: tmp.right};
    } else {
      return {left: root.left, right: this.setChildren(this.clone(root), undefined, undefined)};
    }
  }

  /**
   * @param {TreeNode<D, V>} node
   * @param {Array<{data: D, value: V}>} list
   */
  collectNodes(node, list) {
    if (node.left)
      this.collectNodes(node.left, list);
    list.push({data: node.data, value: node.selfValue !== undefined ? node.selfValue : node.value});
    if (node.right)
      this.collectNodes(node.right, list);
  }

  /**
   * @param {TreeNode<D, V>} node
   * @return {TreeNode<D, V>}
   */
  clone(node) {
    return {
      data: node.data,
      h: node.h,
      value: node.selfValue !== undefined ? node.selfValue : node.value
    };
  }

  /**
   * @param {Array<TreeNode<D, V>>} nodes
   * @return {Tree<D,K,V>}
   */
  buildFromNodes(nodes) {
    if (!nodes.length)
      return new Tree(this);
    if (nodes.length === 1)
      return new Tree(this, nodes[0]);

    const stack = new Int32Array(nodes.length);
    let stackLength = 0;
    const p = new Int32Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      while (stackLength && nodes[stack[stackLength - 1]].h <= nodes[i].h)
        stackLength--;
      p[i] = stackLength ? stack[stackLength - 1] : -1;
      stack[stackLength++] = i;
    }
    stackLength = 0;

    const l = new Int32Array(nodes.length);
    l.fill(-1);
    const r = new Int32Array(nodes.length);
    r.fill(-1);
    let root = -1;
    for (let i = nodes.length - 1; i >= 0; i--) {
      while (stackLength && nodes[stack[stackLength - 1]].h <= nodes[i].h)
        stackLength--;
      let parent = stackLength ? stack[stackLength - 1] : -1;
      if (parent === -1 || (p[i] !== -1 && nodes[p[i]].h < nodes[parent].h))
        parent = p[i];
      if (parent === -1)
        root = i;
      else if (parent > i)
        l[parent] = i;
      else
        r[parent] = i;
      stack[stackLength++] = i;
    }
    stackLength = 0;

    /**
     * @param {number} i
     * @return {!TreeNode<D, V>}
     */
    const fill = i => {
      let left = l[i] === -1 ? undefined : fill(l[i]);
      let right = r[i] === -1 ? undefined : fill(r[i]);
      return this.setChildren(nodes[i], left, right);
    };
    return new Tree(this, fill(root));
  }

  /**
   * @param {TreeNode<D, V>|undefined} left
   * @param {TreeNode<D, V>|undefined} right
   * @return {TreeNode<D, V>|undefined}
   */
  mergeNodes(left, right) {
    if (!left)
      return right;
    if (!right)
      return left;
    if (left.h > right.h)
      return this.setChildren(this.clone(left), left.left, this.mergeNodes(left.right, right));
    else
      return this.setChildren(this.clone(right), this.mergeNodes(left, right.left), right.right);
  }

  /**
   * @param {TreeIterator} iterator
   * @param {K} key
   */
  locateIterator(iterator, key) {
    if (!iterator._root)
      return;
    iterator._stack = [];
    let value = this.identity;
    let node = iterator._root;
    while (true) {
      iterator._stack.push({node, value});
      if (node.left) {
        const next = this.monoid.combineValues(value, node.left.value);
        if (this.monoid.valueGreaterOrEqualThanKey(next, key)) {
          node = node.left;
          continue;
        }
        value = next;
      }
      const next = this.monoid.combineValues(value, node.selfValue !== undefined ? node.selfValue : node.value);
      if (this.monoid.valueGreaterOrEqualThanKey(next, key)) {
        iterator.value = node.selfValue !== undefined ? node.selfValue : node.value;
        iterator.data = node.data;
        iterator.before = value;
        iterator.after = next;
        break;
      }
      if (!node.right) {
        iterator.value = undefined;
        iterator.data = undefined;
        iterator.before = next;
        iterator.after = undefined;
        break;
      }
      value = next;
      node = node.right;
    }

    if (iterator.before !== undefined && !this.monoid.valueGreaterOrEqualThanKey(iterator.before, key) &&
        iterator.after !== undefined && !this.monoid.valueGreaterThanKey(iterator.after, key)) {
      iterator.next();
    }
  }

  /**
   * @param {TreeIterator} iterator
   * @return {boolean}
   */
  iteratorNext(iterator) {
    if (!iterator._root || iterator.after === undefined)
      return false;

    let {node, value} = iterator._stack[iterator._stack.length - 1];
    if (iterator.before === undefined) {
      // |node| is a first node already.
    } else if (node.right) {
      if (node.left)
        value = this.monoid.combineValues(value, node.left.value);
      value = this.monoid.combineValues(value, node.selfValue !== undefined ? node.selfValue : node.value);
      node = node.right;
      while (true) {
        iterator._stack.push({node, value});
        if (!node.left)
          break;
        node = node.left;
      }
    } else {
      let len = iterator._stack.length;
      while (len > 1 && iterator._stack[len - 2].node.right === iterator._stack[len - 1].node)
        len--;
      if (len === 1) {
        iterator.value = undefined;
        iterator.data = undefined;
        iterator.before = iterator.after;
        iterator.after = undefined;
        return false;
      }
      node = iterator._stack[len - 2].node;
      value = iterator._stack[len - 2].value;
      iterator._stack.length = len - 1;
    }

    if (node.left)
      value = this.monoid.combineValues(value, node.left.value);
    iterator.value = node.selfValue !== undefined ? node.selfValue : node.value;
    iterator.data = node.data;
    iterator.before = iterator.after;
    iterator.after = this.monoid.combineValues(value, iterator.value);
    return true;
  }

  /**
   * @param {TreeIterator} iterator
   * @return {boolean}
   */
  iteratorPrev(iterator) {
    if (!iterator._root || iterator.before === undefined)
      return false;

    let {node, value} = iterator._stack[iterator._stack.length - 1];
    if (iterator.after === undefined) {
      // |node| is a last node already.
    } else if (node.left) {
      node = node.left;
      while (true) {
        iterator._stack.push({node, value});
        if (!node.right)
          break;
        if (node.left)
          value = this.monoid.combineValues(value, node.left.value);
        value = this.monoid.combineValues(value, node.selfValue !== undefined ? node.selfValue : node.value);
        node = node.right;
      }
    } else {
      let len = iterator._stack.length;
      while (len > 1 && iterator._stack[len - 2].node.left === iterator._stack[len - 1].node)
        len--;
      if (len === 1) {
        iterator.value = undefined;
        iterator.data = undefined;
        iterator.after = iterator.before;
        iterator.before = undefined;
        return false;
      }
      node = iterator._stack[len - 2].node;
      value = iterator._stack[len - 2].value;
      iterator._stack.length = len - 1;
    }

    if (node.left)
      value = this.monoid.combineValues(value, node.left.value);
    iterator.value = node.selfValue !== undefined ? node.selfValue : node.value;
    iterator.data = node.data;
    iterator.after = iterator.before;
    iterator.before = value;
    return true;
  }
}
