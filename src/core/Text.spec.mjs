import {Text} from './Text.mjs';
import {Random} from './Random.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('Text', () => {
    it('chunking', () => {
      expect(Text.test.chunks('', 5)).toBe([]);
      expect(Text.test.chunks('😀', 1)).toBe([
        {data: '😀', metrics: {length: 2, firstWidth: 1, lastWidth: 1, longestWidth: 1}}
      ]);
      expect(Text.test.chunks('ab', 1)).toBe([
        {data: 'a', metrics: {length: 1, firstWidth: 1, lastWidth: 1, longestWidth: 1}},
        {data: 'b', metrics: {length: 1, firstWidth: 1, lastWidth: 1, longestWidth: 1}}
      ]);
      expect(Text.test.chunks('ab', 5)).toBe([
        {data: 'ab', metrics: {length: 2, firstWidth: 2, lastWidth: 2, longestWidth: 2}}
      ]);
    });

    it('manual chunks', () => {
      let chunks = ['ab\ncd', 'def', '\n', '', 'a\n\n\nbbbc', 'xy', 'za\nh', 'pp', '\n', ''];
      let content = chunks.join('');
      let text = Text.fromChunks(chunks);
      expect(text.lineCount()).toBe(8);
      expect(text.length()).toBe(content.length);
      for (let from = 0; from <= content.length; from++) {
        for (let to = from; to <= content.length; to++)
          expect(text.content(from, to)).toBe(content.substring(from, to));
      }
    });

    it('all chunk sizes', () => {
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
        let text = Text.fromStringChunked(content, chunkSize);
        expect(text.lineCount()).toBe(lineCount + 1);
        expect(text.length()).toBe(content.length);
        for (let {from, to} of contentQueries)
          expect(text.content(from, to)).toBe(content.substring(from, to));
        expect(text.offsetToPosition(0)).toBe({line: 0, column: 0});
        expect(text.offsetToPosition(content.length)).toBe({line: lineCount, column: 0});
        expect(text.offsetToPosition(content.length + 1)).toBe(null);
        for (let {line, column, offset, nonStrict} of locationQueries) {
          if (nonStrict) {
            expect(text.positionToOffset({line, column: nonStrict.column})).toBe(offset);
          } else {
            expect(text.offsetToPosition(offset)).toBe({line, column});
            expect(text.positionToOffset({line, column})).toBe(offset);
            expect(text.positionToOffset({line, column}, true)).toBe(offset);
          }
        }
      }
    });
  });
}
