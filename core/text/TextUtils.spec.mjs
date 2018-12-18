import { TextUtils } from './TextUtils.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('TextUtils', () => {
    it('TextUtils.isValidOffset', () => {
      expect(TextUtils.isValidOffset('abc', -1)).toBe(true);
      expect(TextUtils.isValidOffset('abc', 0)).toBe(true);
      expect(TextUtils.isValidOffset('abc', 1)).toBe(true);
      expect(TextUtils.isValidOffset('abc', 2)).toBe(true);
      expect(TextUtils.isValidOffset('abc', 3)).toBe(true);
      expect(TextUtils.isValidOffset('abc', 4)).toBe(true);

      expect(TextUtils.isValidOffset('𐀀𐀀', -1)).toBe(true);
      expect(TextUtils.isValidOffset('𐀀𐀀', 0)).toBe(true);
      expect(TextUtils.isValidOffset('𐀀𐀀', 1)).toBe(false);
      expect(TextUtils.isValidOffset('𐀀𐀀', 2)).toBe(true);
      expect(TextUtils.isValidOffset('𐀀𐀀', 3)).toBe(false);
      expect(TextUtils.isValidOffset('𐀀𐀀', 4)).toBe(true);
      expect(TextUtils.isValidOffset('𐀀𐀀', 5)).toBe(true);
    });
  });
}
