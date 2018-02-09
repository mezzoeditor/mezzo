import {TestRunner, Reporter, Matchers} from '../../utils/testrunner/index.mjs';
import {Chunk} from './Chunk.mjs';
import {Text} from './Text.mjs';
import {Document} from './Document.mjs';
import {Random} from './Random.mjs';
import {Decorator} from './Decorator.mjs';

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

  it('Text.replace all sizes', () => {
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
      Text.test.setDefaultChunkSize(chunkSize);
      content = chunks.join('');
      let text = Text.withContent(content);
      for (let {from, to, insertion} of editQueries) {
        text = text.replace(from, to, insertion);
        content = content.substring(0, from) + insertion + content.substring(to, content.length);
        expect(text.length()).toBe(content.length);
        for (let from = 0; from <= content.length; from++) {
          for (let to = from; to <= content.length; to++)
            expect(text.content(from, to)).toBe(content.substring(from, to));
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

describe('Decorator', () => {
  function checkOne(got, expected) {
    if (!expected) {
      expect(got).toBe(null);
    } else {
      expect(got.from).toBe(expected.from);
      expect(got.to).toBe(expected.to);
      expect(got.style).toBe(expected.style);
    }
  }

  function checkList(got, expected) {
    expect(got.length).toBe(expected.length);
    for (let i = 0; i < got.length; i++)
      checkOne(got[i], expected[i]);
  }

  function checkVisitor(callback, expected) {
    let got = [];
    callback(got.push.bind(got));
    checkList(got, expected);
  }

  it('Decorator getters', () => {
    let dec = new Decorator();
    let a = {from: 0, to: 1, style: 'a'};
    let b = {from: 0, to: 0, style: 'b'};
    let c = {from: 2, to: 3, style: 'c'};
    let d = {from: 15, to: 33, style: 'd'};
    let e = {from: 8, to: 12, style: 'e'};
    let f = {from: 8, to: 8, style: 'f'};
    let g = {from: 12, to: 12, style: 'g'};
    for (let x of [a, b, c, d, e, f, g])
      dec.add(x.from, x.to, x.style);

    expect(dec.countAll()).toBe(7);
    expect(dec.countStarting(0, 4)).toBe(3);
    expect(dec.countStarting(1, 4)).toBe(1);
    expect(dec.countStarting(9, 10)).toBe(0);
    expect(dec.countStarting(12, 12)).toBe(1);
    expect(dec.countEnding(3, 8)).toBe(2);
    expect(dec.countEnding(0, 40)).toBe(7);
    expect(dec.countEnding(8, 8)).toBe(1);
    expect(dec.countEnding(2, 4)).toBe(1);
    expect(dec.countTouching(0, 0)).toBe(2);
    expect(dec.countTouching(0, 14)).toBe(6);
    expect(dec.countTouching(1, 15)).toBe(6);
    expect(dec.countTouching(9, 10)).toBe(1);
    expect(dec.countTouching(13, 14)).toBe(0);

    checkList(dec.listAll(), [b, a, c, f, e, g, d]);
    checkList(dec.listStarting(0, 4), [b, a, c]);
    checkList(dec.listStarting(1, 4), [c]);
    checkList(dec.listStarting(9, 10), []);
    checkList(dec.listStarting(12, 12), [g]);
    checkList(dec.listEnding(3, 8), [c, f]);
    checkList(dec.listEnding(0, 40), [b, a, c, f, e, g, d]);
    checkList(dec.listEnding(8, 8), [f]);
    checkList(dec.listEnding(2, 4), [c]);
    checkList(dec.listTouching(0, 0), [b, a]);
    checkList(dec.listTouching(0, 14), [b, a, c, f, e, g]);
    checkList(dec.listTouching(1, 15), [a, c, f, e, g, d]);
    checkList(dec.listTouching(9, 10), [e]);
    checkList(dec.listTouching(13, 14), []);

    checkOne(dec.firstAll(), b);
    checkOne(dec.firstStarting(0, 4), b);
    checkOne(dec.firstStarting(1, 4), c);
    checkOne(dec.firstStarting(9, 10), null);
    checkOne(dec.firstStarting(12, 12), g);
    checkOne(dec.firstEnding(3, 8), c);
    checkOne(dec.firstEnding(0, 40), b);
    checkOne(dec.firstEnding(8, 8), f);
    checkOne(dec.firstEnding(2, 4), c);
    checkOne(dec.firstTouching(0, 0), b);
    checkOne(dec.firstTouching(0, 14), b);
    checkOne(dec.firstTouching(1, 15), a);
    checkOne(dec.firstTouching(9, 10), e);
    checkOne(dec.firstTouching(13, 14), null);

    checkOne(dec.lastAll(), d);
    checkOne(dec.lastStarting(0, 4), c);
    checkOne(dec.lastStarting(1, 4), c);
    checkOne(dec.lastStarting(9, 10), null);
    checkOne(dec.lastStarting(12, 12), g);
    checkOne(dec.lastEnding(3, 8), f);
    checkOne(dec.lastEnding(0, 40), d);
    checkOne(dec.lastEnding(8, 8), f);
    checkOne(dec.lastEnding(2, 4), c);
    checkOne(dec.lastTouching(0, 0), a);
    checkOne(dec.lastTouching(0, 14), g);
    checkOne(dec.lastTouching(1, 15), d);
    checkOne(dec.lastTouching(9, 10), e);
    checkOne(dec.lastTouching(13, 14), null);

    checkVisitor(v => dec.visitAll(v), [b, a, c, f, e, g, d]);
    checkVisitor(v => dec.visitStarting(0, 4, v), [b, a, c]);
    checkVisitor(v => dec.visitStarting(1, 4, v), [c]);
    checkVisitor(v => dec.visitStarting(9, 10, v), []);
    checkVisitor(v => dec.visitStarting(12, 12, v), [g]);
    checkVisitor(v => dec.visitEnding(3, 8, v), [c, f]);
    checkVisitor(v => dec.visitEnding(0, 40, v), [b, a, c, f, e, g, d]);
    checkVisitor(v => dec.visitEnding(8, 8, v), [f]);
    checkVisitor(v => dec.visitEnding(2, 4, v), [c]);
    checkVisitor(v => dec.visitTouching(0, 0, v), [b, a]);
    checkVisitor(v => dec.visitTouching(0, 14, v), [b, a, c, f, e, g]);
    checkVisitor(v => dec.visitTouching(1, 15, v), [a, c, f, e, g, d]);
    checkVisitor(v => dec.visitTouching(9, 10, v), [e]);
    checkVisitor(v => dec.visitTouching(13, 14, v), []);
  });

  it('Decorator.onReplace manual', () => {
    let before = {from: 10, to: 20};
    let cases = [
      {from: 0, to: 1, inserted: 5, expected: [{from: 14, to: 24}]},
      {from: 30, to: 40, inserted: 5, expected: [{from: 10, to: 20}]},
      {from: 5, to: 5, inserted: 5, expected: [{from: 15, to: 25}]},
      {from: 2, to: 7, inserted: 0, expected: [{from: 5, to: 15}]},
      {from: 5, to: 10, inserted: 0, expected: [{from: 5, to: 15}]},
      {from: 5, to: 10, inserted: 3, expected: [{from: 8, to: 18}]},
      {from: 20, to: 20, inserted: 4, expected: [{from: 10, to: 24}]},
      {from: 20, to: 30, inserted: 3, expected: [{from: 10, to: 23}]},
      {from: 5, to: 25, inserted: 30, expected: []},
      {from: 10, to: 10, inserted: 5, expected: [{from: 15, to: 25}]},
      {from: 10, to: 20, inserted: 3, expected: [{from: 13, to: 13}]},
      {from: 12, to: 15, inserted: 0, expected: [{from: 10, to: 17}]},
      {from: 13, to: 17, inserted: 4, expected: [{from: 10, to: 20}]},
      {from: 13, to: 17, inserted: 14, expected: [{from: 10, to: 30}]},
      {from: 8, to: 15, inserted: 0, expected: []},
      {from: 8, to: 15, inserted: 6, expected: []},
      {from: 15, to: 25, inserted: 0, expected: [{from: 10, to: 15}]},
      {from: 15, to: 25, inserted: 3, expected: [{from: 10, to: 18}]},
      {from: 15, to: 20, inserted: 4, expected: [{from: 10, to: 19}]},
    ];

    for (let test of cases) {
      let {from, to, inserted, expected} = test;
      let dec = new Decorator();
      dec.add(before.from, before.to, '');
      dec.onReplace(from, to, inserted);
      let got = dec.listAll();
      expect(got.length).toBe(expected.length, `test: ${JSON.stringify(test)}`);
      for (let i = 0; i < got.length; i++) {
        expect(got[i].from).toBe(expected[i].from, `test: ${JSON.stringify(test)}`);
        expect(got[i].to).toBe(expected[i].to, `test: ${JSON.stringify(test)}`);
      }
    }
  });

  it('Decorator.onReplace large list to the right', () => {
    let dec = new Decorator();
    let count = 10000;
    for (let i = 0; i < count; i++)
      dec.add(i + 200, i + 200, '');
    for (let i = 0; i < 99; i++)
      dec.onReplace(2 * i, 2 * i + 1, 2);
    let list = dec.listAll();
    expect(list.length).toBe(count);
    for (let i = 0; i < count; i++) {
      expect(list[i].from).toBe(i + 200 + 99);
      expect(list[i].to).toBe(i + 200 + 99);
    }
  });

  it('Decorator.editing', () => {
    let dec = new Decorator();
    let a = {from: 0, to: 1, style: 'a'};
    let b = {from: 2, to: 3, style: 'b'};
    let c = {from: 3, to: 3, style: 'c'};
    let d = {from: 10, to: 20, style: 'd'};
    let e = {from: 21, to: 100, style: 'e'};

    for (let x of [c, a, d, b, e])
      dec.add(x.from, x.to, x.style);
    checkList(dec.listAll(), [a, b, c, d, e]);

    dec.remove(e.from, e.to, false /* relaxed */);
    checkList(dec.listAll(), [a, b, c, d]);

    dec.remove(e.from, e.to, true /* relaxed */);
    checkList(dec.listAll(), [a, b, c, d]);

    dec.clearStarting(5, 15);
    checkList(dec.listAll(), [a, b, c]);

    dec.add(e.from, e.to, e.style);
    checkList(dec.listAll(), [a, b, c, e]);

    dec.clearEnding(0, 3);
    checkList(dec.listAll(), [e]);

    dec.add(a.from, a.to, a.style);
    dec.add(b.from, b.to, b.style);
    dec.add(c.from, c.to, c.style);
    dec.add(d.from, d.to, d.style);
    checkList(dec.listAll(), [a, b, c, d, e]);

    dec.clearTouching(3, 10);
    checkList(dec.listAll(), [a, e]);

    dec.add(d.from, d.to, d.style);
    dec.remove(a.from, a.to, true /* relaxed */);
    dec.remove(42, 42, true /* relaxed */);
    checkList(dec.listAll(), [d, e]);

    dec.clearAll();
    checkList(dec.listAll(), []);
  });
});


new Reporter(runner);
runner.run();

