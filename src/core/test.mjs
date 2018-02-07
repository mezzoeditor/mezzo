import {TestRunner, Reporter, Matchers} from '../../utils/testrunner/index.mjs';
import {Chunk} from './Chunk.mjs';
import {Text} from './Text.mjs';
import {Document} from './Document.mjs';
import {Random} from './Random.mjs';

const runner = new TestRunner();

const {describe, xdescribe, fdescribe} = runner;
const {it, fit, xit} = runner;
const {beforeAll, beforeEach, afterAll, afterEach} = runner;

const {expect} = new Matchers();

describe('Chunk', () => {
  it('Chunk.metrics', () => {
    expect(Chunk.metrics('one line')).toEqual({length: 8, first: 8, last: 8, longest: 8});
    expect(Chunk.metrics('\none line')).toEqual({length: 9, first: 0, last: 8, longest: 8, lines: 1});
    expect(Chunk.metrics('one line\n')).toEqual({length: 9, first: 8, last: 0, longest: 8, lines: 1});
    expect(Chunk.metrics('\none line\n')).toEqual({length: 10, first: 0, last: 0, longest: 8, lines: 2});
    expect(Chunk.metrics('short\nlongest\nlonger\ntiny')).toEqual({length: 25, first: 5, last: 4, longest: 7, lines: 3});
  });

  it('Chunk.offsetToPosition and positionToOffset', () => {
    let tests = [
      {chunk: 'short', before: {offset: 15, line: 3, column: 8}, position: {line: 3, column: 11, offset: 18}},
      {chunk: 'short\nlonger', before: {offset: 15, line: 3, column: 8}, position: {line: 3, column: 11, offset: 18}},
      {chunk: 'short\nlonger', before: {offset: 15, line: 3, column: 8}, position: {line: 3, column: 13, offset: 20}},
      {chunk: 'short\nlonger', before: {offset: 15, line: 3, column: 8}, position: {line: 4, column: 0, offset: 21}},
      {chunk: '1\n23\n456\n78\n9\n0', before: {offset: 15, line: 3, column: 8}, position: {line: 7, column: 1, offset: 28}},
    ];
    for (let test of tests) {
      expect(Chunk.offsetToPosition(test.chunk, test.before, test.position.offset)).toEqual(test.position);
      expect(Chunk.positionToOffset(test.chunk, test.before, test.position, false /* clamp */)).toEqual(test.position.offset);
      expect(Chunk.positionToOffset(test.chunk, test.before, test.position, true /* clamp */)).toEqual(test.position.offset);
    }

    let clamped = [
      {chunk: 'short', before: {offset: 15, line: 3, column: 8}, position: {line: 3, column: 22}, offset: 20},
      {chunk: 'short\nlonger', before: {offset: 15, line: 3, column: 8}, position: {line: 3, column: 22}, offset: 20},
      {chunk: 'short\nlonger', before: {offset: 15, line: 3, column: 8}, position: {line: 4, column: 22}, offset: 27},
      {chunk: '1\n23\n456\n78\n9\n0', before: {offset: 15, line: 3, column: 8}, position: {line: 7, column: 22}, offset: 28},
    ];
    for (let test of clamped)
      expect(Chunk.positionToOffset(test.chunk, test.before, test.position, true /* clamp */)).toEqual(test.offset);
  });
});

describe('Text', () => {
  it('Text.* manual', () => {
    let chunks = ['ab\ncd', 'def', '\n', '', 'a\n\n\nbbbc', 'xy', 'za\nh', 'pp', '\n', ''];
    let content = chunks.join('');
    let text = Text.test.fromChunks(chunks);
    expect(text.lineCount()).toBe(8);
    expect(text.longestLineLength()).toBe(8);
    expect(text.length()).toBe(content.length);
    for (let from = 0; from <= content.length; from++) {
      for (let to = from; to <= content.length; to++)
        expect(text.content(from, to)).toBe(content.substring(from, to));
    }
  });

  it('Text.* all sizes', () => {
    let random = Random(143);
    let lineCount = 200;
    let chunks = [];
    let longest = 0;
    let positionQueries = [];
    let offset = 0;
    for (let i = 0; i < lineCount; i++) {
      let s = 'abcdefghijklmnopqrstuvwxyz';
      let length = 1 + (random() % (s.length - 1));
      longest = Math.max(longest, length);
      chunks.push(s.substring(0, length) + '\n');
      positionQueries.push({line: i, column: 0, offset: offset});
      positionQueries.push({line: i, column: 1, offset: offset + 1});
      positionQueries.push({line: i, column: length, offset: offset + length});
      positionQueries.push({line: i, column: length + 1, offset: offset + length, clampOnly: true});
      positionQueries.push({line: i, column: length + 100, offset: offset + length, clampOnly: true});
      let column = random() % length;
      positionQueries.push({line: i, column: column, offset: offset + column});
      offset += length + 1;
    }
    let content = chunks.join('');

    let contentQueries = [];
    for (let i = 0; i < 1000; i++) {
      let from = random() % content.length;
      let to = from + (random() % (content.length - from));
      contentQueries.push({from, to});
    }

    for (let chunkSize = 1; chunkSize <= 100; chunkSize++) {
      Text.test.setDefaultChunkSize(chunkSize);
      let text = Text.withContent(content);
      expect(text.lineCount()).toBe(lineCount + 1);
      expect(text.longestLineLength()).toBe(longest);
      expect(text.length()).toBe(content.length);
      for (let {from, to} of contentQueries)
        expect(text.content(from, to)).toBe(content.substring(from, to));
      expect(text.offsetToPosition(0)).toEqual({line: 0, column: 0, offset: 0});
      expect(text.offsetToPosition(content.length)).toEqual({line: lineCount, column: 0, offset: content.length});
      expect(text.offsetToPosition(content.length + 1)).toBe(null);
      for (let {line, column, offset, clampOnly} of positionQueries) {
        if (clampOnly) {
          expect(text.positionToOffset({line, column}, true)).toBe(offset);
        } else {
          expect(text.offsetToPosition(offset)).toEqual({line, column, offset});
          expect(text.positionToOffset({line, column}, true)).toBe(offset);
          expect(text.positionToOffset({line, column}, false)).toBe(offset);
        }
      }
    }
  });
});

describe('Text.Iterator', () => {
  it('Text.Iterator basics', () => {
    let text = Text.withContent('world');
    let it = text.iterator(0);
    expect(it.current).toBe('w');
    expect(it.offset).toBe(0);
    it.next();
    expect(it.current).toBe('o');
    expect(it.offset).toBe(1);
    it.prev();
    expect(it.current).toBe('w');
    expect(it.offset).toBe(0);
  });

  it('Text.Iterator.advance', () => {
    let text = Text.withContent('world');
    let it = text.iterator(0);
    it.advance(4);
    expect(it.current).toBe('d');
    it.advance(-2);
    expect(it.current).toBe('r');
  });

  it('Text.Iterator.find successful', () => {
    let text = Text.withContent('hello, world');
    let it = text.iterator(0);
    expect(it.find('world')).toBe(true);
    expect(it.offset).toBe(7);
    expect(it.current).toBe('w');
  });

  it('Text.Iterator.find manual chunks 1', () => {
    let text = Text.test.fromChunks(['hello, w', 'o', 'r', 'ld!!!']);
    let it = text.iterator(0);
    expect(it.find('world')).toBe(true);
    expect(it.offset).toBe(7);
    expect(it.current).toBe('w');
  });

  it('Text.Iterator.find manual chunks 2', () => {
    let text = Text.test.fromChunks(['hello', ',', ' ', 'w', 'orl', 'd!!!']);
    let it = text.iterator(0);
    expect(it.find('world')).toBe(true);
    expect(it.offset).toBe(7);
    expect(it.current).toBe('w');
  });

  it('Text.Iterator.find manual chunks 3', () => {
    let text = Text.test.fromChunks(['hello, w', 'or', 'ld', '!!!']);
    let it = text.iterator(0);
    expect(it.find('world')).toBe(true);
    expect(it.offset).toBe(7);
    expect(it.current).toBe('w');
  });

  it('Text.Iterator.find unsuccessful', () => {
    let text = Text.withContent('hello, world');
    let it = text.iterator(0);
    expect(it.find('eee')).toBe(false);
    expect(it.offset).toBe(12);
    expect(it.current).toBe(undefined);

    it = text.iterator(0, 0, 3);
    expect(it.find('hello')).toBe(false);
    expect(it.offset).toBe(3);
    expect(it.current).toBe(undefined);
  });

  it('Text.Iterator constraints', () => {
    let text = Text.withContent('hello');
    let it = text.iterator(0, 0, 2);
    expect(it.offset).toBe(0);
    expect(it.current).toBe('h');

    it.prev();
    expect(it.offset).toBe(0);
    expect(it.current).toBe('h');

    it.next();
    expect(it.offset).toBe(1);
    expect(it.current).toBe('e');

    it.next();
    expect(it.offset).toBe(2);
    expect(it.current).toBe(undefined);

    it.next();
    expect(it.offset).toBe(2);
    expect(it.current).toBe(undefined);

    it.advance(-2);
    expect(it.offset).toBe(0);
    expect(it.current).toBe('h');
  });

  it('Text.Iterator out-of-bounds API', () => {
    let text = Text.withContent('abcdefg');
    let it = text.iterator(4, 2, 4);
    expect(it.offset).toBe(4);
    expect(it.current).toBe(undefined);
    expect(it.charCodeAt(0)).toBe(NaN);
    expect(it.charAt(0)).toBe(undefined);
    expect(it.substr(2)).toBe('');
  });

  it('Text.Iterator all sizes', () => {
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
      Text.test.setDefaultChunkSize(chunkSize);
      let text = Text.withContent(content);
      for (let from = 0; from <= content.length; from++) {
        let it = text.iterator(from, from, content.length);
        let length = content.length - from;
        expect(it.length()).toBe(length);
        let s = content.substring(from, content.length);
        let p = new Array(length).fill(0);
        for (let i = 1; i < length; i++) {
          let j = random() % (i + 1);
          p[i] = p[j];
          p[j] = i;
        }

        for (let i = 0; i < length; i++) {
          it.advance(p[i] - (i ? p[i - 1] : 0));
          expect(it.offset).toBe(from + p[i]);
          expect(it.current).toBe(s[p[i]]);
          if (i <= 1) {
            for (let len = 0; len <= length - p[i] + 1; len++)
              expect(it.substr(len)).toBe(s.substring(p[i], p[i] + len));
          }
          expect(it.outOfBounds()).toBe(false);
        }
      }
    }
  });
});

describe('Viewport', () => {
  beforeEach(state => {
    let document = new Document();
    document.reset(new Array(10).fill('').join('\n'));
    state.viewport = document.createViewport(10, 10);
    state.viewport.setSize(100, 100);
    state.viewport.vScrollbar.setSize(100);
  });

  describe('Viewport.Scrollbars', () => {
    it('should update thumb', ({viewport}) => {
      expect(viewport.vScrollbar.thumbOffset()).toBe(0);
      expect(viewport.vScrollbar.thumbSize()).toBe(100);

      viewport.setPadding({ top: 100 });
      expect(viewport.vScrollbar.thumbOffset()).toBe(0);
      expect(viewport.vScrollbar.thumbSize()).toBe(50);
      expect(viewport._maxScrollTop).toBe(100);

      viewport.advanceScroll(50, 50);
      expect(viewport._scrollLeft).toBe(0);
      expect(viewport.vScrollbar.thumbOffset()).toBe(25);
      expect(viewport.vScrollbar.thumbSize()).toBe(50);
    });
    it('Scrollbar coordinate conversion', ({viewport}) => {
      let scrollbar = viewport.vScrollbar;

      viewport.setPadding({ top: 100 });
      expect(scrollbar.thumbOffset()).toBe(0);
      expect(scrollbar.thumbSize()).toBe(50);
      expect(scrollbar.contentOffsetToScrollbarOffset(50)).toBe(25);
      expect(scrollbar.scrollbarOffsetToContentOffset(25)).toBe(50);

      scrollbar.setSize(200);
      expect(scrollbar.thumbOffset()).toBe(0);
      expect(scrollbar.thumbSize()).toBe(100);
      expect(scrollbar.contentOffsetToScrollbarOffset(50)).toBe(50);
      expect(scrollbar.scrollbarOffsetToContentOffset(50)).toBe(50);
    });
  });
});


new Reporter(runner);
runner.run();

