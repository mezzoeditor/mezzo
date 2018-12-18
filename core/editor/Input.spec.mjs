import {createTestEditor, textWithCursors} from '../../test/utils.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;
  describe('Input', () => {
    it('input.type', () => {
      const editor = createTestEditor('|\n|\n|');
      editor.input().type('hello');
      expect(textWithCursors(editor)).toBe('hello|\nhello|\nhello|');
    });
    it('input.moveUp', () => {
      const editor = createTestEditor('hello\nwor|ld');
      editor.input().moveUp(editor.markup());
      expect(textWithCursors(editor)).toBe('hel|lo\nworld');
    });
    it('should persist selection ordering', () => {
      const editor = createTestEditor('abc');
      editor.document().setSelection([
        {anchor: 2, focus: 2},
        {anchor: 0, focus: 0},
        {anchor: 1, focus: 1},
      ]);
      expect(textWithCursors(editor)).toBe('|a|b|c');
      editor.input().type('x');
      expect(textWithCursors(editor)).toBe('x|ax|bx|c');
      expect(editor.document().selection()).toBe([
        {anchor: 5, focus: 5},
        {anchor: 1, focus: 1},
        {anchor: 3, focus: 3},
      ]);
    });
  });
}

