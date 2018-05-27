import {Random} from './Random.mjs';
import {Document} from './Document.mjs';
import {CompareAnchors, Start, End} from './Anchor.mjs';
import {Decorator} from './Decorator.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('Decorator', () => {
    function checkOne(got, expected) {
      if (!expected) {
        expect(got).toBe(null);
      } else {
        expect(got.from).toEqual(expected.from);
        expect(got.to).toEqual(expected.to);
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

    it('Decorator getters', () => {
      let dec = new Decorator(true /* createHandles */);
      let a = {from: End(0), to: Start(1), data: 'a'};
      let b = {from: Start(0), to: End(0), data: 'b'};
      let c = {from: Start(2), to: Start(3), data: 'c'};
      let d = {from: End(15), to: Start(33), data: 'd'};
      let e = {from: End(8), to: End(12), data: 'e'};
      let f = {from: Start(8), to: Start(8), data: 'f'};
      let g = {from: End(12), to: End(12), data: 'g'};
      let h = {from: Start(1), to: Start(1), data: 'h'};
      let i = {from: End(1), to: End(1), data: 'i'};
      let j = {from: End(1), to: End(1), data: 'j'};
      for (let x of [a, b, c, d, e, f, g, h, i, j])
        x.handle = dec.add(x.from, x.to, x.data);

      let all = [b, a, h, i, j, c, f, e, g, d];
      checkList(dec.listAll(), all);
      expect(dec.countAll()).toBe(all.length);
      checkOne(dec.firstAll(), all[0]);
      checkOne(dec.lastAll(), all[all.length - 1]);
      checkVisitor(v => dec.visitAll(v), all);
      for (let x of all)
        checkOne(dec.resolve(x.handle), x);

      function checkStarting(from, to) {
        let list = [];
        for (let d of all) {
          if (CompareAnchors(d.from, from) >= 0 && CompareAnchors(d.from, to) < 0)
            list.push(d);
        }
        checkList(dec.listStarting(from, to), list);
        expect(dec.countStarting(from, to)).toBe(list.length);
        checkOne(dec.firstStarting(from, to), list[0] || null);
        checkOne(dec.lastStarting(from, to), list[list.length - 1] || null);
        checkVisitor(v => dec.visitStarting(from, to, v), list);
      }

      function checkEnding(from, to) {
        let list = [];
        for (let d of all) {
          if (CompareAnchors(d.to, from) >= 0 && CompareAnchors(d.to, to) < 0)
            list.push(d);
        }
        checkList(dec.listEnding(from, to), list);
        expect(dec.countEnding(from, to)).toBe(list.length);
        checkOne(dec.firstEnding(from, to), list[0] || null);
        checkOne(dec.lastEnding(from, to), list[list.length - 1] || null);
        checkVisitor(v => dec.visitEnding(from, to, v), list);
      }

      function checkTouching(from, to) {
        let list = [];
        for (let d of all) {
          if (CompareAnchors(d.to, from) >= 0 && CompareAnchors(d.from, to) < 0)
            list.push(d);
        }
        checkList(dec.listTouching(from, to), list);
        expect(dec.countTouching(from, to)).toBe(list.length);
        checkOne(dec.firstTouching(from, to), list[0] || null);
        checkOne(dec.lastTouching(from, to), list[list.length - 1] || null);
        checkVisitor(v => dec.visitTouching(from, to, v), list);
      }

      for (let from = -1; from <= 34; from++) {
        for (let to = from; to <= 34; to++) {
          checkStarting(Start(from), Start(to));
          checkStarting(Start(from), End(to));
          checkStarting(End(from), Start(to));
          checkStarting(End(from), End(to));
          checkEnding(Start(from), Start(to));
          checkEnding(Start(from), End(to));
          checkEnding(End(from), Start(to));
          checkEnding(End(from), End(to));
          checkTouching(Start(from), Start(to));
          checkTouching(Start(from), End(to));
          checkTouching(End(from), Start(to));
          checkTouching(End(from), End(to));
        }
      }
    });

    it('Decorator.replace manual', () => {
      let before = {from: 10, to: 20};
      let cases = [
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

      for (let test of cases) {
        let {from, to, inserted, expected} = test;
        let dec = new Decorator(true /* createHandles */);
        let handle = dec.add(Start(before.from), Start(before.to), '');
        let removed = dec.replace(from, to, inserted);
        let got = dec.listAll();
        expect(got.length).toBe(expected.length, `test: ${JSON.stringify(test)}`);
        for (let i = 0; i < got.length; i++) {
          expect(got[i].from).toEqual(Start(expected[i].from), `test: ${JSON.stringify(test)}`);
          expect(got[i].to).toEqual(Start(expected[i].to), `test: ${JSON.stringify(test)}`);
        }
        if (expected.length) {
          let range = dec.resolve(handle);
          expect(range.from).toEqual(Start(expected[0].from));
          expect(range.to).toEqual(Start(expected[0].to));
        } else {
          expect(removed.length).toBe(1);
          expect(removed[0]).toBe(handle);
        }
      }
    });

    it('Decorator.replace large list to the right', () => {
      let dec = new Decorator();
      let count = 10000;
      for (let i = 0; i < count; i++)
        dec.add(Start(i + 200), Start(i + 200), '');
      for (let i = 0; i < 99; i++)
        dec.replace(2 * i, 2 * i + 1, 2);
      let list = dec.listAll();
      expect(list.length).toBe(count);
      for (let i = 0; i < count; i++) {
        expect(list[i].from).toEqual(Start(i + 200 + 99));
        expect(list[i].to).toEqual(Start(i + 200 + 99));
      }
    });

    it('Decorator.editing', () => {
      let dec = new Decorator(true /* createHandles */);
      let a = {from: Start(0), to: End(1), data: 'a'};
      let b = {from: Start(2), to: Start(3), data: 'b'};
      let c = {from: Start(3), to: End(3), data: 'c'};
      let d = {from: Start(10), to: End(20), data: 'd'};
      let e = {from: Start(21), to: End(100), data: 'e'};

      let cHandle = dec.add(c.from, c.to, c.data);
      let aHandle = dec.add(a.from, a.to, a.data);
      let dHandle = dec.add(d.from, d.to, d.data);
      let bHandle = dec.add(b.from, b.to, b.data);
      let eHandle = dec.add(e.from, e.to, e.data);

      checkList(dec.listAll(), [a, b, c, d, e]);

      expect(dec.remove(eHandle)).toEqual(e);
      expect(dec.remove(eHandle)).toBe(undefined);
      checkList(dec.listAll(), [a, b, c, d]);

      dec.clearStarting(Start(5), Start(15));
      checkList(dec.listAll(), [a, b, c]);

      dec.add(e.from, e.to, e.data);
      checkList(dec.listAll(), [a, b, c, e]);

      dec.clearEnding(Start(0), End(3));
      checkList(dec.listAll(), [c, e]);

      aHandle = dec.add(a.from, a.to, a.data);
      dec.add(b.from, b.to, b.data);
      dec.add(d.from, d.to, d.data);
      checkList(dec.listAll(), [a, b, c, d, e]);

      dec.clearTouching(End(3), End(10));
      checkList(dec.listAll(), [a, b, e]);

      dec.add(d.from, d.to, d.data);
      expect(dec.remove(aHandle)).toEqual(a);
      expect(dec.remove(eHandle)).toBe(undefined);
      checkList(dec.listAll(), [b, d, e]);

      dec.clearAll();
      checkList(dec.listAll(), []);
    });

    it('Decorator.multiple removals', () => {
      let dec = new Decorator(true /* createHandles */);
      let a = {from: Start(1), to: Start(2), data: 'a'};
      let b = {from: Start(2), to: Start(3), data: 'b'};
      let c = {from: Start(3), to: Start(3), data: 'c'};
      let d = {from: Start(10), to: Start(20), data: 'd'};
      let e = {from: Start(21), to: Start(100), data: 'e'};
      let all = [a, b, c, d, e];
      for (let x of all)
        x.handle = dec.add(x.from, x.to, x.data);

      let removed = dec.replace(0, 101, 0);
      expect(removed.length).toBe(all.length);
      for (let i = 0; i < all.length; i++)
        expect(removed[i]).toBe(all[i].handle);
    });
  });
}
