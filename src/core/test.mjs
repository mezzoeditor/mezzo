import {TestRunner, Reporter, Matchers} from '../../utils/testrunner/index.mjs';
import {Document} from './Document.mjs';

const runner = new TestRunner();

const {describe, xdescribe, fdescribe} = runner;
const {it, fit, xit} = runner;
const {beforeAll, beforeEach, afterAll, afterEach} = runner;

const {expect} = new Matchers();

describe('core', () => {
  beforeAll(state => {
    state.doc = new Document(() => {}, () => {});
  });

  it('Text.Iterator basics', ({doc}) => {
    doc.reset('world');
    let it = doc.iterator(0);
    expect(it.current).toBe('w');
    expect(it.offset).toBe(0);
    it.next();
    expect(it.current).toBe('o');
    expect(it.offset).toBe(1);
    it.prev();
    expect(it.current).toBe('w');
    expect(it.offset).toBe(0);
  });
  it('Text.Iterator.advance', ({doc}) => {
    doc.reset('world');
    let it = doc.iterator(0);
    it.advance(4);
    expect(it.current).toBe('d');
    it.advance(-2);
    expect(it.current).toBe('r');
  });
  it('Text.Iterator.find successful', ({doc}) => {
    doc.reset('hello, world');
    let it = doc.iterator(0);
    expect(it.find('world')).toBe(true);
    expect(it.offset).toBe(7);
    expect(it.current).toBe('w');
  });
  it('Text.Iterator.find unsuccessful', ({doc}) => {
    doc.reset('hello, world');
    let it = doc.iterator(0);
    expect(it.find('eee')).toBe(false);
    expect(it.offset).toBe(12);
    expect(it.current).toBe(undefined);
  });
});


new Reporter(runner);
runner.run();

