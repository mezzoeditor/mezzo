import { RangeTree } from './RangeTree.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('RangeTree', () => {
    function checkOne(got, expected) {
      if (!expected) {
        expect(got).toBe(null);
      } else {
        expect(got.from).toBe(expected.from);
        expect(got.to).toBe(expected.to);
        expect(got.data).toBe(expected.data);
      }
    }

    function checkList(got, expected) {
      expect(got.length).toBe(expected.length);
      for (let i = 0; i < got.length; i++)
        checkOne(got[i], expected[i]);
    }

    function checkVisitor(callback, expected) {
      let got = [];
      callback(got.push.bind(got));
      checkList(got, expected);
    }

    it('getters', () => {
      const tree = new RangeTree(true /* createHandles */);
      const a = {from: 0.5, to: 1, data: 'a'};
      const b = {from: 0, to: 0.5, data: 'b'};
      const c = {from: 2, to: 3, data: 'c'};
      const d = {from: 15.5, to: 33, data: 'd'};
      const e = {from: 8.5, to: 12.5, data: 'e'};
      const f = {from: 8, to: 8, data: 'f'};
      const g = {from: 12.5, to: 12.5, data: 'g'};
      const h = {from: 1, to: 1, data: 'h'};
      const i = {from: 1.5, to: 1.5, data: 'i'};
      const j = {from: 1.5, to: 1.5, data: 'j'};
      for (const x of [a, b, c, d, e, f, g, h, i, j])
        x.handle = tree.add(x.from, x.to, x.data);

      const all = [b, a, h, i, j, c, f, e, g, d];
      checkList(tree.listAll(), all);
      expect(tree.countAll()).toBe(all.length);
      checkOne(tree.firstAll(), all[0]);
      checkOne(tree.lastAll(), all[all.length - 1]);
      checkVisitor(v => tree.visitAll(v), all);
      for (const x of all)
        checkOne(tree.resolve(x.handle), x);

      function checkStarting(from, to) {
        const list = [];
        for (const d of all) {
          if (d.from >= from && d.from < to)
            list.push(d);
        }
        checkList(tree.listStarting(from, to), list);
        expect(tree.countStarting(from, to)).toBe(list.length);
        checkOne(tree.firstStarting(from, to), list[0] || null);
        checkOne(tree.lastStarting(from, to), list[list.length - 1] || null);
        checkVisitor(v => tree.visitStarting(from, to, v), list);
      }

      function checkEnding(from, to) {
        const list = [];
        for (const d of all) {
          if (d.to >= from && d.to < to)
            list.push(d);
        }
        checkList(tree.listEnding(from, to), list);
        expect(tree.countEnding(from, to)).toBe(list.length);
        checkOne(tree.firstEnding(from, to), list[0] || null);
        checkOne(tree.lastEnding(from, to), list[list.length - 1] || null);
        checkVisitor(v => tree.visitEnding(from, to, v), list);
      }

      function checkTouching(from, to) {
        const list = [];
        for (const d of all) {
          if (d.to >= from && d.from < to)
            list.push(d);
        }
        checkList(tree.listTouching(from, to), list);
        expect(tree.countTouching(from, to)).toBe(list.length);
        checkOne(tree.firstTouching(from, to), list[0] || null);
        checkOne(tree.lastTouching(from, to), list[list.length - 1] || null);
        checkVisitor(v => tree.visitTouching(from, to, v), list);
      }

      for (let from = -1; from <= 34; from++) {
        for (let to = from; to <= 34; to++) {
          checkStarting(from, to);
          checkStarting(from, to + 0.5);
          checkStarting(from + 0.5, to);
          checkStarting(from + 0.5, to + 0.5);
          checkEnding(from, to);
          checkEnding(from, to + 0.5);
          checkEnding(from + 0.5, to);
          checkEnding(from + 0.5, to + 0.5);
          checkTouching(from, to);
          checkTouching(from, to + 0.5);
          checkTouching(from + 0.5, to);
          checkTouching(from + 0.5, to + 0.5);
        }
      }
    });

    it('replace() manual', () => {
      const before = {from: 10, to: 20};
      const cases = [
        {from: 0, to: 1, inserted: 5, expected: [{from: 14, to: 24}]},
        {from: 30, to: 40, inserted: 5, expected: [{from: 10, to: 20}]},
        {from: 5, to: 5, inserted: 5, expected: [{from: 15, to: 25}]},
        {from: 2, to: 7, inserted: 0, expected: [{from: 5, to: 15}]},
        {from: 5, to: 10, inserted: 0, expected: [{from: 5, to: 15}]},
        {from: 5, to: 10, inserted: 3, expected: [{from: 8, to: 18}]},
        {from: 20, to: 20, inserted: 4, expected: [{from: 10, to: 20}]},
        {from: 20, to: 30, inserted: 3, expected: [{from: 10, to: 20}]},
        {from: 5, to: 25, inserted: 30, expected: []},
        {from: 10, to: 10, inserted: 5, expected: [{from: 10, to: 25}]},
        {from: 10, to: 20, inserted: 3, expected: [{from: 10, to: 10}]},
        {from: 10, to: 15, inserted: 2, expected: [{from: 10, to: 17}]},
        {from: 12, to: 15, inserted: 0, expected: [{from: 10, to: 17}]},
        {from: 13, to: 17, inserted: 4, expected: [{from: 10, to: 20}]},
        {from: 13, to: 17, inserted: 14, expected: [{from: 10, to: 30}]},
        {from: 8, to: 15, inserted: 0, expected: [{from: 8, to: 13}]},
        {from: 8, to: 15, inserted: 6, expected: [{from: 14, to: 19}]},
        {from: 15, to: 25, inserted: 0, expected: [{from: 10, to: 15}]},
        {from: 15, to: 25, inserted: 3, expected: [{from: 10, to: 15}]},
        {from: 15, to: 20, inserted: 4, expected: [{from: 10, to: 15}]},
      ];

      for (const test of cases) {
        const {from, to, inserted, expected} = test;
        const tree = new RangeTree(true /* createHandles */);
        const handle = tree.add(before.from, before.to, '');
        const removed = tree.replace(from, to, inserted);
        const got = tree.listAll();
        expect(got.length).toBe(expected.length, `test: ${JSON.stringify(test)}`);
        for (let i = 0; i < got.length; i++) {
          expect(got[i].from).toBe(expected[i].from, `test: ${JSON.stringify(test)}`);
          expect(got[i].to).toBe(expected[i].to, `test: ${JSON.stringify(test)}`);
        }
        if (expected.length) {
          const range = tree.resolve(handle);
          expect(range.from).toBe(expected[0].from);
          expect(range.to).toBe(expected[0].to);
        } else {
          expect(removed.length).toBe(1);
          expect(removed[0]).toBe(handle);
        }
      }
    });

    it('replace() large list to the right', () => {
      const tree = new RangeTree();
      const count = 10000;
      for (let i = 0; i < count; i++)
        tree.add(i+ 200, i+ 200, '');
      for (let i = 0; i < 99; i++)
        tree.replace(2 * i, 2 * i + 1, 2);
      const list = tree.listAll();
      expect(list.length).toBe(count);
      for (let i = 0; i < count; i++) {
        expect(list[i].from).toBe(i+ 200 + 99);
        expect(list[i].to).toBe(i+ 200 + 99);
      }
    });

    it('editing', () => {
      const tree = new RangeTree(true /* createHandles */);
      const a = {from: 0, to: 1.5, data: 'a'};
      const b = {from: 2, to: 3, data: 'b'};
      const c = {from: 3, to: 3.5, data: 'c'};
      const d = {from: 10, to: 20.5, data: 'd'};
      const e = {from: 21, to: 100.5, data: 'e'};

      const cHandle = tree.add(c.from, c.to, c.data);
      let aHandle = tree.add(a.from, a.to, a.data);
      const dHandle = tree.add(d.from, d.to, d.data);
      const bHandle = tree.add(b.from, b.to, b.data);
      const eHandle = tree.add(e.from, e.to, e.data);

      checkList(tree.listAll(), [a, b, c, d, e]);

      expect(tree.remove(eHandle)).toBe(e);
      expect(tree.remove(eHandle)).toBe(undefined);
      checkList(tree.listAll(), [a, b, c, d]);

      tree.clearStarting(5, 15);
      checkList(tree.listAll(), [a, b, c]);

      tree.add(e.from, e.to, e.data);
      checkList(tree.listAll(), [a, b, c, e]);

      tree.clearEnding(0, 3.5);
      checkList(tree.listAll(), [c, e]);

      aHandle = tree.add(a.from, a.to, a.data);
      tree.add(b.from, b.to, b.data);
      tree.add(d.from, d.to, d.data);
      checkList(tree.listAll(), [a, b, c, d, e]);

      tree.clearTouching(3.5, 10.5);
      checkList(tree.listAll(), [a, b, e]);

      tree.add(d.from, d.to, d.data);
      expect(tree.remove(aHandle)).toBe(a);
      expect(tree.remove(eHandle)).toBe(undefined);
      checkList(tree.listAll(), [b, d, e]);

      tree.clearAll();
      checkList(tree.listAll(), []);
    });

    it('remove()', () => {
      const tree = new RangeTree(true /* createHandles */);
      const handle = tree.add(2, 2, 'foo');
      tree.replace(2, 0, 1);
      tree.replace(1, 0, 1);
      tree.replace(0, 0, 1);
      tree.remove(handle);
      expect(tree.countAll()).toBe(0);
    });

    it('multiple removals', () => {
      const tree = new RangeTree(true /* createHandles */);
      const a = {from: 1, to: 2, data: 'a'};
      const b = {from: 2, to: 3, data: 'b'};
      const c = {from: 3, to: 3, data: 'c'};
      const d = {from: 10, to: 20, data: 'd'};
      const e = {from: 21, to: 100, data: 'e'};
      const all = [a, b, c, d, e];
      for (const x of all)
        x.handle = tree.add(x.from, x.to, x.data);

      const removed = tree.replace(0, 101, 0);
      expect(removed.length).toBe(all.length);
      for (let i = 0; i < all.length; i++)
        expect(removed[i]).toBe(all[i].handle);
    });
  });
}
