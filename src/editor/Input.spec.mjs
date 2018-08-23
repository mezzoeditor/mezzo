import {createTestEditor, textWithCursors} from './utils.spec.mjs';

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
  });
}

