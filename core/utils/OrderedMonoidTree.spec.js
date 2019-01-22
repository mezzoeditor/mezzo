import { TreeFactory } from './OrderedMonoidTree.js';

class TestMonoid {
  identityValue() {
    return 0;
  }

  combineValues(a, b) {
    return a + b;
  }

  valueGreaterThanKey(e, k) {
    return e > k;
  }

  valueGreaterOrEqualThanKey(e, k) {
    return e >= k;
  }
};

const monoid = new TestMonoid();
const identity = monoid.identityValue();

const treeFactory = new TreeFactory(monoid);

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('OrderedMonoidTree', () => {
    it('empty tree', () => {
      const tree = treeFactory.build([], []);
      expect(tree.value()).toBe(identity);
      expect(tree.collect()).toBe([]);

      const {left, right, middle} = tree.split(5, 25);
      expect(left.value()).toBe(identity);
      expect(right.value()).toBe(identity);
      expect(middle.value()).toBe(identity);

      const tmp1 = tree.splitFirst();
      expect(tmp1.data).toBe(null);
      expect(tmp1.tree.value()).toBe(identity);

      const tmp2 = tree.splitLast();
      expect(tmp2.data).toBe(null);
      expect(tmp2.tree.value()).toBe(identity);

      const another = treeFactory.merge(tree, treeFactory.build([], []));
      expect(another.value()).toBe(identity);
    });

    it('merge', () => {
      const node1 = {data: 'd1', value: 1};
      const node2 = {data: 'd2', value: 2};
      const node3 = {data: 'd3', value: 3};
      const node4 = {data: 'd4', value: 4};

      const tree12 = treeFactory.build(['d1', 'd2'], [1, 2]);
      expect(tree12.value()).toBe(1 + 2);
      expect(tree12.collect()).toBe([node1, node2]);
      const tree3 = treeFactory.build(['d3'], [3]);
      expect(tree3.value()).toBe(3);
      expect(tree3.collect()).toBe([node3]);
      const tree0 = treeFactory.build([], []);
      expect(tree0.value()).toBe(0);
      expect(tree0.collect()).toBe([]);
      const tree4 = treeFactory.build(['d4'], [4]);
      expect(tree4.value()).toBe(4);
      expect(tree4.collect()).toBe([node4]);

      const tree012 = treeFactory.merge(tree0, tree12);
      expect(tree012.value()).toBe(0 + 1 + 2);
      expect(tree012.collect()).toBe([node1, node2]);
      const tree124 = treeFactory.merge(tree12, tree4);
      expect(tree124.value()).toBe(1 + 2 + 4);
      expect(tree124.collect()).toBe([node1, node2, node4]);
      const tree3124 = treeFactory.merge(tree3, tree124);
      expect(tree3124.value()).toBe(3 + 1 + 2 + 4);
      expect(tree3124.collect()).toBe([node3, node1, node2, node4]);

      const tree43 = treeFactory.merge(tree4, tree3);
      expect(tree43.value()).toBe(4 + 3);
      expect(tree43.collect()).toBe([node4, node3]);
      const tree43012 = treeFactory.merge(tree43, tree012);
      expect(tree43012.value()).toBe(4 + 3 + 0 + 1 + 2);
      expect(tree43012.collect()).toBe([node4, node3, node1, node2]);

      const tree30 = treeFactory.merge(tree3, tree0);
      const tree300303 = treeFactory.merge(tree30, treeFactory.merge(tree0, treeFactory.merge(tree30, tree3)));
      expect(tree300303.value()).toBe(3 + 0 + 0 + 3 + 0 + 3);
      expect(tree300303.collect()).toBe([node3, node3, node3]);
    });

    it('split', () => {
      const values = [3, 0, 0, 5, 1, 0];
      const node1 = {data: 'd1', value: values[0]};
      const node2 = {data: 'd2', value: values[1]};
      const node3 = {data: 'd3', value: values[2]};
      const node4 = {data: 'd4', value: values[3]};
      const node5 = {data: 'd5', value: values[4]};
      const node6 = {data: 'd6', value: values[5]};
      let tmp;

      const tree = treeFactory.build(['d1', 'd2', 'd3', 'd4', 'd5', 'd6'], values);
      expect(tree.collect()).toBe([node1, node2, node3, node4, node5, node6]);

      tmp = tree.split(0, 0);
      expect(tmp.left.collect()).toBe([]);
      expect(tmp.middle.collect()).toBe([]);
      expect(tmp.right.collect()).toBe([node1, node2, node3, node4, node5, node6]);

      tmp = tree.split(0, 3);
      expect(tmp.left.collect()).toBe([]);
      expect(tmp.middle.collect()).toBe([node1]);
      expect(tmp.right.collect()).toBe([node2, node3, node4, node5, node6]);

      tmp = tree.split(2, 5);
      expect(tmp.left.collect()).toBe([]);
      expect(tmp.middle.collect()).toBe([node1, node2, node3, node4]);
      expect(tmp.right.collect()).toBe([node5, node6]);

      tmp = tree.split(3, 8);
      expect(tmp.left.collect()).toBe([node1]);
      expect(tmp.middle.collect()).toBe([node2, node3, node4]);
      expect(tmp.right.collect()).toBe([node5, node6]);

      tmp = tree.split(7, 7);
      expect(tmp.left.collect()).toBe([node1, node2, node3]);
      expect(tmp.middle.collect()).toBe([node4]);
      expect(tmp.right.collect()).toBe([node5, node6]);

      tmp = tree.split(3, 9);
      expect(tmp.left.collect()).toBe([node1]);
      expect(tmp.middle.collect()).toBe([node2, node3, node4, node5]);
      expect(tmp.right.collect()).toBe([node6]);

      tmp = tree.split(12, 15);
      expect(tmp.left.collect()).toBe([node1, node2, node3, node4, node5, node6]);
      expect(tmp.middle.collect()).toBe([]);
      expect(tmp.right.collect()).toBe([]);
    });

    it('iterator', () => {
      const nodes = [
        {h: -4, data: 'lll', value: 1},
          {h: -3, data: 'll', value: 5},
            {h: -2, data: 'l', value: 0},
        {h: -4, data: 'lrl', value: 0},
          {h: -3, data: 'lr', value: 0},
              {h: -1, data: '', value: 3},
        {h: -4, data: 'rll', value: 3},
          {h: -3, data: 'rl', value: 1},
        {h: -4, data: 'rlr', value: 1},
            {h: -2, data: 'r', value: 5},
          {h: -3, data: 'rr', value: 3},
        {h: -4, data: 'rrr', value: 0},
      ];

      const before = [];
      for (let i = 0; i <= nodes.length; i++) {
        if (!i)
          before.push(identity);
        else
          before.push(monoid.combineValues(before[i - 1], nodes[i - 1].value));
      }
      const total = before[nodes.length];

      const tree = treeFactory.test.buildFromNodes(nodes.map(x => ({h: x.h, data: x.data, value: x.value})));
      const iterator = tree.iterator();
      for (let start = -1; start <= total + 1; start++) {
        let i = 0;
        while (i < nodes.length &&
               before[i] + nodes[i].value <= start &&
               before[i] < start) {
          i++;
        }

        iterator.locate(start);
        for (let j = i; j < nodes.length; j++) {
          expect(iterator.before).toBe(before[j]);
          expect(iterator.data).toBe(nodes[j].data);
          expect(iterator.value).toBe(nodes[j].value);
          expect(iterator.after).toBe(before[j + 1]);
          expect(iterator.next()).toBe(j + 1 < nodes.length);
        }
        expect(iterator.before).toBe(total);
        expect(iterator.data).toBe(undefined);
        expect(iterator.value).toBe(undefined);
        expect(iterator.after).toBe(undefined);
        expect(iterator.next()).toBe(false);
        expect(iterator.before).toBe(total);

        iterator.locate(start);
        if (i === nodes.length) {
          expect(iterator.before).toBe(total);
          expect(iterator.data).toBe(undefined);
          expect(iterator.value).toBe(undefined);
          expect(iterator.after).toBe(undefined);
          expect(iterator.prev()).toBe(true);
          i--;
        }
        for (let j = i; j >= 0; j--) {
          expect(iterator.before).toBe(before[j]);
          expect(iterator.data).toBe(nodes[j].data);
          expect(iterator.value).toBe(nodes[j].value);
          expect(iterator.after).toBe(before[j + 1]);
          expect(iterator.prev()).toBe(j > 0);
        }
        expect(iterator.before).toBe(undefined);
        expect(iterator.data).toBe(undefined);
        expect(iterator.value).toBe(undefined);
        expect(iterator.after).toBe(identity);
        expect(iterator.prev()).toBe(false);
        expect(iterator.after).toBe(identity);
      }
    });

    it('anchors 1', () => {
      const tree = treeFactory.build(['d1', 'd2'], [1.5, 2]);
      const iterator = tree.iterator();

      iterator.locate(0);
      expect(iterator.before).toBe(0);
      expect(iterator.data).toBe('d1');
      expect(iterator.value).toBe(1.5);
      expect(iterator.after).toBe(1.5);

      iterator.prev();
      expect(iterator.before).toBe(undefined);
      expect(iterator.data).toBe(undefined);
      expect(iterator.value).toBe(undefined);
      expect(iterator.after).toBe(0);

      iterator.locate(1);
      expect(iterator.before).toBe(0);
      expect(iterator.data).toBe('d1');
      expect(iterator.value).toBe(1.5);
      expect(iterator.after).toBe(1.5);

      iterator.locate(2);
      expect(iterator.before).toBe(1.5);
      expect(iterator.data).toBe('d2');
      expect(iterator.value).toBe(2);
      expect(iterator.after).toBe(3.5);

      iterator.locate(2.5);
      expect(iterator.before).toBe(1.5);
      expect(iterator.data).toBe('d2');
      expect(iterator.value).toBe(2);
      expect(iterator.after).toBe(3.5);

      iterator.locate(3.5);
      expect(iterator.before).toBe(3.5);
      expect(iterator.data).toBe(undefined);
      expect(iterator.value).toBe(undefined);
      expect(iterator.after).toBe(undefined);
    });

    it('anchors 2', () => {
      const tree = treeFactory.build(['d1', 'd2', 'd3'], [1, 0, 1]);
      const iterator = tree.iterator();
      let tmp;

      iterator.locate(1);
      expect(iterator.before).toBe(1);
      expect(iterator.data).toBe('d2');
      expect(iterator.value).toBe(0);
      expect(iterator.after).toBe(1);

      iterator.locate(1.5);
      expect(iterator.before).toBe(1);
      expect(iterator.data).toBe('d3');
      expect(iterator.value).toBe(1);
      expect(iterator.after).toBe(2);

      iterator.locate(2);
      expect(iterator.before).toBe(2);
      expect(iterator.data).toBe(undefined);
      expect(iterator.value).toBe(undefined);
      expect(iterator.after).toBe(undefined);

      tmp = tree.split(1, 1);
      expect(tmp.left.collect().map(n => n.data)).toBe(['d1']);
      expect(tmp.middle.collect().map(n => n.data)).toBe([]);
      expect(tmp.right.collect().map(n => n.data)).toBe(['d2', 'd3']);

      tmp = tree.split(1, 1.5);
      expect(tmp.left.collect().map(n => n.data)).toBe(['d1']);
      expect(tmp.middle.collect().map(n => n.data)).toBe(['d2', 'd3']);
      expect(tmp.right.collect().map(n => n.data)).toBe([]);

      tmp = tree.split(1.5, 1.5);
      expect(tmp.left.collect().map(n => n.data)).toBe(['d1', 'd2']);
      expect(tmp.middle.collect().map(n => n.data)).toBe(['d3']);
      expect(tmp.right.collect().map(n => n.data)).toBe([]);

      tmp = tree.split(1.5, 2);
      expect(tmp.left.collect().map(n => n.data)).toBe(['d1', 'd2']);
      expect(tmp.middle.collect().map(n => n.data)).toBe(['d3']);
      expect(tmp.right.collect().map(n => n.data)).toBe([]);

      tmp = tree.split(2, 2);
      expect(tmp.left.collect().map(n => n.data)).toBe(['d1', 'd2', 'd3']);
      expect(tmp.middle.collect().map(n => n.data)).toBe([]);
      expect(tmp.right.collect().map(n => n.data)).toBe([]);
    });

    it('anchors 3', () => {
      const tree = treeFactory.build(['d1', 'd2', 'd3'], [1.5, 0, 0.5]);
      const iterator = tree.iterator();
      let tmp;

      iterator.locate(1);
      expect(iterator.before).toBe(0);
      expect(iterator.data).toBe('d1');
      expect(iterator.value).toBe(1.5);
      expect(iterator.after).toBe(1.5);

      iterator.locate(1.5);
      expect(iterator.before).toBe(1.5);
      expect(iterator.data).toBe('d2');
      expect(iterator.value).toBe(0);
      expect(iterator.after).toBe(1.5);

      iterator.locate(2);
      expect(iterator.before).toBe(2);
      expect(iterator.data).toBe(undefined);
      expect(iterator.value).toBe(undefined);
      expect(iterator.after).toBe(undefined);

      tmp = tree.split(1, 1);
      expect(tmp.left.collect().map(n => n.data)).toBe([]);
      expect(tmp.middle.collect().map(n => n.data)).toBe(['d1']);
      expect(tmp.right.collect().map(n => n.data)).toBe(['d2', 'd3']);

      tmp = tree.split(1, 1.5);
      expect(tmp.left.collect().map(n => n.data)).toBe([]);
      expect(tmp.middle.collect().map(n => n.data)).toBe(['d1']);
      expect(tmp.right.collect().map(n => n.data)).toBe(['d2', 'd3']);

      tmp = tree.split(1.5, 1.5);
      expect(tmp.left.collect().map(n => n.data)).toBe(['d1']);
      expect(tmp.middle.collect().map(n => n.data)).toBe([]);
      expect(tmp.right.collect().map(n => n.data)).toBe(['d2', 'd3']);

      tmp = tree.split(1.5, 2);
      expect(tmp.left.collect().map(n => n.data)).toBe(['d1']);
      expect(tmp.middle.collect().map(n => n.data)).toBe(['d2', 'd3']);
      expect(tmp.right.collect().map(n => n.data)).toBe([]);

      tmp = tree.split(2, 2);
      expect(tmp.left.collect().map(n => n.data)).toBe(['d1', 'd2', 'd3']);
      expect(tmp.middle.collect().map(n => n.data)).toBe([]);
      expect(tmp.right.collect().map(n => n.data)).toBe([]);
    });
  });
}
