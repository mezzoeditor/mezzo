import {Metrics} from './Metrics.mjs';
import {Document} from './Document.mjs';
import {Random} from './Random.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('Document text API', () => {
    it('Document text API manual chunks', () => {
      let chunks = ['ab\ncd', 'def', '\n', '', 'a\n\n\nbbbc', 'xy', 'za\nh', 'pp', '\n', ''];
      let content = chunks.join('');
      let document = new Document();
      Document.test.setChunks(document, chunks);
      expect(document.lineCount()).toBe(8);
      expect(document.length()).toBe(content.length);
      for (let from = 0; from <= content.length; from++) {
        for (let to = from; to <= content.length; to++)
          expect(document.content(from, to)).toBe(content.substring(from, to));
      }
    });

    it('Document text API all chunk sizes', () => {
      let random = Random(143);
      let lineCount = 200;
      let chunks = [];
      let locationQueries = [];
      let offset = 0;
      for (let i = 0; i < lineCount; i++) {
        let s = 'abcdefghijklmnopqrstuvwxyz';
        let length = 1 + (random() % (s.length - 1));
        let chunk = s.substring(0, length);
        chunks.push(chunk + '\n');
        locationQueries.push({line: i, column: 0, offset: offset});
        locationQueries.push({line: i, column: 1, offset: offset + 1});
        locationQueries.push({line: i, column: length, offset: offset + length});
        locationQueries.push({line: i, column: length, offset: offset + length, nonStrict: {column: length + 1}});
        locationQueries.push({line: i, column: length, offset: offset + length, nonStrict: {column: length + 100}});
        let column = random() % length;
        locationQueries.push({line: i, column: column, offset: offset + column});
        offset += length + 1;
      }
      let content = chunks.join('');
      locationQueries.push({line: lineCount, column: 0, offset: content.length});
      locationQueries.push({line: lineCount, column: 0, offset: content.length, nonStrict: {column: 3}});

      let contentQueries = [];
      for (let i = 0; i < 1000; i++) {
        let from = random() % content.length;
        let to = from + (random() % (content.length - from));
        contentQueries.push({from, to});
      }

      for (let chunkSize = 1; chunkSize <= 100; chunkSize++) {
        let document = new Document();
        Document.test.setContent(document, content, chunkSize);
        expect(document.lineCount()).toBe(lineCount + 1);
        expect(document.length()).toBe(content.length);
        for (let {from, to} of contentQueries)
          expect(document.content(from, to)).toBe(content.substring(from, to));
        expect(document.offsetToPosition(0)).toEqual({line: 0, column: 0});
        expect(document.offsetToPosition(content.length)).toEqual({line: lineCount, column: 0});
        expect(document.offsetToPosition(content.length + 1)).toBe(null);
        for (let {line, column, offset, nonStrict} of locationQueries) {
          if (nonStrict) {
            expect(document.positionToOffset({line, column: nonStrict.column})).toBe(offset);
          } else {
            expect(document.offsetToPosition(offset)).toEqual({line, column});
            expect(document.positionToOffset({line, column})).toBe(offset);
            expect(document.positionToOffset({line, column}, true)).toBe(offset);
          }
        }
      }
    });

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
          expect(document.length()).toBe(content.length);
          for (let from = 0; from <= content.length; from++) {
            for (let to = from; to <= content.length; to++)
              expect(document.content(from, to)).toBe(content.substring(from, to));
          }
        }
      }
    });
  });
}
