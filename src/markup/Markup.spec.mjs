import { Random } from '../utils/Random.mjs';
import { RoundMode } from '../utils/RoundMode.mjs';
import { Document } from '../text/Document.mjs';
import { Markup } from './Markup.mjs';
import { TestPlatformSupport } from '../../test/utils.mjs';
import { TextMeasurer } from '../text/TextMeasurer.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  function createTestMeasurer() {
    return {
      defaultWidth: () => 1,
      lineHeight: () => 3,
      defaultWidthRegex: () => null,
      measureString: s => s[0] <= 'z' ? s.charCodeAt(0) - 'a'.charCodeAt(0) + 1 : 100
    };
  }

  describe('Markup', () => {
    it('replace at chunk boundary should not hang', () => {
      let content = 'a'.repeat(6835);
      let document = new Document();
      document.reset(content);
      const platformSupport = new TestPlatformSupport();
      let markup = new Markup(createTestMeasurer(), document, platformSupport);
      platformSupport.runUntilIdle();
      document.replace(1674, 6835, '');
      platformSupport.runUntilIdle();
      expect(markup.contentWidth()).toBe(1674 * 1);
    });

    it('rechunk should respect utf', () => {
      let content = '😀😀😀😀😀😀';
      let document = new Document();
      document.reset(content);
      const platformSupport = new TestPlatformSupport();
      let markup = new Markup(createTestMeasurer(), document, platformSupport);
      platformSupport.runUntilIdle();
      Markup.test.rechunk(markup, 3, 3);
      platformSupport.runUntilIdle();
      expect(markup.contentWidth()).toBe(6 * 100);
    });

    it('markup points API all chunk sizes', () => {
      const textMeasurer = new TextMeasurer(null, s => s.charCodeAt(0) - 'a'.charCodeAt(0) + 1, s => 100);
      const random = Random(143);
      const lineCount = 200;
      const chunks = [];
      let longest = 0;
      const locationQueries = [];
      let offset = 0;
      for (let i = 0; i < lineCount; i++) {
        const s = 'abcdefghijklmnopqrstuvwxyz';
        const length = 1 + (random() % (s.length - 1));
        const chunk = s.substring(0, length);
        const width = textMeasurer._measureString(chunk, 0, length);
        longest = Math.max(longest, width);
        chunks.push(chunk + '\n');
        locationQueries.push({offset: offset, x: 0, y: i * 3, rounded: true});
        locationQueries.push({offset: offset + 1, x: 1, y: i * 3});
        locationQueries.push({offset: offset + length, x: width, y: i * 3});
        locationQueries.push({offset: offset + length, x: width, y: i * 3, nonStrict: {x: width + 3}});
        locationQueries.push({offset: offset + length, x: width, y: i * 3, nonStrict: {x: width + 100}});
        const column = random() % length;
        locationQueries.push({offset: offset + column, x: textMeasurer._measureString(chunk, 0, column), y: i * 3});
        offset += length + 1;
      }
      const content = chunks.join('');
      locationQueries.push({offset: content.length, x: 0, y: lineCount * 3});
      locationQueries.push({offset: content.length, x: 0, y: lineCount * 3, nonStrict: {x: 15}});

      const contentQueries = [];
      for (let i = 0; i < 1000; i++) {
        const from = random() % content.length;
        const to = from + (random() % (content.length - from));
        contentQueries.push({from, to});
      }

      for (let chunkSize = 1; chunkSize <= 100; chunkSize++) {
        const document = new Document();
        document.reset(content);
        const platformSupport = new TestPlatformSupport();
        const markup = new Markup(createTestMeasurer(), document, platformSupport);
        platformSupport.runUntilIdle();
        Markup.test.rechunk(markup, chunkSize);
        platformSupport.runUntilIdle();
        expect(markup.contentWidth()).toBe(longest);
        expect(markup.contentHeight()).toBe((lineCount + 1) * 3);
        expect(markup.offsetToPoint(0)).toBe({x: 0, y: 0});
        expect(markup.offsetToPoint(content.length)).toBe({x: 0, y: lineCount * 3});
        expect(markup.offsetToPoint(content.length + 1)).toBe({x: 0, y: lineCount * 3});
        for (const {offset, x, y, nonStrict, rounded} of locationQueries) {
          if (nonStrict) {
            expect(markup.pointToOffset({x: nonStrict.x, y}, RoundMode.Floor)).toBe(offset);
          } else {
            expect(markup.offsetToPoint(offset)).toBe({x, y});
            expect(markup.pointToOffset({x, y}, RoundMode.Floor)).toBe(offset);
            expect(markup.pointToOffset({x: x + 0.5, y: y + 0.5}, RoundMode.Floor)).toBe(offset);
            expect(markup.pointToOffset({x, y}, RoundMode.Floor)).toBe(offset);
            if (rounded) {
              expect(markup.pointToOffset({x: x + 0.4, y}, RoundMode.Round)).toBe(offset);
              expect(markup.pointToOffset({x: x + 0.5, y}, RoundMode.Round)).toBe(offset);
              expect(markup.pointToOffset({x: x + 0.6, y}, RoundMode.Round)).toBe(offset + 1);
              expect(markup.pointToOffset({x, y}, RoundMode.Ceil)).toBe(offset);
              expect(markup.pointToOffset({x: x + 0.5, y}, RoundMode.Ceil)).toBe(offset + 1);
              expect(markup.pointToOffset({x: x + 1, y}, RoundMode.Ceil)).toBe(offset + 1);
            }
          }
        }
      }
    });
  });
}
