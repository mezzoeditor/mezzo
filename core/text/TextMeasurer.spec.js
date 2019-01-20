import { RoundMode } from '../utils/RoundMode.js';
import { TextMeasurer } from './TextMeasurer.js';
import { TextUtils } from './TextUtils.js';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  function createTestMeasurer() {
    return new TextMeasurer(null, s => s.charCodeAt(0) - 'a'.charCodeAt(0) + 1, s => 100);
  }

  function createDefaultMeasurer() {
    return new TextMeasurer(TextUtils.bmpRegex, s => 1, s => 1);
  }

  describe('TextMeasurer', () => {
    it('internals', () => {
      const testMeasurer = createTestMeasurer();

      expect(testMeasurer._measureString('abc', 1, 2)).toBe(2);
      expect(testMeasurer._measureString('abc', 0, 3)).toBe(6);
      expect(testMeasurer._measureString('abc', 2, 2)).toBe(0);
      expect(testMeasurer._measureString('abc𐀀𐀀', 2, 5)).toBe(103);
      expect(testMeasurer._measureString('abc𐀀𐀀', 5, 7)).toBe(100);
      expect(testMeasurer._measureString('abc𐀀𐀀', 0, 7)).toBe(206);
      expect(testMeasurer._measureString('a😀b𐀀c', 1, 6)).toBe(202);
      expect(testMeasurer._measureString('😀', 0, 2)).toBe(100);
      expect(testMeasurer._measureString('😀', 1, 1)).toBe(0);
      expect(testMeasurer._measureString('😀', 0, 0)).toBe(0);

      expect(testMeasurer._locateByWidth('abc', 0, 3, 3, RoundMode.Floor)).toBe({offset: 2, width: 3});
      expect(testMeasurer._locateByWidth('abc', 0, 3, 3, RoundMode.Round)).toBe({offset: 2, width: 3});
      expect(testMeasurer._locateByWidth('abc', 0, 3, 3, RoundMode.Ceil)).toBe({offset: 2, width: 3});
      expect(testMeasurer._locateByWidth('abc', 0, 3, 4.5, RoundMode.Floor)).toBe({offset: 2, width: 3});
      expect(testMeasurer._locateByWidth('abc', 0, 3, 4.5, RoundMode.Round)).toBe({offset: 2, width: 3});
      expect(testMeasurer._locateByWidth('abc', 0, 3, 4.5, RoundMode.Ceil)).toBe({offset: 3, width: 6});
      expect(testMeasurer._locateByWidth('abc', 0, 3, 4.6, RoundMode.Floor)).toBe({offset: 2, width: 3});
      expect(testMeasurer._locateByWidth('abc', 0, 3, 4.6, RoundMode.Round)).toBe({offset: 3, width: 6});
      expect(testMeasurer._locateByWidth('abc', 0, 3, 4.6, RoundMode.Ceil)).toBe({offset: 3, width: 6});
      expect(testMeasurer._locateByWidth('abc𐀀𐀀', 2, 7, 103, RoundMode.Floor)).toBe({offset: 5, width: 103});
      expect(testMeasurer._locateByWidth('abc𐀀𐀀', 2, 7, 103, RoundMode.Round)).toBe({offset: 5, width: 103});
      expect(testMeasurer._locateByWidth('abc𐀀𐀀', 2, 7, 103, RoundMode.Ceil)).toBe({offset: 5, width: 103});
      expect(testMeasurer._locateByWidth('abc𐀀𐀀', 2, 7, 153, RoundMode.Floor)).toBe({offset: 5, width: 103});
      expect(testMeasurer._locateByWidth('abc𐀀𐀀', 2, 7, 153, RoundMode.Round)).toBe({offset: 5, width: 103});
      expect(testMeasurer._locateByWidth('abc𐀀𐀀', 2, 7, 153, RoundMode.Ceil)).toBe({offset: 7, width: 203});
      expect(testMeasurer._locateByWidth('abc𐀀𐀀', 2, 7, 154, RoundMode.Floor)).toBe({offset: 5, width: 103});
      expect(testMeasurer._locateByWidth('abc𐀀𐀀', 2, 7, 154, RoundMode.Round)).toBe({offset: 7, width: 203});
      expect(testMeasurer._locateByWidth('abc𐀀𐀀', 2, 7, 154, RoundMode.Ceil)).toBe({offset: 7, width: 203});
      expect(testMeasurer._locateByWidth('a😀b𐀀c', 0, 6, 204, RoundMode.Round)).toBe({offset: -1, width: 203});
      expect(testMeasurer._locateByWidth('a😀b𐀀c', 0, 6, 203, RoundMode.Round)).toBe({offset: 6, width: 203});
      expect(testMeasurer._locateByWidth('', 0, 0, 0, RoundMode.Ceil)).toBe({offset: 0, width: 0});
      expect(testMeasurer._locateByWidth('', 0, 0, 5, RoundMode.Floor)).toBe({offset: -1, width: 0});

      const defaultMeasurer = createDefaultMeasurer();
      expect(defaultMeasurer._locateByWidth('abc', 0, 3, 0.5, RoundMode.Floor)).toBe({offset: 0, width: 0});
      expect(defaultMeasurer._locateByWidth('abc', 0, 3, 0.5, RoundMode.Round)).toBe({offset: 0, width: 0});
      expect(defaultMeasurer._locateByWidth('abc', 0, 3, 0.6, RoundMode.Round)).toBe({offset: 1, width: 1});
      expect(defaultMeasurer._locateByWidth('abc', 0, 3, 0.5, RoundMode.Ceil)).toBe({offset: 1, width: 1});
    });

    it('mapValue', () => {
      const defaultMeasurer = createDefaultMeasurer();
      expect(defaultMeasurer.mapValue('one line').value).toBe({length: 8, firstWidth: 8, lastWidth: 8, longestWidth: 8});
      expect(defaultMeasurer.mapValue('\none line').value).toBe({length: 9, firstWidth: 0, lastWidth: 8, longestWidth: 8, lineBreaks: 1});
      expect(defaultMeasurer.mapValue('one line\n').value).toBe({length: 9, firstWidth: 8, lastWidth: 0, longestWidth: 8, lineBreaks: 1});
      expect(defaultMeasurer.mapValue('\none line\n').value).toBe({length: 10, firstWidth: 0, lastWidth: 0, longestWidth: 8, lineBreaks: 2});
      expect(defaultMeasurer.mapValue('short\nlongest\nlonger\ntiny').value).toBe({length: 25, firstWidth: 5, lastWidth: 4, longestWidth: 7, lineBreaks: 3});

      const testMeasurer = createTestMeasurer();
      expect(testMeasurer.mapValue('a').value).toBe({length: 1, firstWidth: 1, lastWidth: 1, longestWidth: 1});
      expect(testMeasurer.mapValue('a\nb').value).toBe({length: 3, lineBreaks: 1, firstWidth: 1, lastWidth: 2, longestWidth: 2});
      expect(testMeasurer.mapValue('b\na').value).toBe({length: 3, lineBreaks: 1, firstWidth: 2, lastWidth: 1, longestWidth: 2});
      expect(testMeasurer.mapValue('bac').value).toBe({length: 3, firstWidth: 6, lastWidth: 6, longestWidth: 6});
      expect(testMeasurer.mapValue('b\na\nc').value).toBe({length: 5, lineBreaks: 2, firstWidth: 2, lastWidth: 3, longestWidth: 3});
      expect(testMeasurer.mapValue('b\naaaa\nc').value).toBe({length: 8, lineBreaks: 2, firstWidth: 2, lastWidth: 3, longestWidth: 4});
      expect(testMeasurer.mapValue('b😀😀').value).toBe({length: 5, firstWidth: 202, lastWidth: 202, longestWidth: 202});
      expect(testMeasurer.mapValue('😀\n𐀀😀\n𐀀a').value).toBe({length: 11, lineBreaks: 2, firstWidth: 100, lastWidth: 101, longestWidth: 200});
      expect(testMeasurer.mapValue('\n𐀀').value).toBe({length: 3, lineBreaks: 1, firstWidth: 0, lastWidth: 100, longestWidth: 100});
    });

    it('locateBy*', () => {
      const defaultMeasurer = createDefaultMeasurer();
      const before = {length: 15, lastWidth: 5, firstWidth: 0, longestWidth: 5, lineBreaks: 10};

      const tests = [
        {chunk: 'short', location: {offset: 18, x: 8, y: 10}},
        {chunk: 'short\nlonger', location: {offset: 18, x: 8, y: 10}},
        {chunk: 'short\nlonger', location: {offset: 20, x: 10, y: 10}},
        {chunk: 'short\nlonger', location: {offset: 21, x: 0, y: 11}},
        {chunk: '1\n23\n456\n78\n9\n0', location: {offset: 28, x: 1, y: 14}},
      ];
      for (const test of tests) {
        expect(defaultMeasurer.locateByOffset(test.chunk, null, before, test.location.offset)).toBe(test.location);
        expect(defaultMeasurer.locateByPoint(test.chunk, null, before, test.location, RoundMode.Floor)).toBe(test.location);
      }

      const nonStrict = [
        {chunk: 'short', point: {x: 15, y: 10}, location: {offset: 20, x: 10, y: 10}},
        {chunk: 'short\nlonger', point: {x: 15, y: 10}, location: {offset: 20, x: 10, y: 10}},
        {chunk: 'short\nlonger', point: {x: 22, y: 11}, location: {offset: 27, x: 6, y: 11}},
        {chunk: '1\n23\n456\n78\n9\n0', point: {x: 42, y: 14}, location: {offset: 28, x: 1, y: 14}},
      ];
      for (const test of nonStrict)
        expect(defaultMeasurer.locateByPoint(test.chunk, null, before, test.point, RoundMode.Floor)).toBe(test.location);
    });

    it('locateBy* with non-bmp', () => {
      const testMeasurer = createTestMeasurer();
      const before = {length: 15, lastWidth: 5, firstWidth: 0, longestWidth: 5, lineBreaks: 10};

      const tests = [
        {chunk: 'abc', location: {offset: 18, x: 11, y: 10}},
        {chunk: 'abc\na😀b𐀀c', location: {offset: 18, x: 11, y: 10}},
        {chunk: 'abc\na😀b𐀀c', location: {offset: 19, x: 0, y: 11}},
        {chunk: 'abc\na😀b𐀀c', location: {offset: 25, x: 203, y: 11}},
        {chunk: 'a\n😀b\n𐀀ca\n𐀀𐀀\n😀\n0', location: {offset: 33, x: 100, y: 14}},
      ];
      for (const test of tests) {
        expect(testMeasurer.locateByOffset(test.chunk, null, before, test.location.offset)).toBe(test.location);
        expect(testMeasurer.locateByPoint(test.chunk, null, before, test.location, RoundMode.Floor)).toBe(test.location);
      }

      const nonStrict = [
        {chunk: 'abc', point: {x: 15, y: 10}, location: {offset: 18, x: 11, y: 10}},
        {chunk: 'abc\na😀b𐀀c', point: {x: 15, y: 10}, location: {offset: 18, x: 11, y: 10}},
        {chunk: 'abc\na😀b𐀀c', point: {x: 220, y: 11.5}, location: {offset: 26, x: 206, y: 11}},
        {chunk: 'a\n😀b\n𐀀ca\n𐀀𐀀\n😀\n0', point: {x: 420, y: 14.5}, location: {offset: 33, x: 100, y: 14}},
      ];
      for (const test of nonStrict)
        expect(testMeasurer.locateByPoint(test.chunk, null, before, test.point, RoundMode.Floor)).toBe(test.location);
    });

    it('locateByOffset non-strict', () => {
      const testMeasurer = createTestMeasurer();
      expect(testMeasurer.locateByOffset('😀😀', null, {length: 3, lastWidth: 3, lineBreaks: 3}, 6)).toBe({offset: 5, x: 103, y: 3});
    });

    it('locateByPoint with round modes', () => {
      const testMeasurer = createTestMeasurer();
      const chunk = 'a\nb\naaaa\nbac\nc';
      const before = {length: 15, lastWidth: 5, firstWidth: 0, longestWidth: 5, lineBreaks: 10};
      const tests = [
        {point: {x: 5, y: 10}, location: {offset: 15, x: 5, y: 10}},
        {point: {x: 6, y: 10}, location: {offset: 16, x: 6, y: 10}},
        {point: {x: 7, y: 10}, location: {offset: 16, x: 6, y: 10}},
        {point: {x: 5, y: 10.5}, location: {offset: 15, x: 5, y: 10}},
        {point: {x: 0, y: 11}, location: {offset: 17, x: 0, y: 11}},
        {point: {x: 1, y: 11}, location: {offset: 17, x: 0, y: 11}},
        {point: {x: 0.9, y: 11}, location: {offset: 17, x: 0, y: 11}, roundMode: RoundMode.Round},
        {point: {x: 1.0, y: 11}, location: {offset: 17, x: 0, y: 11}, roundMode: RoundMode.Round},
        {point: {x: 1.1, y: 11}, location: {offset: 18, x: 2, y: 11}, roundMode: RoundMode.Round},
        {point: {x: 0, y: 11}, location: {offset: 17, x: 0, y: 11}, roundMode: RoundMode.Ceil},
        {point: {x: 1.0, y: 11}, location: {offset: 18, x: 2, y: 11}, roundMode: RoundMode.Ceil},
        {point: {x: 1.1, y: 11}, location: {offset: 18, x: 2, y: 11}, roundMode: RoundMode.Ceil},
        {point: {x: 2, y: 11}, location: {offset: 18, x: 2, y: 11}},
        {point: {x: 42, y: 11.5}, location: {offset: 18, x: 2, y: 11}},
        {point: {x: 0, y: 12}, location: {offset: 19, x: 0, y: 12}},
        {point: {x: 1, y: 12}, location: {offset: 20, x: 1, y: 12}},
        {point: {x: 2, y: 12}, location: {offset: 21, x: 2, y: 12}},
        {point: {x: 3, y: 12.1}, location: {offset: 22, x: 3, y: 12}},
        {point: {x: 4, y: 12.7}, location: {offset: 23, x: 4, y: 12}},
        {point: {x: 3, y: 13}, location: {offset: 26, x: 3, y: 13}},
        {point: {x: 42, y: 13}, location: {offset: 27, x: 6, y: 13}},
      ];
      for (const test of tests)
        expect(testMeasurer.locateByPoint(chunk, null, before, test.point, test.roundMode || RoundMode.Floor)).toBe(test.location);
    });
  });
}
