import {Text} from './Text.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('Text', () => {
    it('chunking', () => {
      expect(Text.test.chunks('', 5)).toEqual([]);
      expect(Text.test.chunks('😀', 1)).toEqual([
        {data: '😀', metrics: {length: 2, firstWidth: 1, lastWidth: 1, longestWidth: 1}}
      ]);
      expect(Text.test.chunks('ab', 1)).toEqual([
        {data: 'a', metrics: {length: 1, firstWidth: 1, lastWidth: 1, longestWidth: 1}},
        {data: 'b', metrics: {length: 1, firstWidth: 1, lastWidth: 1, longestWidth: 1}}
      ]);
      expect(Text.test.chunks('ab', 5)).toEqual([
        {data: 'ab', metrics: {length: 2, firstWidth: 2, lastWidth: 2, longestWidth: 2}}
      ]);
    });
  });
}
