import {Tree} from './Tree.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('Tree', () => {
    it('empty tree', () => {
      const emptyMetrics = {length: 0, firstWidth: 0, lastWidth: 0, longestWidth: 0};
      let tree = new Tree();
      expect(tree.metrics()).toEqual(emptyMetrics);
      expect(tree.collect()).toEqual([]);

      let {left, right, middle} = tree.split(5, 25);
      expect(left.metrics()).toEqual(emptyMetrics);
      expect(right.metrics()).toEqual(emptyMetrics);
      expect(middle.metrics()).toEqual(emptyMetrics);

      let {first, rest} = tree.splitFirst();
      expect(first).toBe(null);
      expect(rest.metrics()).toEqual(emptyMetrics);

      let {last} = tree.splitLast();
      expect(last).toBe(null);

      let another = Tree.merge(tree, new Tree());
      expect(another.metrics()).toEqual(emptyMetrics);
    });

    it('merge', () => {
      const metrics0 = {length: 0, firstWidth: 0, lastWidth: 0, longestWidth: 0};
      const metrics1 = {length: 3, firstWidth: 5, lastWidth: 7, lineBreaks: 2, longestWidth: 7};
      const metrics2 = {length: 0, firstWidth: 4, lastWidth: 4, longestWidth: 4};
      const metrics3 = {length: 5, firstWidth: 0, lastWidth: 0, lineBreaks: 4, longestWidth: 15};
      const metrics4 = {length: 1, firstWidth: 25, lastWidth: 27, lineBreaks: 5, longestWidth: 27};
      const node1 = {data: 1, metrics: metrics1};
      const node2 = {data: 2, metrics: metrics2};
      const node3 = {data: 3, metrics: metrics3};
      const node4 = {data: 4, metrics: metrics4};
      const metrics12 = Tree.combineMetrics(metrics1, metrics2);
      const metrics124 = Tree.combineMetrics(metrics12, metrics4);
      const metrics31 = Tree.combineMetrics(metrics3, metrics1);
      const metrics24 = Tree.combineMetrics(metrics2, metrics4);
      const metrics3124 = Tree.combineMetrics(metrics31, metrics24);
      const metrics43 = Tree.combineMetrics(metrics4, metrics3);
      const metrics43012 = Tree.combineMetrics(metrics43, metrics12);
      const metrics300303 = Tree.combineMetrics(metrics3, Tree.combineMetrics(metrics3, metrics3));

      let tree12 = Tree.build([{data: 1, metrics: metrics1}, {data: 2, metrics: metrics2}]);
      expect(tree12.metrics()).toEqual(metrics12);
      expect(tree12.collect()).toEqual([node1, node2]);
      let tree3 = Tree.build([{data: 3, metrics: metrics3}]);
      expect(tree3.metrics()).toEqual(metrics3);
      expect(tree3.collect()).toEqual([node3]);
      let tree0 = Tree.build([]);
      expect(tree0.metrics()).toEqual(metrics0);
      expect(tree0.collect()).toEqual([]);
      let tree4 = Tree.build([{data: 4, metrics: metrics4}]);
      expect(tree4.metrics()).toEqual(metrics4);
      expect(tree4.collect()).toEqual([node4]);

      let tree012 = Tree.merge(tree0, tree12);
      expect(tree012.metrics()).toEqual(metrics12);
      expect(tree012.collect()).toEqual([node1, node2]);
      let tree124 = Tree.merge(tree12, tree4);
      expect(tree124.metrics()).toEqual(metrics124);
      expect(tree124.collect()).toEqual([node1, node2, node4]);
      let tree3124 = Tree.merge(tree3, tree124);
      expect(tree3124.metrics()).toEqual(metrics3124);
      expect(tree3124.collect()).toEqual([node3, node1, node2, node4]);

      let tree43 = Tree.merge(tree4, tree3);
      expect(tree43.metrics()).toEqual(metrics43);
      expect(tree43.collect()).toEqual([node4, node3]);
      let tree43012 = Tree.merge(tree43, tree012);
      expect(tree43012.metrics()).toEqual(metrics43012);
      expect(tree43012.collect()).toEqual([node4, node3, node1, node2]);

      let tree30 = Tree.merge(tree3, tree0);
      let tree300303 = Tree.merge(tree30, Tree.merge(tree0, Tree.merge(tree30, tree3)));
      expect(tree300303.metrics()).toEqual(metrics300303);
      expect(tree300303.collect()).toEqual([node3, node3, node3]);
    });

    it('split', () => {
      const metrics1 = {length: 3, firstWidth: 5, lastWidth: 7, lineBreaks: 2, longestWidth: 7};
      const metrics2 = {length: 0, firstWidth: 4, lastWidth: 4, longestWidth: 4};
      const metrics0 = {length: 0, firstWidth: 0, lastWidth: 0, longestWidth: 0};
      const metrics3 = {length: 5, firstWidth: 0, lastWidth: 0, lineBreaks: 4, longestWidth: 15};
      const metrics4 = {length: 1, firstWidth: 25, lastWidth: 27, lineBreaks: 5, longestWidth: 27};
      //const metrics0 = {length: 0, firstWidth: 0, lastWidth: 0, longestWidth: 0};
      const node1 = {data: 1, metrics: metrics1};
      const node2 = {data: 2, metrics: metrics2};
      const node0 = {data: 0, metrics: metrics0};
      const node3 = {data: 3, metrics: metrics3};
      const node4 = {data: 4, metrics: metrics4};
      let tmp;

      let tree = Tree.build([
        {data: 1, metrics: metrics1}, {data: 2, metrics: metrics2},
        {data: 0, metrics: metrics0}, {data: 3, metrics: metrics3},
        {data: 4, metrics: metrics4}, {data: 0, metrics: metrics0},
      ]);
      expect(tree.collect()).toEqual([node1, node2, node0, node3, node4, node0]);

      tmp = tree.split(0, 0);
      expect(tmp.left.collect()).toEqual([]);
      expect(tmp.middle.collect()).toEqual([]);
      expect(tmp.right.collect()).toEqual([node1, node2, node0, node3, node4, node0]);

      tmp = tree.split(0, 3);
      expect(tmp.left.collect()).toEqual([]);
      expect(tmp.middle.collect()).toEqual([node1, node2, node0]);
      expect(tmp.right.collect()).toEqual([node3, node4, node0]);

      tmp = tree.split(2, 5);
      expect(tmp.left.collect()).toEqual([]);
      expect(tmp.middle.collect()).toEqual([node1, node2, node0, node3]);
      expect(tmp.right.collect()).toEqual([node4, node0]);

      tmp = tree.split(3, 8);
      expect(tmp.left.collect()).toEqual([node1]);
      expect(tmp.middle.collect()).toEqual([node2, node0, node3]);
      expect(tmp.right.collect()).toEqual([node4, node0]);

      tmp = tree.split(7, 7);
      expect(tmp.left.collect()).toEqual([node1, node2, node0]);
      expect(tmp.middle.collect()).toEqual([node3]);
      expect(tmp.right.collect()).toEqual([node4, node0]);

      tmp = tree.split(3, 9);
      expect(tmp.left.collect()).toEqual([node1]);
      expect(tmp.middle.collect()).toEqual([node2, node0, node3, node4, node0]);
      expect(tmp.right.collect()).toEqual([]);

      tmp = tree.split(12, 15);
      expect(tmp.left.collect()).toEqual([node1, node2, node0, node3, node4, node0]);
      expect(tmp.middle.collect()).toEqual([]);
      expect(tmp.right.collect()).toEqual([]);
    });

    it('iterator', () => {
      const metrics0 = {length: 0, firstWidth: 0, lastWidth: 0, longestWidth: 0};
      const metrics1 = {length: 3, firstWidth: 5, lastWidth: 7, lineBreaks: 2, longestWidth: 7};
      const metrics2 = {length: 0, firstWidth: 4, lastWidth: 4, longestWidth: 4};
      const metrics3 = {length: 5, firstWidth: 0, lastWidth: 0, lineBreaks: 4, longestWidth: 15};
      const metrics4 = {length: 1, firstWidth: 25, lastWidth: 27, lineBreaks: 5, longestWidth: 27};
      const nodes = [
        {h: -4, data: 'lll', metrics: metrics4},
          {h: -3, data: 'll', metrics: metrics3},
            {h: -2, data: 'l', metrics: metrics2},
        {h: -4, data: 'lrl', metrics: metrics2},
          {h: -3, data: 'lr', metrics: metrics0},
              {h: -1, data: '', metrics: metrics1},
        {h: -4, data: 'rll', metrics: metrics1},
          {h: -3, data: 'rl', metrics: metrics4},
        {h: -4, data: 'rlr', metrics: metrics4},
            {h: -2, data: 'r', metrics: metrics3},
          {h: -3, data: 'rr', metrics: metrics1},
        {h: -4, data: 'rrr', metrics: metrics0},
      ];

      let advance = (location, metrics) => {
        return {
          offset: location.offset + metrics.length,
          y: location.y + (metrics.lineBreaks || 0),
          x: metrics.lastWidth + (metrics.lineBreaks ? 0 : location.x)
        };
      };

      let before = [];
      for (let i = 0; i < nodes.length; i++) {
        if (!i)
          before.push({x: 0, y: 0, offset: 0});
        else
          before.push(advance(before[i - 1], nodes[i - 1].metrics));
      }
      let total = advance(before[nodes.length - 1], nodes[nodes.length - 1].metrics);

      let tree = Tree.test.build(nodes.map(x => ({h: x.h, data: x.data, metrics: x.metrics})));
      let iterator = tree.iterator();
      for (let start = -1; start <= total.offset + 1; start++) {
        let i = 0;
        while (i < nodes.length && before[i].offset + nodes[i].metrics.length <= start)
          i++;

        expect(iterator.locateByOffset(start, false /* strict */)).toBe(Math.max(0, Math.min(start, total.offset)));
        for (let j = i; j < nodes.length; j++) {
          expect(iterator.before).toEqual(before[j]);
          expect(iterator.data).toBe(nodes[j].data);
          expect(iterator.metrics).toEqual(nodes[j].metrics);
          expect(iterator.after).toEqual(advance(before[j], nodes[j].metrics));
          expect(iterator.next()).toBe(j + 1 < nodes.length);
        }
        expect(iterator.before).toEqual(total);
        expect(iterator.data).toBe(undefined);
        expect(iterator.metrics).toBe(undefined);
        expect(iterator.after).toBe(undefined);
        expect(iterator.next()).toBe(false);
        expect(iterator.before).toEqual(total);

        expect(iterator.locateByOffset(start, false /* strict */)).toBe(Math.max(0, Math.min(start, total.offset)));
        if (i === nodes.length) {
          expect(iterator.before).toEqual(total);
          expect(iterator.data).toBe(undefined);
          expect(iterator.metrics).toBe(undefined);
          expect(iterator.after).toBe(undefined);
          expect(iterator.prev()).toBe(true);
          i--;
        }
        for (let j = i; j >= 0; j--) {
          expect(iterator.before).toEqual(before[j]);
          expect(iterator.data).toBe(nodes[j].data);
          expect(iterator.metrics).toEqual(nodes[j].metrics);
          expect(iterator.after).toEqual(advance(before[j], nodes[j].metrics));
          expect(iterator.prev()).toBe(j > 0);
        }
        expect(iterator.before).toBe(undefined);
        expect(iterator.data).toBe(undefined);
        expect(iterator.metrics).toBe(undefined);
        expect(iterator.after).toEqual({x: 0, y: 0, offset: 0});
        expect(iterator.prev()).toBe(false);
        expect(iterator.after).toEqual({x: 0, y: 0, offset: 0});
      }
    });
  });
}
