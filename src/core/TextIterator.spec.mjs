import {Random} from './Random.mjs';
import {Text} from './Text.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  describe('TextIterator', () => {
    it('TextIterator basics', () => {
      let text = Text.fromString('world');
      let iterator = text.iterator(0);
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
      let text = Text.fromString('world');
      let iterator = text.iterator(0);
      iterator.advance(4);
      expect(iterator.current).toBe('d');
      iterator.advance(-2);
      expect(iterator.current).toBe('r');
    });

    it('TextIterator.read', () => {
      let text = Text.fromString('world');
      let iterator = text.iterator(0);
      expect(iterator.read(4)).toBe('worl');
      expect(iterator.current).toBe('d');
      expect(iterator.rread(2)).toBe('rl');
      expect(iterator.current).toBe('r');
    });

    it('TextIterator.charAt', () => {
      let text = Text.fromString('world');
      let iterator = text.iterator(2);
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
      let text = Text.fromString('hello, world');
      let iterator = text.iterator(0);
      expect(iterator.find('world')).toBe(true);
      expect(iterator.offset).toBe(7);
      expect(iterator.current).toBe('w');
    });

    it('TextIterator.find case-insensetive', () => {
      let text = Text.fromString('HELLO, WORLD');
      let iterator = text.iterator(0);
      expect(iterator.find('world', {caseInsensetive: true})).toBe(true);
      expect(iterator.offset).toBe(7);
      expect(iterator.current).toBe('W');
    });

    it('TextIterator.find manual chunks 1', () => {
      let text = Text.fromChunks(['hello, w', 'o', 'r', 'ld!!!']);
      let iterator = text.iterator(0);
      expect(iterator.find('world')).toBe(true);
      expect(iterator.offset).toBe(7);
      expect(iterator.current).toBe('w');
    });

    it('TextIterator.find manual chunks 2', () => {
      let text = Text.fromChunks(['hello', ',', ' ', 'w', 'orl', 'd!!!']);
      let iterator = text.iterator(0);
      expect(iterator.find('world')).toBe(true);
      expect(iterator.offset).toBe(7);
      expect(iterator.current).toBe('w');
    });

    it('TextIterator.find manual chunks 3', () => {
      let text = Text.fromChunks(['hello, w', 'or', 'ld', '!!!']);
      let iterator = text.iterator(0);
      expect(iterator.find('world')).toBe(true);
      expect(iterator.offset).toBe(7);
      expect(iterator.current).toBe('w');
    });

    it('TextIterator.find unsuccessful', () => {
      let text = Text.fromString('hello, world');
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
      let text = Text.fromStringChunked('/*abcdefghijklmonpqrsuvwxyz0123456789@!*/', 5);
      let iterator = text.iterator(0, 0, 8);
      expect(iterator.find('*/')).toBe(false);
      expect(iterator.offset).toBe(8);
      expect(iterator.outOfBounds()).toBe(true);
      expect(iterator.current).toBe(undefined);

      iterator.setConstraints(0, 100);
      expect(iterator.outOfBounds()).toBe(false);
      expect(iterator.current).toBe('g');
    });

    it('TextIterator constraints', () => {
      let text = Text.fromString('hello');
      let iterator = text.iterator(0, 0, 2);
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
      let text = Text.fromString('abcdefg');
      let iterator = text.iterator(4, 2, 4);
      expect(iterator.offset).toBe(4);
      expect(iterator.current).toBe(undefined);
      expect(iterator.charCodeAt(0)).toBe(NaN);
      expect(iterator.charAt(0)).toBe(undefined);
      expect(iterator.substr(2)).toBe('');
    });

    it('TextIterator.setConstraints', () => {
      let text = Text.fromString('012');
      let iterator = text.iterator(0, 0, 1);
      expect(iterator.outOfBounds()).toBe(false);
      expect(iterator.offset).toBe(0);
      expect(iterator.current).toBe('0');

      expect(iterator.advance(8)).toBe(1);
      expect(iterator.outOfBounds()).toBe(true);
      expect(iterator.offset).toBe(1);
      expect(iterator.current).toBe(undefined);

      iterator.setConstraints(0, 1);
      expect(iterator.outOfBounds()).toBe(true);
      expect(iterator.offset).toBe(1);
      expect(iterator.current).toBe(undefined);

      iterator.setConstraints(1, 3);
      expect(iterator.outOfBounds()).toBe(false);
      expect(iterator.offset).toBe(1);
      expect(iterator.current).toBe('1');

      expect(iterator.advance(-1)).toBe(-1);
      expect(iterator.outOfBounds()).toBe(true);
      expect(iterator.offset).toBe(0);
      expect(iterator.current).toBe(undefined);

      expect(iterator.advance(2)).toBe(2);
      expect(iterator.outOfBounds()).toBe(false);
      expect(iterator.offset).toBe(2);
      expect(iterator.current).toBe('2');
    });

    it('TextIterator all sizes', () => {
      let random = Random(144);
      let lineCount = 20;
      let chunks = [];
      for (let i = 0; i < lineCount; i++) {
        let s = 'abcdefghijklmnopqrstuvwxyz';
        let length = 1 + (random() % (s.length - 1));
        chunks.push(s.substring(0, length) + '\n');
      }
      let content = chunks.join('');

      for (let chunkSize = 1; chunkSize <= 101; chunkSize += 10) {
        let text = Text.fromStringChunked(content, chunkSize);
        for (let from = 0; from <= content.length; from++) {
          let iterator = text.iterator(from, from, content.length);
          let length = content.length - from;
          expect(iterator.length()).toBe(length);
          let s = content.substring(from, content.length);
          let p = new Array(length).fill(0);
          for (let i = 1; i < length; i++) {
            let j = random() % (i + 1);
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
