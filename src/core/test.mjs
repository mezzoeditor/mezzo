import {TestRunner, Reporter, Matchers} from '../../utils/testrunner/index.mjs';
import {Text} from './Text.mjs';

const runner = new TestRunner();

const {describe, xdescribe, fdescribe} = runner;
const {it, fit, xit} = runner;
const {beforeAll, beforeEach, afterAll, afterEach} = runner;

const {expect} = new Matchers();

describe('Text', () => {
  it('Text.content', () => {
    let text = Text.withContent('world');
    expect(text.content(1,3)).toBe('or');
  });

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
});


new Reporter(runner);
runner.run();

