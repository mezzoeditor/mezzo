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
      let a = {from: 0.5, to: 1, data: 'a'};
      let b = {from: 0, to: 0.5, data: 'b'};
      let c = {from: 2, to: 3, data: 'c'};
      let d = {from: 15.5, to: 33, data: 'd'};
      let e = {from: 8.5, to: 12.5, data: 'e'};
      let f = {from: 8, to: 8, data: 'f'};
      let g = {from: 12.5, to: 12.5, data: 'g'};
      let h = {from: 1, to: 1, data: 'h'};
      let i = {from: 1.5, to: 1.5, data: 'i'};
      let j = {from: 1.5, to: 1.5, data: 'j'};
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
          if (d.from >= from && d.from < to)
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
          if (d.to >= from && d.to < to)
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
          if (d.to >= from && d.from < to)
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
        let handle = dec.add(before.from, before.to, '');
        let removed = dec.replace(from, to, inserted);
        let got = dec.listAll();
        expect(got.length).toBe(expected.length, `test: ${JSON.stringify(test)}`);
        for (let i = 0; i < got.length; i++) {
          expect(got[i].from).toEqual(expected[i].from, `test: ${JSON.stringify(test)}`);
          expect(got[i].to).toEqual(expected[i].to, `test: ${JSON.stringify(test)}`);
        }
        if (expected.length) {
          let range = dec.resolve(handle);
          expect(range.from).toEqual(expected[0].from);
          expect(range.to).toEqual(expected[0].to);
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
        dec.add(i+ 200, i+ 200, '');
      for (let i = 0; i < 99; i++)
        dec.replace(2 * i, 2 * i + 1, 2);
      let list = dec.listAll();
      expect(list.length).toBe(count);
      for (let i = 0; i < count; i++) {
        expect(list[i].from).toEqual(i+ 200 + 99);
        expect(list[i].to).toEqual(i+ 200 + 99);
      }
    });

    it('Decorator.editing', () => {
      let dec = new Decorator(true /* createHandles */);
      let a = {from: 0, to: 1.5, data: 'a'};
      let b = {from: 2, to: 3, data: 'b'};
      let c = {from: 3, to: 3.5, data: 'c'};
      let d = {from: 10, to: 20.5, data: 'd'};
      let e = {from: 21, to: 100.5, data: 'e'};

      let cHandle = dec.add(c.from, c.to, c.data);
      let aHandle = dec.add(a.from, a.to, a.data);
      let dHandle = dec.add(d.from, d.to, d.data);
      let bHandle = dec.add(b.from, b.to, b.data);
      let eHandle = dec.add(e.from, e.to, e.data);

      checkList(dec.listAll(), [a, b, c, d, e]);

      expect(dec.remove(eHandle)).toEqual(e);
      expect(dec.remove(eHandle)).toBe(undefined);
      checkList(dec.listAll(), [a, b, c, d]);

      dec.clearStarting(5, 15);
      checkList(dec.listAll(), [a, b, c]);

      dec.add(e.from, e.to, e.data);
      checkList(dec.listAll(), [a, b, c, e]);

      dec.clearEnding(0, 3.5);
      checkList(dec.listAll(), [c, e]);

      aHandle = dec.add(a.from, a.to, a.data);
      dec.add(b.from, b.to, b.data);
      dec.add(d.from, d.to, d.data);
      checkList(dec.listAll(), [a, b, c, d, e]);

      dec.clearTouching(3.5, 10.5);
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
      let a = {from: 1, to: 2, data: 'a'};
      let b = {from: 2, to: 3, data: 'b'};
      let c = {from: 3, to: 3, data: 'c'};
      let d = {from: 10, to: 20, data: 'd'};
      let e = {from: 21, to: 100, data: 'e'};
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
