import { Text } from './Text.js';
import { Random } from '../utils/Random.js';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('Text', () => {
    it('chunking', () => {
      expect(Text.test.toChunks('', 5)).toBe([]);
      expect(Text.test.toChunks('😀', 1)).toBe(['😀']);
      expect(Text.test.toChunks('ab', 1)).toBe(['a', 'b']);
      expect(Text.test.toChunks('ab', 5)).toBe(['ab']);
    });

    it('manual chunks', () => {
      const chunks = ['ab\ncd', 'def', '\n', '', 'a\n\n\nbbbc', 'xy', 'za\nh', 'pp', '\n', ''];
      const content = chunks.join('');
      const text = Text.test.fromChunks(chunks);
      expect(text.lineCount()).toBe(8);
      expect(text.length()).toBe(content.length);
      for (let from = 0; from <= content.length; from++) {
        for (let to = from; to <= content.length; to++)
          expect(text.content(from, to)).toBe(content.substring(from, to));
      }
    });

    it('all chunk sizes', () => {
      const random = Random(143);
      const lineCount = 200;
      const chunks = [];
      /** @type {Array<{line: number, column: number, offset: number, nonStrict?: {column: number}}>} */
      const locationQueries = [];
      let offset = 0;
      for (let i = 0; i < lineCount; i++) {
        const s = 'abcdefghijklmnopqrstuvwxyz';
        const length = 1 + (random() % (s.length - 1));
        const chunk = s.substring(0, length);
        chunks.push(chunk + '\n');
        locationQueries.push({line: i, column: 0, offset: offset});
        locationQueries.push({line: i, column: 1, offset: offset + 1});
        locationQueries.push({line: i, column: length, offset: offset + length});
        locationQueries.push({line: i, column: length, offset: offset + length, nonStrict: {column: length + 1}});
        locationQueries.push({line: i, column: length, offset: offset + length, nonStrict: {column: length + 100}});
        const column = random() % length;
        locationQueries.push({line: i, column: column, offset: offset + column});
        offset += length + 1;
      }
      const content = chunks.join('');
      locationQueries.push({line: lineCount, column: 0, offset: content.length});
      locationQueries.push({line: lineCount, column: 0, offset: content.length, nonStrict: {column: 3}});

      const contentQueries = [];
      for (let i = 0; i < 1000; i++) {
        const from = random() % content.length;
        const to = from + (random() % (content.length - from));
        contentQueries.push({from, to});
      }

      for (let chunkSize = 1; chunkSize <= 100; chunkSize++) {
        const text = Text.test.fromStringChunked(content, chunkSize);
        expect(text.lineCount()).toBe(lineCount + 1);
        expect(text.length()).toBe(content.length);
        for (const {from, to} of contentQueries)
          expect(text.content(from, to)).toBe(content.substring(from, to));
        expect(text.offsetToPosition(-1)).toBe({line: 0, column: 0});
        expect(text.offsetToPosition(0)).toBe({line: 0, column: 0});
        expect(text.offsetToPosition(content.length)).toBe({line: lineCount, column: 0});
        expect(text.offsetToPosition(content.length + 1)).toBe({line: lineCount, column: 0});
        for (const {line, column, offset, nonStrict} of locationQueries) {
          if (nonStrict) {
            expect(text.positionToOffset({line, column: nonStrict.column})).toBe(offset);
          } else {
            expect(text.offsetToPosition(offset)).toBe({line, column});
            expect(text.positionToOffset({line, column})).toBe(offset);
          }
        }
      }
    });
  });
}
