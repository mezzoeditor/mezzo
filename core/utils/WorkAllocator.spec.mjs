import { WorkAllocator } from './WorkAllocator.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('WorkAllocator', () => {
    it('sanity', () => {
      // Work: ----------
      const allocator = new WorkAllocator(10);
      expect(allocator.workRange()).toBe({from: 0, to: 10});

      // Work: ---++++---
      allocator.done(3, 7);
      expect(allocator.workRange()).toBe({from: 0, to: 3});
      expect(allocator.workRange(5)).toBe({from: 7, to: 10});

      // Work: ----------
      allocator.undone(3, 7);
      expect(allocator.workRange()).toBe({from: 0, to: 10});
    });

    it('edge inputs', () => {
      const allocator = new WorkAllocator(10);
      expect(allocator.workRange(3, 7)).toBe({from: 3, to: 7});
      expect(allocator.workRange(3, 100)).toBe({from: 3, to: 10});
      expect(allocator.workRange(-100, 5)).toBe({from: 0, to: 5});
      expect(allocator.workRange(-100, 100)).toBe({from: 0, to: 10});

      allocator.done(-100, 100);
      expect(allocator.workRange()).toBe(null);

      allocator.undone(-100, 100);
      expect(allocator.workRange()).toBe({from: 0, to: 10});
    });

    it('WarkAllocator.done()', () => {
      // Work: ----------
      const allocator = new WorkAllocator(10);

      // Work: +-+-+-----
      allocator.done(0, 1);
      allocator.done(2, 3);
      allocator.done(4, 5);

      expect(allocator.workRange()).toBe({from: 1, to: 2});
      expect(allocator.workRange(2)).toBe({from: 3, to: 4});
      expect(allocator.workRange(3)).toBe({from: 3, to: 4});
      expect(allocator.workRange(4)).toBe({from: 5, to: 10});
      expect(allocator.workRange(4, 5)).toBe(null);
      expect(allocator.workRange(4, 6)).toBe({from: 5, to: 6});

      // Work: +++-+-----
      allocator.done(0, 3);
      expect(allocator.workRange()).toBe({from: 3, to: 4});
      expect(allocator.workRange(4)).toBe({from: 5, to: 10});

      // Work: +++-+--+--
      allocator.done(8, 9);
      expect(allocator.workRange(8)).toBe({from: 9, to: 10});

      // Work: +++-++++--
      allocator.done(4, 8);
      expect(allocator.workRange()).toBe({from: 3, to: 4});
      expect(allocator.workRange(5)).toBe({from: 9, to: 10});
    });

    it('WarkAllocator.undone()', () => {
      // Work: ----------
      const allocator = new WorkAllocator(10);
      // Work: ++++++++++
      allocator.done();
      expect(allocator.workRange()).toBe(null);

      // Work: -+-+--++++
      allocator.undone(0, 1);
      allocator.undone(2, 3);
      allocator.undone(5, 7);
      expect(allocator.workRange()).toBe({from: 0, to: 1});
      expect(allocator.workRange(1)).toBe({from: 2, to: 3});
      expect(allocator.workRange(3)).toBe({from: 5, to: 7});

      // Work: ---+--++++
      allocator.undone(1, 2);
      expect(allocator.workRange()).toBe({from: 0, to: 3});
      expect(allocator.workRange(3, 10)).toBe({from: 5, to: 7});

      // Work: -------+++
      allocator.undone(2, 8);
      expect(allocator.workRange()).toBe({from: 0, to: 8});
    });

    it('simple mixed', () => {
      // Work: ----------
      const allocator = new WorkAllocator(10);
      expect(allocator.workRange(0, 5)).toBe({ from: 0, to: 5 });

      // Work: +++++-----
      allocator.done(0, 5);
      expect(allocator.workRange(0, 5)).toBe(null);
      expect(allocator.workRange(2, 6)).toBe({from: 5, to: 6});
      expect(allocator.workRange()).toBe({from: 5, to: 10});

      // Work: ----------
      allocator.done();
      expect(allocator.workRange()).toBe(null);
    });
  });
}
