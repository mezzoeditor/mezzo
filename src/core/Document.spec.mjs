import {Metrics} from './Metrics.mjs';
import {Document} from './Document.mjs';
import {Random} from './Random.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('Document text API', () => {
    it('Document.replace all chunk sizes', () => {
      let random = Random(142);
      let lineCount = 10;
      let chunks = [];
      for (let i = 0; i < lineCount; i++) {
        let s = 'abcdefg';
        let length = 1 + (random() % (s.length - 1));
        chunks.push(s.substring(0, length) + '\n');
      }
      let content = chunks.join('');

      let editQueries = [];
      for (let i = 0; i < 20; i++) {
        let from = random() % content.length;
        let to = from + (random() % (content.length - from));
        let s = 'abcdefg\n';
        let length = 1 + (random() % (s.length - 1));
        let insertion = s.substring(0, length);
        editQueries.push({from, to, insertion});
        content = content.substring(0, from) + insertion + content.substring(to, content.length);
      }

      for (let chunkSize = 1; chunkSize <= 100; chunkSize++) {
        content = chunks.join('');
        let document = new Document();
        Document.test.setContent(document, content, chunkSize);
        for (let {from, to, insertion} of editQueries) {
          let removed = document.replace(from, to, insertion);
          expect(removed.length()).toBe(to - from);
          expect(removed.content(0, to - from)).toBe(content.substring(from, to));
          content = content.substring(0, from) + insertion + content.substring(to, content.length);
          expect(document.text().length()).toBe(content.length);
          for (let from = 0; from <= content.length; from++) {
            for (let to = from; to <= content.length; to++)
              expect(document.text().content(from, to)).toBe(content.substring(from, to));
          }
        }
      }
    });
  });
  describe('Document generations', () => {
    it('should increase on replace', () => {
      const document = new Document();
      const initial = document.generation();
      document.replace(0, 0, 'hello');
      expect(document.generation()).not.toBe(initial);
    });
    it('should not increase on selection change', () => {
      const document = new Document();
      document.reset('hello');
      const initial = document.generation();
      document.setSelection([
        {anchor: 1, focus: 2}
      ]);
      expect(document.generation()).toBe(initial);
    });
    it('should work with undo/redo', () => {
      const document = new Document();
      const initial = document.generation();
      document.replace(0, 0, 'hello');
      expect(document.generation()).not.toBe(initial);
      document.undo();
      expect(document.generation()).toBe(initial);
      document.redo();
      expect(document.generation()).not.toBe(initial);
    });
  });
}
