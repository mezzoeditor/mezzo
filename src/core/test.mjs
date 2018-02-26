import {TestRunner, Reporter, Matchers} from '../../utils/testrunner/index.mjs';
import {Metrics} from './Metrics.mjs';
import {RoundMode, Unicode} from './Unicode.mjs';
import {Text} from './Text.mjs';
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
  let measurer = new Unicode.CachingMeasurer(
    1,
    3,
    null,
    s => s.charCodeAt(0) - 'a'.charCodeAt(0) + 1,
    s => 100
  );
  measurer._measureString = (s, from, to) => {
    let result = measurer.measureString(s, from, to);
    return result.width || result.columns * measurer.defaultWidth;
  };
  return measurer;
}

function createDefaultMeasurer() {
  return new Unicode.CachingMeasurer(1, 1, Unicode.anythingRegex, s => 1, s => 1);
}

describe('Metrics', () => {
  it('Metrics.fromString', () => {
    let defaultMeasurer = createDefaultMeasurer();
    expect(Metrics.fromString('one line', defaultMeasurer)).toEqual({length: 8, firstColumns: 8, lastColumns: 8, longestColumns: 8});
    expect(Metrics.fromString('\none line', defaultMeasurer)).toEqual({length: 9, firstColumns: 0, lastColumns: 8, longestColumns: 8, lineBreaks: 1});
    expect(Metrics.fromString('one line\n', defaultMeasurer)).toEqual({length: 9, firstColumns: 8, lastColumns: 0, longestColumns: 8, lineBreaks: 1});
    expect(Metrics.fromString('\none line\n', defaultMeasurer)).toEqual({length: 10, firstColumns: 0, lastColumns: 0, longestColumns: 8, lineBreaks: 2});
    expect(Metrics.fromString('short\nlongest\nlonger\ntiny', defaultMeasurer)).toEqual({length: 25, firstColumns: 5, lastColumns: 4, longestColumns: 7, lineBreaks: 3});

    let testMeasurer = createTestMeasurer();
    expect(Metrics.fromString('a', testMeasurer)).toEqual({length: 1, firstColumns: 1, lastColumns: 1, longestColumns: 1});
    expect(Metrics.fromString('a\nb', testMeasurer)).toEqual({length: 3, firstColumns: 1, lastColumns: 1, longestColumns: 1, lineBreaks: 1, lastWidth: 2, longestWidth: 2});
    expect(Metrics.fromString('b\na', testMeasurer)).toEqual({length: 3, firstColumns: 1, lastColumns: 1, longestColumns: 1, lineBreaks: 1, firstWidth: 2, longestWidth: 2});
    expect(Metrics.fromString('bac', testMeasurer)).toEqual({length: 3, firstColumns: 3, lastColumns: 3, longestColumns: 3, firstWidth: 6, lastWidth: 6, longestWidth: 6});
    expect(Metrics.fromString('b\na\nc', testMeasurer)).toEqual({length: 5, firstColumns: 1, lastColumns: 1, longestColumns: 1, lineBreaks: 2, firstWidth: 2, lastWidth: 3, longestWidth: 3});
    expect(Metrics.fromString('b\naaaa\nc', testMeasurer)).toEqual({length: 8, firstColumns: 1, lastColumns: 1, longestColumns: 4, lineBreaks: 2, firstWidth: 2, lastWidth: 3});
    expect(Metrics.fromString('b😀😀', testMeasurer)).toEqual({length: 5, firstColumns: 3, lastColumns: 3, longestColumns: 3, firstWidth: 202, lastWidth: 202, longestWidth: 202});
    expect(Metrics.fromString('😀\n𐀀😀\n𐀀a', testMeasurer)).toEqual({length: 11, lineBreaks: 2, firstColumns: 1, lastColumns: 2, longestColumns: 2, firstWidth: 100, lastWidth: 101, longestWidth: 200});
    expect(Metrics.fromString('\n𐀀', testMeasurer)).toEqual({length: 3, lineBreaks: 1, firstColumns: 0, lastColumns: 1, longestColumns: 1, lastWidth: 100, longestWidth: 100});
  });

  it('Metrics.string*ToLocation', () => {
    let defaultMeasurer = createDefaultMeasurer();

    let tests = [
      {chunk: 'short', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, location: {line: 3, column: 11, offset: 18, x: 8, y: 10}},
      {chunk: 'short\nlonger', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, location: {line: 3, column: 11, offset: 18, x: 8, y: 10}},
      {chunk: 'short\nlonger', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, location: {line: 3, column: 13, offset: 20, x: 10, y: 10}},
      {chunk: 'short\nlonger', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, location: {line: 4, column: 0, offset: 21, x: 0, y: 11}},
      {chunk: '1\n23\n456\n78\n9\n0', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, location: {line: 7, column: 1, offset: 28, x: 1, y: 14}},
    ];
    for (let test of tests) {
      expect(Metrics.stringOffsetToLocation(test.chunk, test.before, test.location.offset, defaultMeasurer)).toEqual(test.location);
      expect(Metrics.stringPositionToLocation(test.chunk, test.before, test.location, defaultMeasurer)).toEqual(test.location);
      expect(Metrics.stringPositionToLocation(test.chunk, test.before, test.location, defaultMeasurer, true /* strict */)).toEqual(test.location);
      expect(Metrics.stringPointToLocation(test.chunk, test.before, test.location, defaultMeasurer, RoundMode.Floor, true /* strict */)).toEqual(test.location);
    }

    let nonStrict = [
      {chunk: 'short', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, position: {line: 3, column: 22}, point: {x: 15, y: 10}, result: {line: 3, column: 13, offset: 20, x: 10, y: 10}},
      {chunk: 'short\nlonger', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, position: {line: 3, column: 22}, point: {x: 15, y: 10}, result: {line: 3, column: 13, offset: 20, x: 10, y: 10}},
      {chunk: 'short\nlonger', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, position: {line: 4, column: 22}, point: {x: 22, y: 11}, result: {line: 4, column: 6, offset: 27, x: 6, y: 11}},
      {chunk: '1\n23\n456\n78\n9\n0', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, position: {line: 7, column: 22}, point: {x: 42, y: 14}, result: {line: 7, column: 1, offset: 28, x: 1, y: 14}},
    ];
    for (let test of nonStrict) {
      expect(Metrics.stringPositionToLocation(test.chunk, test.before, test.position, defaultMeasurer)).toEqual(test.result);
      expect(Metrics.stringPointToLocation(test.chunk, test.before, test.point, defaultMeasurer, RoundMode.Floor)).toEqual(test.result);
    }
  });

  it('Metrics.string*ToLocation with measurer and unicode', () => {
    let measurer = createTestMeasurer();

    let tests = [
      {chunk: 'abc', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, location: {line: 3, column: 11, offset: 18, x: 11, y: 10}},
      {chunk: 'abc\na😀b𐀀c', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, location: {line: 3, column: 11, offset: 18, x: 11, y: 10}},
      {chunk: 'abc\na😀b𐀀c', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, location: {line: 4, column: 0, offset: 19, x: 0, y: 13}},
      {chunk: 'abc\na😀b𐀀c', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, location: {line: 4, column: 4, offset: 25, x: 203, y: 13}},
      {chunk: 'a\n😀b\n𐀀ca\n𐀀𐀀\n😀\n0', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, location: {line: 7, column: 1, offset: 33, x: 100, y: 22}},
    ];
    for (let test of tests) {
      expect(Metrics.stringOffsetToLocation(test.chunk, test.before, test.location.offset, measurer)).toEqual(test.location);
      expect(Metrics.stringPositionToLocation(test.chunk, test.before, test.location, measurer)).toEqual(test.location);
      expect(Metrics.stringPositionToLocation(test.chunk, test.before, test.location, measurer, true /* strict */)).toEqual(test.location);
      expect(Metrics.stringPointToLocation(test.chunk, test.before, test.location, measurer, RoundMode.Floor, true /* strict */)).toEqual(test.location);
    }

    let nonStrict = [
      {chunk: 'abc', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, position: {line: 3, column: 22}, point: {x: 15, y: 10}, result: {line: 3, column: 11, offset: 18, x: 11, y: 10}},
      {chunk: 'abc\na😀b𐀀c', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, position: {line: 3, column: 22}, point: {x: 15, y: 10}, result: {line: 3, column: 11, offset: 18, x: 11, y: 10}},
      {chunk: 'abc\na😀b𐀀c', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, position: {line: 4, column: 22}, point: {x: 220, y: 14}, result: {line: 4, column: 5, offset: 26, x: 206, y: 13}},
      {chunk: 'a\n😀b\n𐀀ca\n𐀀𐀀\n😀\n0', before: {offset: 15, line: 3, column: 8, x: 5, y: 10}, position: {line: 7, column: 22}, point: {x: 420, y: 24}, result: {line: 7, column: 1, offset: 33, x: 100, y: 22}},
    ];
    for (let test of nonStrict) {
      expect(Metrics.stringPositionToLocation(test.chunk, test.before, test.position, measurer)).toEqual(test.result);
      expect(Metrics.stringPointToLocation(test.chunk, test.before, test.point, measurer, RoundMode.Floor)).toEqual(test.result);
    }
  });

  it('Metrics.stringPointToLocation with round modes', () => {
    let testMeasurer = createTestMeasurer();
    let chunk = 'a\nb\naaaa\nbac\nc';
    let before = {offset: 15, line: 3, column: 8, x: 5, y: 10};
    let tests = [
      {point: {x: 5, y: 10}, location: {offset: 15, line: 3, column: 8, x: 5, y: 10}, strict: true},
      {point: {x: 6, y: 10}, location: {offset: 16, line: 3, column: 9, x: 6, y: 10}, strict: true},
      {point: {x: 7, y: 10}, location: {offset: 16, line: 3, column: 9, x: 6, y: 10}},
      {point: {x: 5, y: 11}, location: {offset: 15, line: 3, column: 8, x: 5, y: 10}, strict: true},
      {point: {x: 0, y: 13}, location: {offset: 17, line: 4, column: 0, x: 0, y: 13}, strict: true},
      {point: {x: 1, y: 13}, location: {offset: 17, line: 4, column: 0, x: 0, y: 13}, strict: true},
      {point: {x: 0.9, y: 13}, location: {offset: 17, line: 4, column: 0, x: 0, y: 13}, roundMode: RoundMode.Round, strict: true},
      {point: {x: 1.0, y: 13}, location: {offset: 17, line: 4, column: 0, x: 0, y: 13}, roundMode: RoundMode.Round, strict: true},
      {point: {x: 1.1, y: 13}, location: {offset: 18, line: 4, column: 1, x: 2, y: 13}, roundMode: RoundMode.Round, strict: true},
      {point: {x: 0, y: 13}, location: {offset: 17, line: 4, column: 0, x: 0, y: 13}, roundMode: RoundMode.Ceil, strict: true},
      {point: {x: 1.0, y: 13}, location: {offset: 18, line: 4, column: 1, x: 2, y: 13}, roundMode: RoundMode.Ceil, strict: true},
      {point: {x: 1.1, y: 13}, location: {offset: 18, line: 4, column: 1, x: 2, y: 13}, roundMode: RoundMode.Ceil, strict: true},
      {point: {x: 2, y: 13}, location: {offset: 18, line: 4, column: 1, x: 2, y: 13}, strict: true},
      {point: {x: 42, y: 15}, location: {offset: 18, line: 4, column: 1, x: 2, y: 13}},
      {point: {x: 0, y: 16}, location: {offset: 19, line: 5, column: 0, x: 0, y: 16}, strict: true},
      {point: {x: 1, y: 16}, location: {offset: 20, line: 5, column: 1, x: 1, y: 16}, strict: true},
      {point: {x: 2, y: 16}, location: {offset: 21, line: 5, column: 2, x: 2, y: 16}, strict: true},
      {point: {x: 3, y: 17}, location: {offset: 22, line: 5, column: 3, x: 3, y: 16}, strict: true},
      {point: {x: 4, y: 18}, location: {offset: 23, line: 5, column: 4, x: 4, y: 16}, strict: true},
      {point: {x: 3, y: 19}, location: {offset: 26, line: 6, column: 2, x: 3, y: 19}, strict: true},
      {point: {x: 42, y: 19}, location: {offset: 27, line: 6, column: 3, x: 6, y: 19}},
    ];
    for (let test of tests)
      expect(Metrics.stringPointToLocation(chunk, before, test.point, testMeasurer, test.roundMode || RoundMode.Floor, !!test.strict)).toEqual(test.location);
  });
});

describe('Text', () => {
  it('Text.* manual', () => {
    let defaultMeasurer = createDefaultMeasurer();
    let chunks = ['ab\ncd', 'def', '\n', '', 'a\n\n\nbbbc', 'xy', 'za\nh', 'pp', '\n', ''];
    let content = chunks.join('');
    let text = Text.test.fromChunks(chunks, defaultMeasurer);
    expect(text.lineCount()).toBe(8);
    expect(text.longestLineWidth()).toBe(8);
    expect(text.length()).toBe(content.length);
    for (let from = 0; from <= content.length; from++) {
      for (let to = from; to <= content.length; to++)
        expect(text.content(from, to)).toBe(content.substring(from, to));
    }
  });

  it('Text.* all sizes', () => {
    let testMeasurer = createTestMeasurer();
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
      let width = testMeasurer._measureString(chunk, 0, length);
      longest = Math.max(longest, width);
      chunks.push(chunk + '\n');
      locationQueries.push({line: i, column: 0, offset: offset, x: 0, y: i * 3, rounded: true});
      locationQueries.push({line: i, column: 1, offset: offset + 1, x: 1, y: i * 3});
      locationQueries.push({line: i, column: length, offset: offset + length, x: width, y: i * 3});
      locationQueries.push({line: i, column: length, offset: offset + length, x: width, y: i * 3, nonStrict: {column: length + 1, x: width + 3}});
      locationQueries.push({line: i, column: length, offset: offset + length, x: width, y: i * 3, nonStrict: {column: length + 100, x: width + 100}});
      let column = random() % length;
      locationQueries.push({line: i, column: column, offset: offset + column, x: testMeasurer._measureString(chunk, 0, column), y: i * 3});
      offset += length + 1;
    }
    let content = chunks.join('');
    locationQueries.push({line: lineCount, column: 0, offset: content.length, x: 0, y: lineCount * 3});
    locationQueries.push({line: lineCount, column: 0, offset: content.length, x: 0, y: lineCount * 3, nonStrict: {column: 3, x: 15}});

    let contentQueries = [];
    for (let i = 0; i < 1000; i++) {
      let from = random() % content.length;
      let to = from + (random() % (content.length - from));
      contentQueries.push({from, to});
    }

    for (let chunkSize = 1; chunkSize <= 100; chunkSize++) {
      Text.test.setDefaultChunkSize(chunkSize);
      let text = Text.withContent(content, testMeasurer);
      expect(text.lineCount()).toBe(lineCount + 1);
      expect(text.longestLineWidth()).toBe(longest);
      expect(text.length()).toBe(content.length);
      for (let {from, to} of contentQueries)
        expect(text.content(from, to)).toBe(content.substring(from, to));
      expect(text.offsetToLocation(0)).toEqual({line: 0, column: 0, offset: 0, x: 0, y: 0});
      expect(text.offsetToLocation(content.length)).toEqual({line: lineCount, column: 0, offset: content.length, x: 0, y: lineCount * 3});
      expect(text.offsetToLocation(content.length + 1)).toBe(null);
      for (let {line, column, offset, x, y, nonStrict, rounded} of locationQueries) {
        if (nonStrict) {
          expect(text.positionToLocation({line, column: nonStrict.column})).toEqual({line, column, offset, x, y});
          expect(text.pointToLocation({x: nonStrict.x, y}, RoundMode.Floor)).toEqual({line, column, offset, x, y});
        } else {
          expect(text.offsetToLocation(offset)).toEqual({line, column, offset, x, y});
          expect(text.positionToLocation({line, column})).toEqual({line, column, offset, x, y});
          expect(text.positionToLocation({line, column}, true)).toEqual({line, column, offset, x, y});
          expect(text.pointToLocation({x, y}, RoundMode.Floor)).toEqual({line, column, offset, x, y});
          expect(text.pointToLocation({x: x + 0.5, y: y + 0.5}, RoundMode.Floor, false /* strict */)).toEqual({line, column, offset, x, y});
          expect(text.pointToLocation({x, y}, RoundMode.Floor, true /* strict */)).toEqual({line, column, offset, x, y});
          if (rounded) {
            expect(text.pointToLocation({x: x + 0.4, y}, RoundMode.Round, true /* strict */)).toEqual({line, column, offset, x, y});
            expect(text.pointToLocation({x: x + 0.5, y}, RoundMode.Round, true /* strict */)).toEqual({line, column, offset, x, y});
            expect(text.pointToLocation({x: x + 0.6, y}, RoundMode.Round, true /* strict */)).toEqual({line, column: column + 1, offset: offset + 1, x: x + 1, y});
            expect(text.pointToLocation({x, y}, RoundMode.Ceil, true /* strict */)).toEqual({line, column, offset, x, y});
            expect(text.pointToLocation({x: x + 0.5, y}, RoundMode.Ceil, true /* strict */)).toEqual({line, column: column + 1, offset: offset + 1, x: x + 1, y});
            expect(text.pointToLocation({x: x + 1, y}, RoundMode.Ceil, true /* strict */)).toEqual({line, column: column + 1, offset: offset + 1, x: x + 1, y});
          }
        }
      }
    }
  });

  it('Text.replace all sizes', () => {
    let defaultMeasurer = createDefaultMeasurer();
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
      let text = Text.withContent(content, defaultMeasurer);
      for (let {from, to, insertion} of editQueries) {
        let {removed, text} = text.replace(from, to, insertion);
        expect(removed).toBe(content.substring(from, to));
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
    let defaultMeasurer = createDefaultMeasurer();
    let text = Text.withContent('world', defaultMeasurer);
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
    let defaultMeasurer = createDefaultMeasurer();
    let text = Text.withContent('world', defaultMeasurer);
    let it = text.iterator(0);
    it.advance(4);
    expect(it.current).toBe('d');
    it.advance(-2);
    expect(it.current).toBe('r');
  });

  it('Text.Iterator.read', () => {
    let defaultMeasurer = createDefaultMeasurer();
    let text = Text.withContent('world', defaultMeasurer);
    let it = text.iterator(0);
    expect(it.read(4)).toBe('worl');
    expect(it.current).toBe('d');
    expect(it.rread(2)).toBe('rl');
    expect(it.current).toBe('r');
  });

  it('Text.Iterator.charAt', () => {
    let defaultMeasurer = createDefaultMeasurer();
    let text = Text.withContent('world', defaultMeasurer);
    let it = text.iterator(2);
    expect(it.charAt(0)).toBe('r');
    expect(it.offset).toBe(2);
    expect(it.charAt(1)).toBe('l');
    expect(it.offset).toBe(2);
    expect(it.charAt(2)).toBe('d');
    expect(it.offset).toBe(2);
    expect(it.charAt(3)).toBe(undefined);
    expect(it.offset).toBe(2);
    expect(it.charAt(4)).toBe(undefined);
    expect(it.offset).toBe(2);
    expect(it.charAt(-1)).toBe('o');
    expect(it.offset).toBe(2);
    expect(it.charAt(-2)).toBe('w');
    expect(it.offset).toBe(2);
    expect(it.charAt(-3)).toBe(undefined);
    expect(it.offset).toBe(2);
    expect(it.charAt(-4)).toBe(undefined);
    expect(it.offset).toBe(2);
  });

  it('Text.Iterator.find successful', () => {
    let defaultMeasurer = createDefaultMeasurer();
    let text = Text.withContent('hello, world', defaultMeasurer);
    let it = text.iterator(0);
    expect(it.find('world')).toBe(true);
    expect(it.offset).toBe(7);
    expect(it.current).toBe('w');
  });

  it('Text.Iterator.find manual chunks 1', () => {
    let defaultMeasurer = createDefaultMeasurer();
    let text = Text.test.fromChunks(['hello, w', 'o', 'r', 'ld!!!'], defaultMeasurer);
    let it = text.iterator(0);
    expect(it.find('world')).toBe(true);
    expect(it.offset).toBe(7);
    expect(it.current).toBe('w');
  });

  it('Text.Iterator.find manual chunks 2', () => {
    let defaultMeasurer = createDefaultMeasurer();
    let text = Text.test.fromChunks(['hello', ',', ' ', 'w', 'orl', 'd!!!'], defaultMeasurer);
    let it = text.iterator(0);
    expect(it.find('world')).toBe(true);
    expect(it.offset).toBe(7);
    expect(it.current).toBe('w');
  });

  it('Text.Iterator.find manual chunks 3', () => {
    let defaultMeasurer = createDefaultMeasurer();
    let text = Text.test.fromChunks(['hello, w', 'or', 'ld', '!!!'], defaultMeasurer);
    let it = text.iterator(0);
    expect(it.find('world')).toBe(true);
    expect(it.offset).toBe(7);
    expect(it.current).toBe('w');
  });

  it('Text.Iterator.find unsuccessful', () => {
    let defaultMeasurer = createDefaultMeasurer();
    let text = Text.withContent('hello, world', defaultMeasurer);
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
    let defaultMeasurer = createDefaultMeasurer();
    let text = Text.withContent('hello', defaultMeasurer);
    let it = text.iterator(0, 0, 2);
    expect(it.offset).toBe(0);
    expect(it.current).toBe('h');

    it.prev();
    expect(it.offset).toBe(-1);
    expect(it.current).toBe(undefined);

    it.prev();
    expect(it.offset).toBe(-1);
    expect(it.current).toBe(undefined);

    it.next();
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
    let defaultMeasurer = createDefaultMeasurer();
    let text = Text.withContent('abcdefg', defaultMeasurer);
    let it = text.iterator(4, 2, 4);
    expect(it.offset).toBe(4);
    expect(it.current).toBe(undefined);
    expect(it.charCodeAt(0)).toBe(NaN);
    expect(it.charAt(0)).toBe(undefined);
    expect(it.substr(2)).toBe('');
  });

  it('Text.Iterator all sizes', () => {
    let defaultMeasurer = createDefaultMeasurer();
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
      let text = Text.withContent(content, defaultMeasurer);
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

          if (i === 0) {
            expect(it.rread(p[i])).toBe(s.substring(0, p[i]));
            expect(it.offset).toBe(from);
            expect(it.current).toBe(s[0]);

            expect(it.read(p[i])).toBe(s.substring(0, p[i]));
            expect(it.offset).toBe(from + p[i]);
            expect(it.current).toBe(s[p[i]]);
          }

          if (i <= 1) {
            for (let len = 0; len <= length - p[i] + 1; len++)
              expect(it.substr(len)).toBe(s.substring(p[i], p[i] + len));
            for (let len = 0; len <= p[i]; len++)
              expect(it.rsubstr(len)).toBe(s.substring(p[i] - len, p[i]));
          }
          expect(it.outOfBounds()).toBe(false);
        }
      }
    }
  });
});

describe('Viewport', () => {
  beforeEach(state => {
    let document = new Document(() => {});
    let measurer = new Unicode.CachingMeasurer(10, 10, null, s => 10, s => 10);
    document.setMeasurer(measurer);
    document.reset(new Array(10).fill('').join('\n'));
    state.viewport = new Viewport(document);
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
      dec.add(x.from, x.to, x.data);

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
    let a = {from: 0, to: 1, data: 'a'};
    let b = {from: 2, to: 3, data: 'b'};
    let c = {from: 3, to: 3, data: 'c'};
    let d = {from: 10, to: 20, data: 'd'};
    let e = {from: 21, to: 100, data: 'e'};

    for (let x of [c, a, d, b, e])
      dec.add(x.from, x.to, x.data);
    checkList(dec.listAll(), [a, b, c, d, e]);

    dec.remove(e.from, e.to, false /* relaxed */);
    checkList(dec.listAll(), [a, b, c, d]);

    dec.remove(e.from, e.to, true /* relaxed */);
    checkList(dec.listAll(), [a, b, c, d]);

    dec.clearStarting(5, 15);
    checkList(dec.listAll(), [a, b, c]);

    dec.add(e.from, e.to, e.data);
    checkList(dec.listAll(), [a, b, c, e]);

    dec.clearEnding(0, 3);
    checkList(dec.listAll(), [e]);

    dec.add(a.from, a.to, a.data);
    dec.add(b.from, b.to, b.data);
    dec.add(c.from, c.to, c.data);
    dec.add(d.from, d.to, d.data);
    checkList(dec.listAll(), [a, b, c, d, e]);

    dec.clearTouching(3, 10);
    checkList(dec.listAll(), [a, e]);

    dec.add(d.from, d.to, d.data);
    dec.remove(a.from, a.to, true /* relaxed */);
    dec.remove(42, 42, true /* relaxed */);
    checkList(dec.listAll(), [d, e]);

    dec.clearAll();
    checkList(dec.listAll(), []);
  });

  describe('Unicode', () => {
    it('Unicode.isValidOffset', () => {
      expect(Unicode.isValidOffset('abc', -1)).toBe(true);
      expect(Unicode.isValidOffset('abc', 0)).toBe(true);
      expect(Unicode.isValidOffset('abc', 1)).toBe(true);
      expect(Unicode.isValidOffset('abc', 2)).toBe(true);
      expect(Unicode.isValidOffset('abc', 3)).toBe(true);
      expect(Unicode.isValidOffset('abc', 4)).toBe(true);

      expect(Unicode.isValidOffset('𐀀𐀀', -1)).toBe(true);
      expect(Unicode.isValidOffset('𐀀𐀀', 0)).toBe(true);
      expect(Unicode.isValidOffset('𐀀𐀀', 1)).toBe(false);
      expect(Unicode.isValidOffset('𐀀𐀀', 2)).toBe(true);
      expect(Unicode.isValidOffset('𐀀𐀀', 3)).toBe(false);
      expect(Unicode.isValidOffset('𐀀𐀀', 4)).toBe(true);
      expect(Unicode.isValidOffset('𐀀𐀀', 5)).toBe(true);
    });

    it('Unicode.CachingMeasurer', () => {
      let measurer = createTestMeasurer();

      expect(measurer.measureBMPCodePoint('a'.charCodeAt(0))).toBe(1);
      expect(measurer.measureBMPCodePoint('d'.charCodeAt(0))).toBe(4);
      expect(measurer.measureBMPCodePoint('a'.charCodeAt(0))).toBe(1);
      expect(measurer.measureBMPCodePoint('d'.charCodeAt(0))).toBe(4);

      expect(measurer.measureSupplementaryCodePoint('𐀀'.codePointAt(0))).toBe(100);
      expect(measurer.measureSupplementaryCodePoint('😀'.codePointAt(0))).toBe(100);
      expect(measurer.measureSupplementaryCodePoint('𐀀'.codePointAt(0))).toBe(100);
      expect(measurer.measureSupplementaryCodePoint('😀'.codePointAt(0))).toBe(100);

      expect(measurer.measureString('abc', 1, 2)).toEqual({columns: 1, width: 2});
      expect(measurer.measureString('abc', 0, 3)).toEqual({columns: 3, width: 6});
      expect(measurer.measureString('abc', 2, 2)).toEqual({columns: 0, width: 0});
      expect(measurer.measureString('abc𐀀𐀀', 2, 5)).toEqual({columns: 2, width: 103});
      expect(measurer.measureString('abc𐀀𐀀', 5, 7)).toEqual({columns: 1, width: 100});
      expect(measurer.measureString('abc𐀀𐀀', 0, 7)).toEqual({columns: 5, width: 206});
      expect(measurer.measureString('a😀b𐀀c', 1, 6)).toEqual({columns: 3, width: 202});
      expect(measurer.measureString('😀', 0, 2)).toEqual({columns: 1, width: 100});
      expect(measurer.measureString('😀', 1, 1)).toEqual({columns: 0, width: 0});
      expect(measurer.measureString('😀', 0, 0)).toEqual({columns: 0, width: 0});

      expect(measurer.locateByColumn('abc', 0, 3, 2)).toEqual({offset: 2, columns: 2, width: 3});
      expect(measurer.locateByColumn('abc', 0, 1, 3)).toEqual({offset: -1, columns: 1, width: 1});
      expect(measurer.locateByColumn('abc', 0, 2, 1)).toEqual({offset: 1, columns: 1, width: 1});
      expect(measurer.locateByColumn('abc', 1, 3, 0)).toEqual({offset: 1, columns: 0, width: 0});
      expect(measurer.locateByColumn('abc𐀀𐀀', 2, 7, 2)).toEqual({offset: 5, columns: 2, width: 103});
      expect(measurer.locateByColumn('abc𐀀𐀀', 2, 7, 3)).toEqual({offset: 7, columns: 3, width: 203});
      expect(measurer.locateByColumn('abc𐀀𐀀', 2, 7, 4)).toEqual({offset: -1, columns: 3, width: 203});
      expect(measurer.locateByColumn('a😀b𐀀c', 0, 6, 2)).toEqual({offset: 3, columns: 2, width: 101});
      expect(measurer.locateByColumn('a😀b𐀀c', 0, 6, 4)).toEqual({offset: 6, columns: 4, width: 203});
      expect(measurer.locateByColumn('a😀b𐀀c', 0, 6, 5)).toEqual({offset: -1, columns: 4, width: 203});
      expect(measurer.locateByColumn('', 0, 0, 0)).toEqual({offset: 0, columns: 0, width: 0});
      expect(measurer.locateByColumn('', 0, 0, 5)).toEqual({offset: -1, columns: 0, width: 0});

      expect(measurer.locateByWidth('abc', 0, 3, 3, RoundMode.Floor)).toEqual({offset: 2, columns: 2, width: 3});
      expect(measurer.locateByWidth('abc', 0, 3, 3, RoundMode.Round)).toEqual({offset: 2, columns: 2, width: 3});
      expect(measurer.locateByWidth('abc', 0, 3, 3, RoundMode.Ceil)).toEqual({offset: 2, columns: 2, width: 3});
      expect(measurer.locateByWidth('abc', 0, 3, 4.5, RoundMode.Floor)).toEqual({offset: 2, columns: 2, width: 3});
      expect(measurer.locateByWidth('abc', 0, 3, 4.5, RoundMode.Round)).toEqual({offset: 2, columns: 2, width: 3});
      expect(measurer.locateByWidth('abc', 0, 3, 4.5, RoundMode.Ceil)).toEqual({offset: 3, columns: 3, width: 6});
      expect(measurer.locateByWidth('abc', 0, 3, 4.6, RoundMode.Floor)).toEqual({offset: 2, columns: 2, width: 3});
      expect(measurer.locateByWidth('abc', 0, 3, 4.6, RoundMode.Round)).toEqual({offset: 3, columns: 3, width: 6});
      expect(measurer.locateByWidth('abc', 0, 3, 4.6, RoundMode.Ceil)).toEqual({offset: 3, columns: 3, width: 6});
      expect(measurer.locateByWidth('abc𐀀𐀀', 2, 7, 103, RoundMode.Floor)).toEqual({offset: 5, columns: 2, width: 103});
      expect(measurer.locateByWidth('abc𐀀𐀀', 2, 7, 103, RoundMode.Round)).toEqual({offset: 5, columns: 2, width: 103});
      expect(measurer.locateByWidth('abc𐀀𐀀', 2, 7, 103, RoundMode.Ceil)).toEqual({offset: 5, columns: 2, width: 103});
      expect(measurer.locateByWidth('abc𐀀𐀀', 2, 7, 153, RoundMode.Floor)).toEqual({offset: 5, columns: 2, width: 103});
      expect(measurer.locateByWidth('abc𐀀𐀀', 2, 7, 153, RoundMode.Round)).toEqual({offset: 5, columns: 2, width: 103});
      expect(measurer.locateByWidth('abc𐀀𐀀', 2, 7, 153, RoundMode.Ceil)).toEqual({offset: 7, columns: 3, width: 203});
      expect(measurer.locateByWidth('abc𐀀𐀀', 2, 7, 154, RoundMode.Floor)).toEqual({offset: 5, columns: 2, width: 103});
      expect(measurer.locateByWidth('abc𐀀𐀀', 2, 7, 154, RoundMode.Round)).toEqual({offset: 7, columns: 3, width: 203});
      expect(measurer.locateByWidth('abc𐀀𐀀', 2, 7, 154, RoundMode.Ceil)).toEqual({offset: 7, columns: 3, width: 203});
      expect(measurer.locateByWidth('a😀b𐀀c', 0, 6, 204, RoundMode.Round)).toEqual({offset: -1, columns: 4, width: 203});
      expect(measurer.locateByWidth('a😀b𐀀c', 0, 6, 203, RoundMode.Round)).toEqual({offset: 6, columns: 4, width: 203});
      expect(measurer.locateByColumn('', 0, 0, 0, RoundMode.Ceil)).toEqual({offset: 0, columns: 0, width: 0});
      expect(measurer.locateByColumn('', 0, 0, 5, RoundMode.Floor)).toEqual({offset: -1, columns: 0, width: 0});
    });
  });
});


new Reporter(runner);
runner.run();

