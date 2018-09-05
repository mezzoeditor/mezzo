import {RoundMode, Metrics} from './Metrics.mjs';
import {Document} from './Document.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  function createTestMetrics() {
    return Metrics.createRegular(null, null, s => s.charCodeAt(0) - 'a'.charCodeAt(0) + 1, s => 100);
  }

  function createDefaultMetrics() {
    return Metrics.createRegular(Metrics.bmpRegex, Metrics.bmpRegex, s => 1, s => 1);
  }

  describe('Metrics', () => {
    it('Metrics.isValidOffset', () => {
      expect(Metrics.isValidOffset('abc', -1)).toBe(true);
      expect(Metrics.isValidOffset('abc', 0)).toBe(true);
      expect(Metrics.isValidOffset('abc', 1)).toBe(true);
      expect(Metrics.isValidOffset('abc', 2)).toBe(true);
      expect(Metrics.isValidOffset('abc', 3)).toBe(true);
      expect(Metrics.isValidOffset('abc', 4)).toBe(true);

      expect(Metrics.isValidOffset('𐀀𐀀', -1)).toBe(true);
      expect(Metrics.isValidOffset('𐀀𐀀', 0)).toBe(true);
      expect(Metrics.isValidOffset('𐀀𐀀', 1)).toBe(false);
      expect(Metrics.isValidOffset('𐀀𐀀', 2)).toBe(true);
      expect(Metrics.isValidOffset('𐀀𐀀', 3)).toBe(false);
      expect(Metrics.isValidOffset('𐀀𐀀', 4)).toBe(true);
      expect(Metrics.isValidOffset('𐀀𐀀', 5)).toBe(true);
    });

    it('Metrics internals', () => {
      let metrics = createTestMetrics();

      expect(metrics._measureString('abc', 1, 2)).toBe(2);
      expect(metrics._measureString('abc', 0, 3)).toBe(6);
      expect(metrics._measureString('abc', 2, 2)).toBe(0);
      expect(metrics._measureString('abc𐀀𐀀', 2, 5)).toBe(103);
      expect(metrics._measureString('abc𐀀𐀀', 5, 7)).toBe(100);
      expect(metrics._measureString('abc𐀀𐀀', 0, 7)).toBe(206);
      expect(metrics._measureString('a😀b𐀀c', 1, 6)).toBe(202);
      expect(metrics._measureString('😀', 0, 2)).toBe(100);
      expect(metrics._measureString('😀', 1, 1)).toBe(0);
      expect(metrics._measureString('😀', 0, 0)).toBe(0);

      expect(metrics._locateByWidth('abc', 0, 3, 3, RoundMode.Floor)).toBe({offset: 2, width: 3});
      expect(metrics._locateByWidth('abc', 0, 3, 3, RoundMode.Round)).toBe({offset: 2, width: 3});
      expect(metrics._locateByWidth('abc', 0, 3, 3, RoundMode.Ceil)).toBe({offset: 2, width: 3});
      expect(metrics._locateByWidth('abc', 0, 3, 4.5, RoundMode.Floor)).toBe({offset: 2, width: 3});
      expect(metrics._locateByWidth('abc', 0, 3, 4.5, RoundMode.Round)).toBe({offset: 2, width: 3});
      expect(metrics._locateByWidth('abc', 0, 3, 4.5, RoundMode.Ceil)).toBe({offset: 3, width: 6});
      expect(metrics._locateByWidth('abc', 0, 3, 4.6, RoundMode.Floor)).toBe({offset: 2, width: 3});
      expect(metrics._locateByWidth('abc', 0, 3, 4.6, RoundMode.Round)).toBe({offset: 3, width: 6});
      expect(metrics._locateByWidth('abc', 0, 3, 4.6, RoundMode.Ceil)).toBe({offset: 3, width: 6});
      expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 103, RoundMode.Floor)).toBe({offset: 5, width: 103});
      expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 103, RoundMode.Round)).toBe({offset: 5, width: 103});
      expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 103, RoundMode.Ceil)).toBe({offset: 5, width: 103});
      expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 153, RoundMode.Floor)).toBe({offset: 5, width: 103});
      expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 153, RoundMode.Round)).toBe({offset: 5, width: 103});
      expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 153, RoundMode.Ceil)).toBe({offset: 7, width: 203});
      expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 154, RoundMode.Floor)).toBe({offset: 5, width: 103});
      expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 154, RoundMode.Round)).toBe({offset: 7, width: 203});
      expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 154, RoundMode.Ceil)).toBe({offset: 7, width: 203});
      expect(metrics._locateByWidth('a😀b𐀀c', 0, 6, 204, RoundMode.Round)).toBe({offset: -1, width: 203});
      expect(metrics._locateByWidth('a😀b𐀀c', 0, 6, 203, RoundMode.Round)).toBe({offset: 6, width: 203});
      expect(metrics._locateByWidth('', 0, 0, 0, RoundMode.Ceil)).toBe({offset: 0, width: 0});
      expect(metrics._locateByWidth('', 0, 0, 5, RoundMode.Floor)).toBe({offset: -1, width: 0});

      let defaultMetrics = createDefaultMetrics();
      expect(defaultMetrics._locateByWidth('abc', 0, 3, 0.5, RoundMode.Floor)).toBe({offset: 0, width: 0});
      expect(defaultMetrics._locateByWidth('abc', 0, 3, 0.5, RoundMode.Round)).toBe({offset: 0, width: 0});
      expect(defaultMetrics._locateByWidth('abc', 0, 3, 0.6, RoundMode.Round)).toBe({offset: 1, width: 1});
      expect(defaultMetrics._locateByWidth('abc', 0, 3, 0.5, RoundMode.Ceil)).toBe({offset: 1, width: 1});
    });

    it('Metrics.forString', () => {
      let defaultMetrics = createDefaultMetrics();
      expect(defaultMetrics.forString('one line')).toBe({length: 8, firstWidth: 8, lastWidth: 8, longestWidth: 8});
      expect(defaultMetrics.forString('\none line')).toBe({length: 9, firstWidth: 0, lastWidth: 8, longestWidth: 8, lineBreaks: 1});
      expect(defaultMetrics.forString('one line\n')).toBe({length: 9, firstWidth: 8, lastWidth: 0, longestWidth: 8, lineBreaks: 1});
      expect(defaultMetrics.forString('\none line\n')).toBe({length: 10, firstWidth: 0, lastWidth: 0, longestWidth: 8, lineBreaks: 2});
      expect(defaultMetrics.forString('short\nlongest\nlonger\ntiny')).toBe({length: 25, firstWidth: 5, lastWidth: 4, longestWidth: 7, lineBreaks: 3});

      let testMetrics = createTestMetrics();
      expect(testMetrics.forString('a')).toBe({length: 1, firstWidth: 1, lastWidth: 1, longestWidth: 1});
      expect(testMetrics.forString('a\nb')).toBe({length: 3, lineBreaks: 1, firstWidth: 1, lastWidth: 2, longestWidth: 2});
      expect(testMetrics.forString('b\na')).toBe({length: 3, lineBreaks: 1, firstWidth: 2, lastWidth: 1, longestWidth: 2});
      expect(testMetrics.forString('bac')).toBe({length: 3, firstWidth: 6, lastWidth: 6, longestWidth: 6});
      expect(testMetrics.forString('b\na\nc')).toBe({length: 5, lineBreaks: 2, firstWidth: 2, lastWidth: 3, longestWidth: 3});
      expect(testMetrics.forString('b\naaaa\nc')).toBe({length: 8, lineBreaks: 2, firstWidth: 2, lastWidth: 3, longestWidth: 4});
      expect(testMetrics.forString('b😀😀')).toBe({length: 5, firstWidth: 202, lastWidth: 202, longestWidth: 202});
      expect(testMetrics.forString('😀\n𐀀😀\n𐀀a')).toBe({length: 11, lineBreaks: 2, firstWidth: 100, lastWidth: 101, longestWidth: 200});
      expect(testMetrics.forString('\n𐀀')).toBe({length: 3, lineBreaks: 1, firstWidth: 0, lastWidth: 100, longestWidth: 100});
    });

    it('Metrics.locateBy*', () => {
      let defaultMetrics = createDefaultMetrics();

      let tests = [
        {chunk: 'short', before: {offset: 15, x: 5, y: 10}, location: {offset: 18, x: 8, y: 10}},
        {chunk: 'short\nlonger', before: {offset: 15, x: 5, y: 10}, location: {offset: 18, x: 8, y: 10}},
        {chunk: 'short\nlonger', before: {offset: 15, x: 5, y: 10}, location: {offset: 20, x: 10, y: 10}},
        {chunk: 'short\nlonger', before: {offset: 15, x: 5, y: 10}, location: {offset: 21, x: 0, y: 11}},
        {chunk: '1\n23\n456\n78\n9\n0', before: {offset: 15, x: 5, y: 10}, location: {offset: 28, x: 1, y: 14}},
      ];
      for (let test of tests) {
        expect(defaultMetrics.locateByOffset(test.chunk, test.before, test.location.offset)).toBe(test.location);
        expect(defaultMetrics.locateByOffset(test.chunk, test.before, test.location.offset, true /* strict */)).toBe(test.location);
        expect(defaultMetrics.locateByPoint(test.chunk, test.before, test.location, RoundMode.Floor, true /* strict */)).toBe(test.location);
      }

      let nonStrict = [
        {chunk: 'short', before: {offset: 15, x: 5, y: 10}, point: {x: 15, y: 10}, result: {offset: 20, x: 10, y: 10}},
        {chunk: 'short\nlonger', before: {offset: 15, x: 5, y: 10}, point: {x: 15, y: 10}, result: {offset: 20, x: 10, y: 10}},
        {chunk: 'short\nlonger', before: {offset: 15, x: 5, y: 10}, point: {x: 22, y: 11}, result: {offset: 27, x: 6, y: 11}},
        {chunk: '1\n23\n456\n78\n9\n0', before: {offset: 15, x: 5, y: 10}, point: {x: 42, y: 14}, result: {offset: 28, x: 1, y: 14}},
      ];
      for (let test of nonStrict)
        expect(defaultMetrics.locateByPoint(test.chunk, test.before, test.point, RoundMode.Floor)).toBe(test.result);
    });

    it('Metrics.locateBy* with non-bmp', () => {
      let metrics = createTestMetrics();

      let tests = [
        {chunk: 'abc', before: {offset: 15, x: 5, y: 10}, location: {offset: 18, x: 11, y: 10}},
        {chunk: 'abc\na😀b𐀀c', before: {offset: 15, x: 5, y: 10}, location: {offset: 18, x: 11, y: 10}},
        {chunk: 'abc\na😀b𐀀c', before: {offset: 15, x: 5, y: 10}, location: {offset: 19, x: 0, y: 11}},
        {chunk: 'abc\na😀b𐀀c', before: {offset: 15, x: 5, y: 10}, location: {offset: 25, x: 203, y: 11}},
        {chunk: 'a\n😀b\n𐀀ca\n𐀀𐀀\n😀\n0', before: {offset: 15, x: 5, y: 10}, location: {offset: 33, x: 100, y: 14}},
      ];
      for (let test of tests) {
        expect(metrics.locateByOffset(test.chunk, test.before, test.location.offset)).toBe(test.location);
        expect(metrics.locateByOffset(test.chunk, test.before, test.location.offset, true /* strict */)).toBe(test.location);
        expect(metrics.locateByPoint(test.chunk, test.before, test.location, RoundMode.Floor, true /* strict */)).toBe(test.location);
      }

      let nonStrict = [
        {chunk: 'abc', before: {offset: 15, x: 5, y: 10}, point: {x: 15, y: 10}, result: {offset: 18, x: 11, y: 10}},
        {chunk: 'abc\na😀b𐀀c', before: {offset: 15, x: 5, y: 10}, point: {x: 15, y: 10}, result: {offset: 18, x: 11, y: 10}},
        {chunk: 'abc\na😀b𐀀c', before: {offset: 15, x: 5, y: 10}, point: {x: 220, y: 11.5}, result: {offset: 26, x: 206, y: 11}},
        {chunk: 'a\n😀b\n𐀀ca\n𐀀𐀀\n😀\n0', before: {offset: 15, x: 5, y: 10}, point: {x: 420, y: 14.5}, result: {offset: 33, x: 100, y: 14}},
      ];
      for (let test of nonStrict)
        expect(metrics.locateByPoint(test.chunk, test.before, test.point, RoundMode.Floor)).toBe(test.result);
    });

    it('Metrics.locateByOffset non-strict', () => {
      let metrics = createTestMetrics();
      expect(metrics.locateByOffset('😀😀', {offset: 3, x: 3, y: 3}, 6)).toBe({offset: 5, x: 103, y: 3});
    });

    it('Metrics.locateByPoint with round modes', () => {
      let testMetrics = createTestMetrics();
      let chunk = 'a\nb\naaaa\nbac\nc';
      let before = {offset: 15, x: 5, y: 10};
      let tests = [
        {point: {x: 5, y: 10}, location: {offset: 15, x: 5, y: 10}, strict: true},
        {point: {x: 6, y: 10}, location: {offset: 16, x: 6, y: 10}, strict: true},
        {point: {x: 7, y: 10}, location: {offset: 16, x: 6, y: 10}},
        {point: {x: 5, y: 10.5}, location: {offset: 15, x: 5, y: 10}, strict: true},
        {point: {x: 0, y: 11}, location: {offset: 17, x: 0, y: 11}, strict: true},
        {point: {x: 1, y: 11}, location: {offset: 17, x: 0, y: 11}, strict: true},
        {point: {x: 0.9, y: 11}, location: {offset: 17, x: 0, y: 11}, roundMode: RoundMode.Round, strict: true},
        {point: {x: 1.0, y: 11}, location: {offset: 17, x: 0, y: 11}, roundMode: RoundMode.Round, strict: true},
        {point: {x: 1.1, y: 11}, location: {offset: 18, x: 2, y: 11}, roundMode: RoundMode.Round, strict: true},
        {point: {x: 0, y: 11}, location: {offset: 17, x: 0, y: 11}, roundMode: RoundMode.Ceil, strict: true},
        {point: {x: 1.0, y: 11}, location: {offset: 18, x: 2, y: 11}, roundMode: RoundMode.Ceil, strict: true},
        {point: {x: 1.1, y: 11}, location: {offset: 18, x: 2, y: 11}, roundMode: RoundMode.Ceil, strict: true},
        {point: {x: 2, y: 11}, location: {offset: 18, x: 2, y: 11}, strict: true},
        {point: {x: 42, y: 11.5}, location: {offset: 18, x: 2, y: 11}},
        {point: {x: 0, y: 12}, location: {offset: 19, x: 0, y: 12}, strict: true},
        {point: {x: 1, y: 12}, location: {offset: 20, x: 1, y: 12}, strict: true},
        {point: {x: 2, y: 12}, location: {offset: 21, x: 2, y: 12}, strict: true},
        {point: {x: 3, y: 12.1}, location: {offset: 22, x: 3, y: 12}, strict: true},
        {point: {x: 4, y: 12.7}, location: {offset: 23, x: 4, y: 12}, strict: true},
        {point: {x: 3, y: 13}, location: {offset: 26, x: 3, y: 13}, strict: true},
        {point: {x: 42, y: 13}, location: {offset: 27, x: 6, y: 13}},
      ];
      for (let test of tests)
        expect(testMetrics.locateByPoint(chunk, before, test.point, test.roundMode || RoundMode.Floor, !!test.strict)).toBe(test.location);
    });
  });
}
