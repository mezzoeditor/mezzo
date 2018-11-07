import {createTestEditor} from '../test/utils.mjs';
import {WordDictionary} from './WordDictionary.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('WordDictionary', () => {
    it('should work', () => {
      const editor = createTestEditor('Hello, world');
      const dict = new WordDictionary(editor);
      editor.platformSupport().runUntilIdle();
      expect(dict.wordsWithPrefix('')).toBe(['Hello', 'world']);
      dict.dispose();
    });
    it('should return distinct words', () => {
      const editor = createTestEditor('a bb aa b bb a aa ');
      const dict = new WordDictionary(editor);
      editor.platformSupport().runUntilIdle();
      expect(dict.wordsWithPrefix('')).toBe(['a', 'aa', 'b', 'bb']);
      dict.dispose();
    });
    it('should sort results', () => {
      const editor = createTestEditor('z a a a a y r a a ttt');
      const dict = new WordDictionary(editor);
      editor.platformSupport().runUntilIdle();
      expect(dict.wordsWithPrefix('')).toBe(['a', 'r', 'ttt', 'y', 'z']);
      dict.dispose();
    });
    it('should sort results with given limit', () => {
      const alphabet = 'abcdefghijklmnopqrstuvwyxz';
      const editor = createTestEditor(alphabet.split('').reverse().join(' '));
      const dict = new WordDictionary(editor);
      editor.platformSupport().runUntilIdle();
      expect(dict.wordsWithPrefix('', 4)).toBe(['a', 'b', 'c', 'd']);
      dict.dispose();
    });
    it('should work with newlines', () => {
      const editor = createTestEditor(['bbbb', 'cc', ' ', 'aaa'].join('\n'));
      const dict = new WordDictionary(editor);
      editor.platformSupport().runUntilIdle();
      expect(dict.wordsWithPrefix('')).toBe(['aaa', 'bbbb', 'cc']);
      dict.dispose();
    });
    it('should support ignores', () => {
      const editor = createTestEditor('hello 12 world');
      const dict = new WordDictionary(editor, {
        ignore: [/^\d+$/],
      });
      editor.platformSupport().runUntilIdle();
      expect(dict.wordsWithPrefix('')).toBe(['hello', 'world']);
      dict.dispose();
    });
    it('should respect maxWordLength option', () => {
      const words = ['a', 'bb', 'ccc', 'dddd'];
      const editor = createTestEditor(words.join(' '));

      for (let i = 0; i < words.length; ++i) {
        const dict = new WordDictionary(editor, { maxWordLength: i + 1 });
        editor.platformSupport().runUntilIdle();
        expect(dict.wordsWithPrefix('')).toBe(words.slice(0, i));
        dict.dispose();
      }
    });
    it('maxSyncChunkSize = Infinity', () => {
      const editor = createTestEditor('1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16');
      const dict = new WordDictionary(editor, {
        maxWordLength: 100,
        maxSyncChunkSize: Infinity,
      });
      expect(dict.wordsWithPrefix('').length).toBe(16);
      dict.dispose();
    });
    it('should throw if maxSyncChunkSize is less then 2x of maxWordLength', () => {
      const editor = createTestEditor('hello, world');
      let error = null;
      try {
        const dict = new WordDictionary(editor, {
          maxWordLength: 10,
          maxSyncChunkSize: 15,
        });
      } catch (e) {
        error = e;
      }
      expect(error).not.toBe(null);
    });
    it('maxSyncChunkSize is some finite number', () => {
      const editor = createTestEditor('1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16');

      for (let i = 6; i <= editor.document().text().length(); ++i) {
        const dict = new WordDictionary(editor, {
          maxWordLength: 3,
          maxSyncChunkSize: i,
        });
        expect(dict.wordsWithPrefix('').length).toBe(0);
        editor.platformSupport().runUntilIdle();
        expect(dict.wordsWithPrefix('').length).toBe(16);
        dict.dispose();
      }
    });
    it('should react on edits', () => {
      const editor = createTestEditor('1 2 3 4 5');
      const dict = new WordDictionary(editor, {
        maxWordLength: 100,
        maxSyncChunkSize: Infinity,
      });
      // text: '1 2 3 4 5'
      expect(dict.wordsWithPrefix('').length).toBe(5);

      editor.document().replace(0, 2, '');
      // text: '2 3 4 5'
      expect(dict.wordsWithPrefix('').length).toBe(4);

      editor.document().replace(0, 3, 'E');
      // text: 'E 4 5'
      expect(dict.wordsWithPrefix('').length).toBe(3);

      editor.document().replace(1, 2, 'Q');
      // text: 'EQ4 5'
      expect(dict.wordsWithPrefix('').length).toBe(2);

      editor.document().replace(1, 2, '!');
      // text: 'E!4 5'
      expect(dict.wordsWithPrefix('').length).toBe(3);
      dict.dispose();
    });
    it('should emit "Changed" when changes', () => {
      const editor = createTestEditor('');
      const dict = new WordDictionary(editor, {
        maxWordLength: 100,
        maxSyncChunkSize: Infinity,
      });
      let changed = false;
      dict.on(WordDictionary.Events.Changed, () => changed = true);
      editor.document().replace(0, 0, 'Q');
      expect(dict.wordsWithPrefix('')).toBe(['Q']);
      expect(changed).toBe(true);
      dict.dispose();
    });
    it('wordDictionary.prefix should work', () => {
      const editor = createTestEditor('hello, world!');
      //                               012345678901
      const dict = new WordDictionary(editor, {
        maxWordLength: 100,
        maxSyncChunkSize: Infinity,
      });
      expect(dict.prefix(0)).toBe('');
      expect(dict.prefix(1)).toBe('h');
      expect(dict.prefix(2)).toBe('he');
      expect(dict.prefix(3)).toBe('hel');
      expect(dict.prefix(4)).toBe('hell');
      expect(dict.prefix(5)).toBe('hello');

      expect(dict.prefix(6)).toBe('');
      expect(dict.prefix(7)).toBe('');

      expect(dict.prefix(8)).toBe('w');
      expect(dict.prefix(9)).toBe('wo');
      expect(dict.prefix(10)).toBe('wor');
      expect(dict.prefix(11)).toBe('worl');
      expect(dict.prefix(12)).toBe('world');
      expect(dict.prefix(13)).toBe('');
    });
    it('should support limit in wordWithPrefix', () => {
      const editor = createTestEditor('1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16');
      const dict = new WordDictionary(editor, {
        maxWordLength: 100,
        maxSyncChunkSize: Infinity,
      });
      expect(dict.wordsWithPrefix('').length).toBe(16);
      expect(dict.wordsWithPrefix('', 10).length).toBe(10);
      expect(dict.wordsWithPrefix('', 1).length).toBe(1);
      expect(dict.wordsWithPrefix('', 100).length).toBe(16);
      dict.dispose();
    });
    it('should emit "changed" event when dictionoary changes', () => {
    });
  });
}
