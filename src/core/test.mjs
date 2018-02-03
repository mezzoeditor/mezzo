import {TestRunner, Reporter, Matchers} from '../../utils/testrunner/index.mjs';
import {Text} from './Text.mjs';
import {Document} from './Document.mjs';

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
      expect(viewport.maxScrollTop()).toBe(100);

      viewport.advanceScroll(50, 50);
      expect(viewport.scrollLeft()).toBe(0);
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

