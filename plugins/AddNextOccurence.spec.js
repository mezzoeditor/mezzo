import {createTestEditor, textWithCursors} from '../test/utils.js';
import {AddNextOccurence} from './AddNextOccurence.js';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('AddNextOccurence', () => {
    it('should work', () => {
      const editor = createTestEditor('|foo\nfoo');
      const addNextOccurence = new AddNextOccurence(editor);
      addNextOccurence.addNext();
      expect(editor.document().selection()).toBe([
        {anchor: 0, focus: 3}
      ]);
      addNextOccurence.addNext();
      expect(editor.document().selection()).toBe([
        {anchor: 0, focus: 3},
        {anchor: 4, focus: 7},
      ]);
    });
    it('should select words only when started as cursor', () => {
      const editor = createTestEditor('|foo\nfoofoo\nfoo');
      const addNextOccurence = new AddNextOccurence(editor);
      while (addNextOccurence.addNext());
      expect(editor.document().selection()).toBe([
        {anchor: 0, focus: 3},
        {anchor: 11, focus: 14}
      ]);
    });
    it('should select substring when started as selection', () => {
      const editor = createTestEditor();
      editor.reset('foo\nfoofoo\nfoo', [
        {anchor: 0, focus: 2}
      ]);
      const addNextOccurence = new AddNextOccurence(editor);
      while (addNextOccurence.addNext());
      expect(editor.document().selection()).toBe([
        {anchor: 0, focus: 2},
        {anchor: 4, focus: 6},
        {anchor: 7, focus: 9},
        {anchor: 11, focus: 13}
      ]);
    });
    it('should work with history', () => {
      const editor = createTestEditor('|foo\nfoofoo\nfoo');
      const addNextOccurence = new AddNextOccurence(editor);
      addNextOccurence.addNext();
      addNextOccurence.addNext();
      expect(editor.document().selection()).toBe([
        {anchor: 0, focus: 3},
        {anchor: 11, focus: 14}
      ]);
      editor.document().softUndo();
      expect(editor.document().selection()).toBe([
        {anchor: 0, focus: 3},
      ]);
      addNextOccurence.addNext();
      expect(editor.document().selection()).toBe([
        {anchor: 0, focus: 3},
        {anchor: 11, focus: 14}
      ]);
    });
  });
}
