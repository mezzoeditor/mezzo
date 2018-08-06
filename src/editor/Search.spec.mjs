import {Editor} from './Editor.mjs';
import {Search} from './Search.mjs';
import {TestMeasurer, TestPlatformSupport} from './utils.spec.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('Search', () => {
    it('should work', () => {
      const platform = new TestPlatformSupport();
      const editor = new Editor(new TestMeasurer(), platform);
      editor.reset('Hello, world!');

      editor.search().find('world');
      platform.runUntilIdle();
      expect(editor.search().matches().length).toBe(1);

      editor.search().find('hello');
      platform.runUntilIdle();
      expect(editor.search().matches()).toEqual([
        {from: 0, to: 5}
      ]);

      editor.search().find('wat');
      platform.runUntilIdle();
      expect(editor.search().matches().length).toBe(0);
    });

    it('should work with overlapping matches', () => {
      const platform = new TestPlatformSupport();
      const editor = new Editor(new TestMeasurer(), platform);
      Search.test.setChunkSize(editor.search(), 20);
      editor.reset(' '.repeat(1000));

      for (let size = 1; size < 10; ++size) {
        editor.search().find(' '.repeat(size));
        platform.runUntilIdle();
        expect(editor.search().matches().length).toBe(Math.floor(1000 / size));
      }
    });

    it('should work with query longer than text', () => {
      const platform = new TestPlatformSupport();
      const editor = new Editor(new TestMeasurer(), platform);
      editor.reset('');

      editor.search().find('world');
      platform.runUntilIdle();
      expect(editor.search().matches().length).toBe(0);
    });
  });
}
