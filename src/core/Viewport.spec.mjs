import {Random} from './Random.mjs';
import {Metrics, RoundMode} from './Metrics.mjs';
import {Document} from './Document.mjs';
import {Viewport} from './Viewport.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  function createTestMetrics() {
    return new Metrics(null, s => s.charCodeAt(0) - 'a'.charCodeAt(0) + 1, s => 100);
  }

  function createTestMeasurer() {
    return {
      defaultWidth: () => 1,
      lineHeight: () => 3,
      defaultWidthRegex: () => null,
      measureString: s => s[0] <= 'z' ? s.charCodeAt(0) - 'a'.charCodeAt(0) + 1 : 100
    };
  }

  describe('Viewport', () => {
    it('Viewport points API all chunk sizes', () => {
      let testMetrics = createTestMetrics();
      let random = Random(143);
      let lineCount = 200;
      let chunks = [];
      let longest = 0;
      let locationQueries = [];
      let offset = 0;
      for (let i = 0; i < lineCount; i++) {
        let s = 'abcdefghijklmnopqrstuvwxyz';
        let length = 1 + (random() % (s.length - 1));
        let chunk = s.substring(0, length);
        let width = testMetrics._measureString(chunk, 0, length);
        longest = Math.max(longest, width);
        chunks.push(chunk + '\n');
        locationQueries.push({offset: offset, x: 0, y: i * 3, rounded: true});
        locationQueries.push({offset: offset + 1, x: 1, y: i * 3});
        locationQueries.push({offset: offset + length, x: width, y: i * 3});
        locationQueries.push({offset: offset + length, x: width, y: i * 3, nonStrict: {x: width + 3}});
        locationQueries.push({offset: offset + length, x: width, y: i * 3, nonStrict: {x: width + 100}});
        let column = random() % length;
        locationQueries.push({offset: offset + column, x: testMetrics._measureString(chunk, 0, column), y: i * 3});
        offset += length + 1;
      }
      let content = chunks.join('');
      locationQueries.push({offset: content.length, x: 0, y: lineCount * 3});
      locationQueries.push({offset: content.length, x: 0, y: lineCount * 3, nonStrict: {x: 15}});

      let contentQueries = [];
      for (let i = 0; i < 1000; i++) {
        let from = random() % content.length;
        let to = from + (random() % (content.length - from));
        contentQueries.push({from, to});
      }

      for (let chunkSize = 1; chunkSize <= 100; chunkSize++) {
        let document = new Document();
        document.reset(content);
        let viewport = new Viewport(document, createTestMeasurer());
        Viewport.test.rechunk(viewport, chunkSize);
        expect(viewport.contentWidth()).toBe(longest);
        expect(viewport.contentHeight()).toBe((lineCount + 1) * 3);
        expect(viewport.offsetToContentPoint(0)).toEqual({x: 0, y: 0});
        expect(viewport.offsetToContentPoint(content.length)).toEqual({x: 0, y: lineCount * 3});
        expect(viewport.offsetToContentPoint(content.length + 1)).toBe(null);
        for (let {offset, x, y, nonStrict, rounded} of locationQueries) {
          if (nonStrict) {
            expect(viewport.contentPointToOffset({x: nonStrict.x, y}, RoundMode.Floor)).toBe(offset);
          } else {
            expect(viewport.offsetToContentPoint(offset)).toEqual({x, y});
            expect(viewport.contentPointToOffset({x, y}, RoundMode.Floor)).toBe(offset);
            expect(viewport.contentPointToOffset({x: x + 0.5, y: y + 0.5}, RoundMode.Floor, false /* strict */)).toBe(offset);
            expect(viewport.contentPointToOffset({x, y}, RoundMode.Floor, true /* strict */)).toBe(offset);
            if (rounded) {
              expect(viewport.contentPointToOffset({x: x + 0.4, y}, RoundMode.Round, true /* strict */)).toBe(offset);
              expect(viewport.contentPointToOffset({x: x + 0.5, y}, RoundMode.Round, true /* strict */)).toBe(offset);
              expect(viewport.contentPointToOffset({x: x + 0.6, y}, RoundMode.Round, true /* strict */)).toBe(offset + 1);
              expect(viewport.contentPointToOffset({x, y}, RoundMode.Ceil, true /* strict */)).toBe(offset);
              expect(viewport.contentPointToOffset({x: x + 0.5, y}, RoundMode.Ceil, true /* strict */)).toBe(offset + 1);
              expect(viewport.contentPointToOffset({x: x + 1, y}, RoundMode.Ceil, true /* strict */)).toBe(offset + 1);
            }
          }
        }
      }
    });
  });
}
