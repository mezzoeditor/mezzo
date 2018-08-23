import {Search} from './Search.mjs';
import {createTestEditor} from '../src/editor/utils.spec.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('Search', () => {
    it('should work', () => {
      const editor = createTestEditor('Hello, world');
      const platform = editor.platformSupport();
      const search = new Search(editor);

      search.find('world');
      platform.runUntilIdle();
      expect(search.matches().length).toBe(1);

      search.find('hello');
      platform.runUntilIdle();
      expect(search.matches()).toBe([
        {from: 0, to: 5}
      ]);

      search.find('wat');
      platform.runUntilIdle();
      expect(search.matches().length).toBe(0);
    });

    it('should work with overlapping matches', () => {
      const editor = createTestEditor(' '.repeat(1000));
      const platform = editor.platformSupport();
      const search = new Search(editor);
      Search.test.setChunkSize(search, 20);

      for (let size = 1; size < 10; ++size) {
        search.find(' '.repeat(size));
        platform.runUntilIdle();
        expect(search.matches().length).toBe(Math.floor(1000 / size));
      }
    });

    it('should work with query longer than text', () => {
      const editor = createTestEditor('');
      const platform = editor.platformSupport();
      const search = new Search(editor);

      search.find('world');
      platform.runUntilIdle();
      expect(search.matches().length).toBe(0);
    });
  });
}
