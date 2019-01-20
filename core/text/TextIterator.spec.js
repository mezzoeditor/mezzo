import { Random } from '../utils/Random.js';
import { Text } from './Text.js';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('TextIterator', () => {
    it('TextIterator basics', () => {
      const text = Text.fromString('world');
      const iterator = text.iterator(0);
      expect(iterator.current).toBe('w');
      expect(iterator.offset).toBe(0);
      iterator.next();
      expect(iterator.current).toBe('o');
      expect(iterator.offset).toBe(1);
      iterator.prev();
      expect(iterator.current).toBe('w');
      expect(iterator.offset).toBe(0);
    });

    it('TextIterator.advance', () => {
      const text = Text.fromString('world');
      const iterator = text.iterator(0);
      iterator.advance(4);
      expect(iterator.current).toBe('d');
      iterator.advance(-2);
      expect(iterator.current).toBe('r');
    });

    it('TextIterator.read', () => {
      const text = Text.fromString('world');
      const iterator = text.iterator(0);
      expect(iterator.read(4)).toBe('worl');
      expect(iterator.current).toBe('d');
      expect(iterator.rread(2)).toBe('rl');
      expect(iterator.current).toBe('r');
    });

    it('TextIterator.charAt', () => {
      const text = Text.fromString('world');
      const iterator = text.iterator(2);
      expect(iterator.charAt(0)).toBe('r');
      expect(iterator.offset).toBe(2);
      expect(iterator.charAt(1)).toBe('l');
      expect(iterator.offset).toBe(2);
      expect(iterator.charAt(2)).toBe('d');
      expect(iterator.offset).toBe(2);
      expect(iterator.charAt(3)).toBe(undefined);
      expect(iterator.offset).toBe(2);
      expect(iterator.charAt(4)).toBe(undefined);
      expect(iterator.offset).toBe(2);
      expect(iterator.charAt(-1)).toBe('o');
      expect(iterator.offset).toBe(2);
      expect(iterator.charAt(-2)).toBe('w');
      expect(iterator.offset).toBe(2);
      expect(iterator.charAt(-3)).toBe(undefined);
      expect(iterator.offset).toBe(2);
      expect(iterator.charAt(-4)).toBe(undefined);
      expect(iterator.offset).toBe(2);
    });

    it('TextIterator.find successful', () => {
      const text = Text.fromString('hello, world');
      const iterator = text.iterator(0);
      expect(iterator.find('world')).toBe(true);
      expect(iterator.offset).toBe(7);
      expect(iterator.current).toBe('w');
    });

    it('TextIterator.find case-insensetive', () => {
      const text = Text.fromString('HELLO, WORLD');
      const iterator = text.iterator(0);
      expect(iterator.find('world', {caseInsensetive: true})).toBe(true);
      expect(iterator.offset).toBe(7);
      expect(iterator.current).toBe('W');
    });

    it('TextIterator.find manual chunks 1', () => {
      const text = Text.test.fromChunks(['hello, w', 'o', 'r', 'ld!!!']);
      const iterator = text.iterator(0);
      expect(iterator.find('world')).toBe(true);
      expect(iterator.offset).toBe(7);
      expect(iterator.current).toBe('w');
    });

    it('TextIterator.find manual chunks 2', () => {
      const text = Text.test.fromChunks(['hello', ',', ' ', 'w', 'orl', 'd!!!']);
      const iterator = text.iterator(0);
      expect(iterator.find('world')).toBe(true);
      expect(iterator.offset).toBe(7);
      expect(iterator.current).toBe('w');
    });

    it('TextIterator.find manual chunks 3', () => {
      const text = Text.test.fromChunks(['hello, w', 'or', 'ld', '!!!']);
      const iterator = text.iterator(0);
      expect(iterator.find('world')).toBe(true);
      expect(iterator.offset).toBe(7);
      expect(iterator.current).toBe('w');
    });

    it('TextIterator.find unsuccessful', () => {
      const text = Text.fromString('hello, world');
      let iterator = text.iterator(0);
      expect(iterator.find('eee')).toBe(false);
      expect(iterator.offset).toBe(12);
      expect(iterator.current).toBe(undefined);

      iterator = text.iterator(0, 0, 3);
      expect(iterator.find('hello')).toBe(false);
      expect(iterator.offset).toBe(3);
      expect(iterator.current).toBe(undefined);
    });

    it('TextIteratof.find unsuccessful across chunks', () => {
      const text = Text.test.fromStringChunked('/*abcdefghijklmonpqrsuvwxyz0123456789@!*/', 5);
      let iterator = text.iterator(0, 0, 8);
      expect(iterator.find('*/')).toBe(false);
      expect(iterator.offset).toBe(8);
      expect(iterator.outOfBounds()).toBe(true);
      expect(iterator.current).toBe(undefined);

      iterator = text.iterator(8, 0, 100);
      expect(iterator.outOfBounds()).toBe(false);
      expect(iterator.current).toBe('g');
    });

    it('TextIterator constraints', () => {
      const text = Text.fromString('hello');
      const iterator = text.iterator(0, 0, 2);
      expect(iterator.offset).toBe(0);
      expect(iterator.current).toBe('h');

      iterator.prev();
      expect(iterator.offset).toBe(-1);
      expect(iterator.current).toBe(undefined);

      iterator.prev();
      expect(iterator.offset).toBe(-1);
      expect(iterator.current).toBe(undefined);

      iterator.next();
      expect(iterator.offset).toBe(0);
      expect(iterator.current).toBe('h');

      iterator.next();
      expect(iterator.offset).toBe(1);
      expect(iterator.current).toBe('e');

      iterator.next();
      expect(iterator.offset).toBe(2);
      expect(iterator.current).toBe(undefined);

      iterator.next();
      expect(iterator.offset).toBe(2);
      expect(iterator.current).toBe(undefined);

      iterator.advance(-2);
      expect(iterator.offset).toBe(0);
      expect(iterator.current).toBe('h');
    });

    it('TextIterator out-of-bounds API', () => {
      const text = Text.fromString('abcdefg');
      const iterator = text.iterator(4, 2, 4);
      expect(iterator.offset).toBe(4);
      expect(iterator.current).toBe(undefined);
      expect(iterator.charCodeAt(0)).toBe(NaN);
      expect(iterator.charAt(0)).toBe(undefined);
      expect(iterator.substr(2)).toBe('');
    });

    it('TextIterator all sizes', () => {
      const random = Random(144);
      const lineCount = 20;
      const chunks = [];
      for (let i = 0; i < lineCount; i++) {
        const s = 'abcdefghijklmnopqrstuvwxyz';
        const length = 1 + (random() % (s.length - 1));
        chunks.push(s.substring(0, length) + '\n');
      }
      const content = chunks.join('');

      for (let chunkSize = 1; chunkSize <= 101; chunkSize += 10) {
        const text = Text.test.fromStringChunked(content, chunkSize);
        for (let from = 0; from <= content.length; from++) {
          const iterator = text.iterator(from, from, content.length);
          const length = content.length - from;
          expect(iterator.length()).toBe(length);
          const s = content.substring(from, content.length);
          const p = new Array(length).fill(0);
          for (let i = 1; i < length; i++) {
            const j = random() % (i + 1);
            p[i] = p[j];
            p[j] = i;
          }

          for (let i = 0; i < length; i++) {
            iterator.advance(p[i] - (i ? p[i - 1] : 0));
            expect(iterator.offset).toBe(from + p[i]);
            expect(iterator.current).toBe(s[p[i]]);

            if (i === 0) {
              expect(iterator.rread(p[i])).toBe(s.substring(0, p[i]));
              expect(iterator.offset).toBe(from);
              expect(iterator.current).toBe(s[0]);

              expect(iterator.read(p[i])).toBe(s.substring(0, p[i]));
              expect(iterator.offset).toBe(from + p[i]);
              expect(iterator.current).toBe(s[p[i]]);
            }

            if (i <= 1) {
              for (let len = 0; len <= length - p[i] + 1; len++)
                expect(iterator.substr(len)).toBe(s.substring(p[i], p[i] + len));
              for (let len = 0; len <= p[i]; len++)
                expect(iterator.rsubstr(len)).toBe(s.substring(p[i] - len, p[i]));
            }
            expect(iterator.outOfBounds()).toBe(false);
          }
        }
      }
    });
  });
}
