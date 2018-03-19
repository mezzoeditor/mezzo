#!/usr/bin/env node --experimental-modules

import {TestRunner, Reporter, Matchers} from '../../utils/testrunner/index.mjs';
import {RoundMode, Metrics} from './Metrics.mjs';
import {TextIterator} from './TextIterator.mjs';
import {Document} from './Document.mjs';
import {Random} from './Random.mjs';
import {Decorator} from './Decorator.mjs';
import {Viewport} from './Viewport.mjs';

const runner = new TestRunner();

const {describe, xdescribe, fdescribe} = runner;
const {it, fit, xit} = runner;
const {beforeAll, beforeEach, afterAll, afterEach} = runner;

const {expect} = new Matchers();

function createTestMeasurer() {
  return {
    defaultWidth: () => 1,
    lineHeight: () => 3,
    defaultWidthRegex: () => null,
    measureString: s => s[0] <= 'z' ? s.charCodeAt(0) - 'a'.charCodeAt(0) + 1 : 100
  };
}

function createTestMetrics() {
  return new Metrics(null, s => s.charCodeAt(0) - 'a'.charCodeAt(0) + 1, s => 100);
}

function createDefaultMetrics() {
  return new Metrics(Metrics.bmpRegex, s => 1, s => 1);
}

describe('Document', () => {
  it('Document text API manual chunks', () => {
    let chunks = ['ab\ncd', 'def', '\n', '', 'a\n\n\nbbbc', 'xy', 'za\nh', 'pp', '\n', ''];
    let content = chunks.join('');
    let document = new Document(() => {});
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
      let document = new Document(() => {});
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
      let document = new Document(() => {});
      Document.test.setContent(document, content, chunkSize);
      for (let {from, to, insertion} of editQueries) {
        let removed = document.replace(from, to, insertion);
        expect(removed).toBe(content.substring(from, to));
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

describe('TextIterator', () => {
  it('TextIterator basics', () => {
    let document = new Document(() => {});
    document.reset('world');
    let iterator = document.iterator(0);
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
    let document = new Document(() => {});
    document.reset('world');
    let iterator = document.iterator(0);
    iterator.advance(4);
    expect(iterator.current).toBe('d');
    iterator.advance(-2);
    expect(iterator.current).toBe('r');
  });

  it('TextIterator.read', () => {
    let document = new Document(() => {});
    document.reset('world');
    let iterator = document.iterator(0);
    expect(iterator.read(4)).toBe('worl');
    expect(iterator.current).toBe('d');
    expect(iterator.rread(2)).toBe('rl');
    expect(iterator.current).toBe('r');
  });

  it('TextIterator.charAt', () => {
    let document = new Document(() => {});
    document.reset('world');
    let iterator = document.iterator(2);
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
    let document = new Document(() => {});
    document.reset('hello, world');
    let iterator = document.iterator(0);
    expect(iterator.find('world')).toBe(true);
    expect(iterator.offset).toBe(7);
    expect(iterator.current).toBe('w');
  });

  it('TextIterator.find manual chunks 1', () => {
    let document = new Document(() => {});
    Document.test.setChunks(document, ['hello, w', 'o', 'r', 'ld!!!']);
    let iterator = document.iterator(0);
    expect(iterator.find('world')).toBe(true);
    expect(iterator.offset).toBe(7);
    expect(iterator.current).toBe('w');
  });

  it('TextIterator.find manual chunks 2', () => {
    let document = new Document(() => {});
    Document.test.setChunks(document, ['hello', ',', ' ', 'w', 'orl', 'd!!!']);
    let iterator = document.iterator(0);
    expect(iterator.find('world')).toBe(true);
    expect(iterator.offset).toBe(7);
    expect(iterator.current).toBe('w');
  });

  it('TextIterator.find manual chunks 3', () => {
    let document = new Document(() => {});
    Document.test.setChunks(document, ['hello, w', 'or', 'ld', '!!!']);
    let iterator = document.iterator(0);
    expect(iterator.find('world')).toBe(true);
    expect(iterator.offset).toBe(7);
    expect(iterator.current).toBe('w');
  });

  it('TextIterator.find unsuccessful', () => {
    let document = new Document(() => {});
    document.reset('hello, world');
    let iterator = document.iterator(0);
    expect(iterator.find('eee')).toBe(false);
    expect(iterator.offset).toBe(12);
    expect(iterator.current).toBe(undefined);

    iterator = document.iterator(0, 0, 3);
    expect(iterator.find('hello')).toBe(false);
    expect(iterator.offset).toBe(3);
    expect(iterator.current).toBe(undefined);
  });

  it('TextIteratof.find unsuccessful across chunks', () => {
    let document = new Document(() => {});
    Document.test.setContent(document, '/*abcdefghijklmonpqrsuvwxyz0123456789@!*/', 5);
    let iterator = document.iterator(0, 0, 8);
    expect(iterator.find('*/')).toBe(false);
    expect(iterator.offset).toBe(8);
    expect(iterator.outOfBounds()).toBe(true);
    expect(iterator.current).toBe(undefined);

    iterator.setConstraints(0, 100);
    expect(iterator.outOfBounds()).toBe(false);
    expect(iterator.current).toBe('g');
  });

  it('TextIterator constraints', () => {
    let document = new Document(() => {});
    document.reset('hello');
    let iterator = document.iterator(0, 0, 2);
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
    let document = new Document(() => {});
    document.reset('abcdefg');
    let iterator = document.iterator(4, 2, 4);
    expect(iterator.offset).toBe(4);
    expect(iterator.current).toBe(undefined);
    expect(iterator.charCodeAt(0)).toBe(NaN);
    expect(iterator.charAt(0)).toBe(undefined);
    expect(iterator.substr(2)).toBe('');
  });

  it('TextIterator.setConstraints', () => {
    let document = new Document(() => {});
    document.reset('012');
    let iterator = document.iterator(0, 0, 1);
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
      let document = new Document(() => {});
      Document.test.setContent(document, content, chunkSize);
      for (let from = 0; from <= content.length; from++) {
        let iterator = document.iterator(from, from, content.length);
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

describe('Viewport.Scrollbars', () => {
  beforeEach(state => {
    let document = new Document(() => {});
    let measurer = {
      defaultWidth: () => 10,
      lineHeight: () => 10,
      defaultWidthRegex: () => null,
      measureString: s => 10,
    };
    state.viewport = new Viewport(document, measurer, () => {});
    document.reset(new Array(10).fill('').join('\n'));
    state.viewport.setSize(100, 100);
    state.viewport.vScrollbar.setSize(100);
  });

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
      let document = new Document(() => {});
      document.reset(content);
      let viewport = new Viewport(document, createTestMeasurer(), () => {});
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

describe('Decorator', () => {
  function checkOne(got, expected) {
    if (!expected) {
      expect(got).toBe(null);
    } else {
      expect(got.from).toBe(expected.from);
      expect(got.to).toBe(expected.to);
      expect(got.data).toBe(expected.data);
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
    let a = {from: 0, to: 1, data: 'a'};
    let b = {from: 0, to: 0, data: 'b'};
    let c = {from: 2, to: 3, data: 'c'};
    let d = {from: 15, to: 33, data: 'd'};
    let e = {from: 8, to: 12, data: 'e'};
    let f = {from: 8, to: 8, data: 'f'};
    let g = {from: 12, to: 12, data: 'g'};
    for (let x of [a, b, c, d, e, f, g])
      x.handle = dec.add(x.from, x.to, x.data);

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

    for (let x of [a, b, c, d, e, f, g]) {
      let range = dec.resolve(x.handle);
      expect(range.from).toBe(x.from);
      expect(range.to).toBe(x.to);
    }
  });

  it('Decorator.replace manual', () => {
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
      let handle = dec.add(before.from, before.to, '');
      let removed = dec.replace(from, to, inserted);
      let got = dec.listAll();
      expect(got.length).toBe(expected.length, `test: ${JSON.stringify(test)}`);
      for (let i = 0; i < got.length; i++) {
        expect(got[i].from).toBe(expected[i].from, `test: ${JSON.stringify(test)}`);
        expect(got[i].to).toBe(expected[i].to, `test: ${JSON.stringify(test)}`);
      }
      if (expected.length) {
        let range = dec.resolve(handle);
        expect(range.from).toBe(expected[0].from);
        expect(range.to).toBe(expected[0].to);
      } else {
        expect(removed.length).toBe(1);
        expect(removed[0]).toBe(handle);
      }
    }
  });

  it('Decorator.replace large list to the right', () => {
    let dec = new Decorator();
    let count = 10000;
    for (let i = 0; i < count; i++)
      dec.add(i + 200, i + 200, '');
    for (let i = 0; i < 99; i++)
      dec.replace(2 * i, 2 * i + 1, 2);
    let list = dec.listAll();
    expect(list.length).toBe(count);
    for (let i = 0; i < count; i++) {
      expect(list[i].from).toBe(i + 200 + 99);
      expect(list[i].to).toBe(i + 200 + 99);
    }
  });

  it('Decorator.editing', () => {
    let dec = new Decorator();
    let a = {from: 0, to: 1, data: 'a'};
    let b = {from: 2, to: 3, data: 'b'};
    let c = {from: 3, to: 3, data: 'c'};
    let d = {from: 10, to: 20, data: 'd'};
    let e = {from: 21, to: 100, data: 'e'};

    let cHandle = dec.add(c.from, c.to, c.data);
    let aHandle = dec.add(a.from, a.to, a.data);
    let dHandle = dec.add(d.from, d.to, d.data);
    let bHandle = dec.add(b.from, b.to, b.data);
    let eHandle = dec.add(e.from, e.to, e.data);

    checkList(dec.listAll(), [a, b, c, d, e]);

    expect(dec.remove(eHandle)).toBe(e.data);
    expect(dec.remove(eHandle)).toBe(undefined);
    checkList(dec.listAll(), [a, b, c, d]);

    dec.clearStarting(5, 15);
    checkList(dec.listAll(), [a, b, c]);

    dec.add(e.from, e.to, e.data);
    checkList(dec.listAll(), [a, b, c, e]);

    dec.clearEnding(0, 3);
    checkList(dec.listAll(), [e]);

    aHandle = dec.add(a.from, a.to, a.data);
    dec.add(b.from, b.to, b.data);
    dec.add(c.from, c.to, c.data);
    dec.add(d.from, d.to, d.data);
    checkList(dec.listAll(), [a, b, c, d, e]);

    dec.clearTouching(3, 10);
    checkList(dec.listAll(), [a, e]);

    dec.add(d.from, d.to, d.data);
    expect(dec.remove(aHandle)).toBe(a.data);
    expect(dec.remove(eHandle)).toBe(undefined);
    checkList(dec.listAll(), [d, e]);

    dec.clearAll();
    checkList(dec.listAll(), []);
  });

  it('Decorator.multiple removals', () => {
    let dec = new Decorator();
    let a = {from: 1, to: 2, data: 'a'};
    let b = {from: 2, to: 3, data: 'b'};
    let c = {from: 3, to: 3, data: 'c'};
    let d = {from: 10, to: 20, data: 'd'};
    let e = {from: 21, to: 100, data: 'e'};
    let all = [a, b, c, d, e];
    for (let x of all)
      x.handle = dec.add(x.from, x.to, x.data);

    let removed = dec.replace(0, 101, 0);
    expect(removed.length).toBe(all.length);
    for (let i = 0; i < all.length; i++)
      expect(removed[i]).toBe(all[i].handle);
  });
});

describe('Metrics', () => {
  it('Metrics.isValidOffset', () => {
    expect(Metrics.isValidOffset('abc', -1)).toBe(true);
    expect(Metrics.isValidOffset('abc', 0)).toBe(true);
    expect(Metrics.isValidOffset('abc', 1)).toBe(true);
    expect(Metrics.isValidOffset('abc', 2)).toBe(true);
    expect(Metrics.isValidOffset('abc', 3)).toBe(true);
    expect(Metrics.isValidOffset('abc', 4)).toBe(true);

    expect(Metrics.isValidOffset('𐀀𐀀', -1)).toBe(true);
    expect(Metrics.isValidOffset('𐀀𐀀', 0)).toBe(true);
    expect(Metrics.isValidOffset('𐀀𐀀', 1)).toBe(false);
    expect(Metrics.isValidOffset('𐀀𐀀', 2)).toBe(true);
    expect(Metrics.isValidOffset('𐀀𐀀', 3)).toBe(false);
    expect(Metrics.isValidOffset('𐀀𐀀', 4)).toBe(true);
    expect(Metrics.isValidOffset('𐀀𐀀', 5)).toBe(true);
  });

  it('Metrics internals', () => {
    let metrics = createTestMetrics();

    expect(metrics.measureBMPCodePoint('a'.charCodeAt(0))).toBe(1);
    expect(metrics.measureBMPCodePoint('d'.charCodeAt(0))).toBe(4);
    expect(metrics.measureBMPCodePoint('a'.charCodeAt(0))).toBe(1);
    expect(metrics.measureBMPCodePoint('d'.charCodeAt(0))).toBe(4);

    expect(metrics.measureSupplementaryCodePoint('𐀀'.codePointAt(0))).toBe(100);
    expect(metrics.measureSupplementaryCodePoint('😀'.codePointAt(0))).toBe(100);
    expect(metrics.measureSupplementaryCodePoint('𐀀'.codePointAt(0))).toBe(100);
    expect(metrics.measureSupplementaryCodePoint('😀'.codePointAt(0))).toBe(100);

    expect(metrics._measureString('abc', 1, 2)).toBe(2);
    expect(metrics._measureString('abc', 0, 3)).toBe(6);
    expect(metrics._measureString('abc', 2, 2)).toBe(0);
    expect(metrics._measureString('abc𐀀𐀀', 2, 5)).toBe(103);
    expect(metrics._measureString('abc𐀀𐀀', 5, 7)).toBe(100);
    expect(metrics._measureString('abc𐀀𐀀', 0, 7)).toBe(206);
    expect(metrics._measureString('a😀b𐀀c', 1, 6)).toBe(202);
    expect(metrics._measureString('😀', 0, 2)).toBe(100);
    expect(metrics._measureString('😀', 1, 1)).toBe(0);
    expect(metrics._measureString('😀', 0, 0)).toBe(0);

    expect(metrics._locateByWidth('abc', 0, 3, 3, RoundMode.Floor)).toEqual({offset: 2, width: 3});
    expect(metrics._locateByWidth('abc', 0, 3, 3, RoundMode.Round)).toEqual({offset: 2, width: 3});
    expect(metrics._locateByWidth('abc', 0, 3, 3, RoundMode.Ceil)).toEqual({offset: 2, width: 3});
    expect(metrics._locateByWidth('abc', 0, 3, 4.5, RoundMode.Floor)).toEqual({offset: 2, width: 3});
    expect(metrics._locateByWidth('abc', 0, 3, 4.5, RoundMode.Round)).toEqual({offset: 2, width: 3});
    expect(metrics._locateByWidth('abc', 0, 3, 4.5, RoundMode.Ceil)).toEqual({offset: 3, width: 6});
    expect(metrics._locateByWidth('abc', 0, 3, 4.6, RoundMode.Floor)).toEqual({offset: 2, width: 3});
    expect(metrics._locateByWidth('abc', 0, 3, 4.6, RoundMode.Round)).toEqual({offset: 3, width: 6});
    expect(metrics._locateByWidth('abc', 0, 3, 4.6, RoundMode.Ceil)).toEqual({offset: 3, width: 6});
    expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 103, RoundMode.Floor)).toEqual({offset: 5, width: 103});
    expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 103, RoundMode.Round)).toEqual({offset: 5, width: 103});
    expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 103, RoundMode.Ceil)).toEqual({offset: 5, width: 103});
    expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 153, RoundMode.Floor)).toEqual({offset: 5, width: 103});
    expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 153, RoundMode.Round)).toEqual({offset: 5, width: 103});
    expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 153, RoundMode.Ceil)).toEqual({offset: 7, width: 203});
    expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 154, RoundMode.Floor)).toEqual({offset: 5, width: 103});
    expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 154, RoundMode.Round)).toEqual({offset: 7, width: 203});
    expect(metrics._locateByWidth('abc𐀀𐀀', 2, 7, 154, RoundMode.Ceil)).toEqual({offset: 7, width: 203});
    expect(metrics._locateByWidth('a😀b𐀀c', 0, 6, 204, RoundMode.Round)).toEqual({offset: -1, width: 203});
    expect(metrics._locateByWidth('a😀b𐀀c', 0, 6, 203, RoundMode.Round)).toEqual({offset: 6, width: 203});
    expect(metrics._locateByWidth('', 0, 0, 0, RoundMode.Ceil)).toEqual({offset: 0, width: 0});
    expect(metrics._locateByWidth('', 0, 0, 5, RoundMode.Floor)).toEqual({offset: -1, width: 0});

    let defaultMetrics = createDefaultMetrics();
    expect(defaultMetrics._locateByWidth('abc', 0, 3, 0.5, RoundMode.Floor)).toEqual({offset: 0, width: 0});
    expect(defaultMetrics._locateByWidth('abc', 0, 3, 0.5, RoundMode.Round)).toEqual({offset: 0, width: 0});
    expect(defaultMetrics._locateByWidth('abc', 0, 3, 0.6, RoundMode.Round)).toEqual({offset: 1, width: 1});
    expect(defaultMetrics._locateByWidth('abc', 0, 3, 0.5, RoundMode.Ceil)).toEqual({offset: 1, width: 1});
  });

  it('Metrics.forString', () => {
    let defaultMetrics = createDefaultMetrics();
    expect(defaultMetrics.forString('one line')).toEqual({length: 8, firstWidth: 8, lastWidth: 8, longestWidth: 8});
    expect(defaultMetrics.forString('\none line')).toEqual({length: 9, firstWidth: 0, lastWidth: 8, longestWidth: 8, lineBreaks: 1});
    expect(defaultMetrics.forString('one line\n')).toEqual({length: 9, firstWidth: 8, lastWidth: 0, longestWidth: 8, lineBreaks: 1});
    expect(defaultMetrics.forString('\none line\n')).toEqual({length: 10, firstWidth: 0, lastWidth: 0, longestWidth: 8, lineBreaks: 2});
    expect(defaultMetrics.forString('short\nlongest\nlonger\ntiny')).toEqual({length: 25, firstWidth: 5, lastWidth: 4, longestWidth: 7, lineBreaks: 3});

    let testMetrics = createTestMetrics();
    expect(testMetrics.forString('a')).toEqual({length: 1, firstWidth: 1, lastWidth: 1, longestWidth: 1});
    expect(testMetrics.forString('a\nb')).toEqual({length: 3, lineBreaks: 1, firstWidth: 1, lastWidth: 2, longestWidth: 2});
    expect(testMetrics.forString('b\na')).toEqual({length: 3, lineBreaks: 1, firstWidth: 2, lastWidth: 1, longestWidth: 2});
    expect(testMetrics.forString('bac')).toEqual({length: 3, firstWidth: 6, lastWidth: 6, longestWidth: 6});
    expect(testMetrics.forString('b\na\nc')).toEqual({length: 5, lineBreaks: 2, firstWidth: 2, lastWidth: 3, longestWidth: 3});
    expect(testMetrics.forString('b\naaaa\nc')).toEqual({length: 8, lineBreaks: 2, firstWidth: 2, lastWidth: 3, longestWidth: 4});
    expect(testMetrics.forString('b😀😀')).toEqual({length: 5, firstWidth: 202, lastWidth: 202, longestWidth: 202});
    expect(testMetrics.forString('😀\n𐀀😀\n𐀀a')).toEqual({length: 11, lineBreaks: 2, firstWidth: 100, lastWidth: 101, longestWidth: 200});
    expect(testMetrics.forString('\n𐀀')).toEqual({length: 3, lineBreaks: 1, firstWidth: 0, lastWidth: 100, longestWidth: 100});
  });

  it('Metrics.locateBy*', () => {
    let defaultMetrics = createDefaultMetrics();

    let tests = [
      {chunk: 'short', before: {offset: 15, x: 5, y: 10}, location: {offset: 18, x: 8, y: 10}},
      {chunk: 'short\nlonger', before: {offset: 15, x: 5, y: 10}, location: {offset: 18, x: 8, y: 10}},
      {chunk: 'short\nlonger', before: {offset: 15, x: 5, y: 10}, location: {offset: 20, x: 10, y: 10}},
      {chunk: 'short\nlonger', before: {offset: 15, x: 5, y: 10}, location: {offset: 21, x: 0, y: 11}},
      {chunk: '1\n23\n456\n78\n9\n0', before: {offset: 15, x: 5, y: 10}, location: {offset: 28, x: 1, y: 14}},
    ];
    for (let test of tests) {
      expect(defaultMetrics.locateByOffset(test.chunk, test.before, test.location.offset)).toEqual(test.location);
      expect(defaultMetrics.locateByOffset(test.chunk, test.before, test.location.offset, true /* strict */)).toEqual(test.location);
      expect(defaultMetrics.locateByPoint(test.chunk, test.before, test.location, RoundMode.Floor, true /* strict */)).toEqual(test.location);
    }

    let nonStrict = [
      {chunk: 'short', before: {offset: 15, x: 5, y: 10}, point: {x: 15, y: 10}, result: {offset: 20, x: 10, y: 10}},
      {chunk: 'short\nlonger', before: {offset: 15, x: 5, y: 10}, point: {x: 15, y: 10}, result: {offset: 20, x: 10, y: 10}},
      {chunk: 'short\nlonger', before: {offset: 15, x: 5, y: 10}, point: {x: 22, y: 11}, result: {offset: 27, x: 6, y: 11}},
      {chunk: '1\n23\n456\n78\n9\n0', before: {offset: 15, x: 5, y: 10}, point: {x: 42, y: 14}, result: {offset: 28, x: 1, y: 14}},
    ];
    for (let test of nonStrict)
      expect(defaultMetrics.locateByPoint(test.chunk, test.before, test.point, RoundMode.Floor)).toEqual(test.result);
  });

  it('Metrics.locateBy* with non-bmp', () => {
    let metrics = createTestMetrics();

    let tests = [
      {chunk: 'abc', before: {offset: 15, x: 5, y: 10}, location: {offset: 18, x: 11, y: 10}},
      {chunk: 'abc\na😀b𐀀c', before: {offset: 15, x: 5, y: 10}, location: {offset: 18, x: 11, y: 10}},
      {chunk: 'abc\na😀b𐀀c', before: {offset: 15, x: 5, y: 10}, location: {offset: 19, x: 0, y: 11}},
      {chunk: 'abc\na😀b𐀀c', before: {offset: 15, x: 5, y: 10}, location: {offset: 25, x: 203, y: 11}},
      {chunk: 'a\n😀b\n𐀀ca\n𐀀𐀀\n😀\n0', before: {offset: 15, x: 5, y: 10}, location: {offset: 33, x: 100, y: 14}},
    ];
    for (let test of tests) {
      expect(metrics.locateByOffset(test.chunk, test.before, test.location.offset)).toEqual(test.location);
      expect(metrics.locateByOffset(test.chunk, test.before, test.location.offset, true /* strict */)).toEqual(test.location);
      expect(metrics.locateByPoint(test.chunk, test.before, test.location, RoundMode.Floor, true /* strict */)).toEqual(test.location);
    }

    let nonStrict = [
      {chunk: 'abc', before: {offset: 15, x: 5, y: 10}, point: {x: 15, y: 10}, result: {offset: 18, x: 11, y: 10}},
      {chunk: 'abc\na😀b𐀀c', before: {offset: 15, x: 5, y: 10}, point: {x: 15, y: 10}, result: {offset: 18, x: 11, y: 10}},
      {chunk: 'abc\na😀b𐀀c', before: {offset: 15, x: 5, y: 10}, point: {x: 220, y: 11.5}, result: {offset: 26, x: 206, y: 11}},
      {chunk: 'a\n😀b\n𐀀ca\n𐀀𐀀\n😀\n0', before: {offset: 15, x: 5, y: 10}, point: {x: 420, y: 14.5}, result: {offset: 33, x: 100, y: 14}},
    ];
    for (let test of nonStrict)
      expect(metrics.locateByPoint(test.chunk, test.before, test.point, RoundMode.Floor)).toEqual(test.result);
  });

  it('Metrics.locateByOffset non-strict', () => {
    let metrics = createTestMetrics();
    expect(metrics.locateByOffset('😀😀', {offset: 3, x: 3, y: 3}, 6)).toEqual({offset: 5, x: 103, y: 3});
  });

  it('Metrics.locateByPoint with round modes', () => {
    let testMetrics = createTestMetrics();
    let chunk = 'a\nb\naaaa\nbac\nc';
    let before = {offset: 15, x: 5, y: 10};
    let tests = [
      {point: {x: 5, y: 10}, location: {offset: 15, x: 5, y: 10}, strict: true},
      {point: {x: 6, y: 10}, location: {offset: 16, x: 6, y: 10}, strict: true},
      {point: {x: 7, y: 10}, location: {offset: 16, x: 6, y: 10}},
      {point: {x: 5, y: 10.5}, location: {offset: 15, x: 5, y: 10}, strict: true},
      {point: {x: 0, y: 11}, location: {offset: 17, x: 0, y: 11}, strict: true},
      {point: {x: 1, y: 11}, location: {offset: 17, x: 0, y: 11}, strict: true},
      {point: {x: 0.9, y: 11}, location: {offset: 17, x: 0, y: 11}, roundMode: RoundMode.Round, strict: true},
      {point: {x: 1.0, y: 11}, location: {offset: 17, x: 0, y: 11}, roundMode: RoundMode.Round, strict: true},
      {point: {x: 1.1, y: 11}, location: {offset: 18, x: 2, y: 11}, roundMode: RoundMode.Round, strict: true},
      {point: {x: 0, y: 11}, location: {offset: 17, x: 0, y: 11}, roundMode: RoundMode.Ceil, strict: true},
      {point: {x: 1.0, y: 11}, location: {offset: 18, x: 2, y: 11}, roundMode: RoundMode.Ceil, strict: true},
      {point: {x: 1.1, y: 11}, location: {offset: 18, x: 2, y: 11}, roundMode: RoundMode.Ceil, strict: true},
      {point: {x: 2, y: 11}, location: {offset: 18, x: 2, y: 11}, strict: true},
      {point: {x: 42, y: 11.5}, location: {offset: 18, x: 2, y: 11}},
      {point: {x: 0, y: 12}, location: {offset: 19, x: 0, y: 12}, strict: true},
      {point: {x: 1, y: 12}, location: {offset: 20, x: 1, y: 12}, strict: true},
      {point: {x: 2, y: 12}, location: {offset: 21, x: 2, y: 12}, strict: true},
      {point: {x: 3, y: 12.1}, location: {offset: 22, x: 3, y: 12}, strict: true},
      {point: {x: 4, y: 12.7}, location: {offset: 23, x: 4, y: 12}, strict: true},
      {point: {x: 3, y: 13}, location: {offset: 26, x: 3, y: 13}, strict: true},
      {point: {x: 42, y: 13}, location: {offset: 27, x: 6, y: 13}},
    ];
    for (let test of tests)
      expect(testMetrics.locateByPoint(chunk, before, test.point, test.roundMode || RoundMode.Floor, !!test.strict)).toEqual(test.location);
  });

  it('Metrics.chunkString', () => {
    let metrics = createTestMetrics();
    expect(metrics.chunkString(5, '')).toEqual([
      {data: '', metrics: {length: 0, firstWidth: 0, lastWidth: 0, longestWidth: 0}}
    ]);
    expect(metrics.chunkString(1, '😀')).toEqual([
      {data: '😀', metrics: {length: 2, firstWidth: 100, lastWidth: 100, longestWidth: 100}}
    ]);
    expect(metrics.chunkString(2, 'a', 'b')).toEqual([
      {data: 'b', metrics: {length: 1, firstWidth: 2, lastWidth: 2, longestWidth: 2}},
      {data: 'a', metrics: {length: 1, firstWidth: 1, lastWidth: 1, longestWidth: 1}}
    ]);
  });
});

new Reporter(runner);
runner.run();

// TODO:
//   - simplify lines calculation in Viewport.decorate;
