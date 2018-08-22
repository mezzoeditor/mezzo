import {createTestEditor, textWithCursors} from './utils.spec.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;
  describe('Input', () => {
    it('should type', () => {
      const editor = createTestEditor();
      editor.reset('\n\n');
      editor.document().setSelection([
        {focus: 0, anchor: 0},
        {focus: 1, anchor: 1},
        {focus: 2, anchor: 2},
      ]);
      editor.input().type('hello');
      expect(textWithCursors(editor)).toBe('hello|\nhello|\nhello|');
    });
  });
}

