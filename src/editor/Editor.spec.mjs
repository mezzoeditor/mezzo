import {GoldenMatchers} from '../../utils/GoldenMatchers';
import {TestPlatformSupport} from './utils.spec.mjs';
import {SVGRenderer} from '../../test/SVGRenderer.mjs';
import url from 'url';
import path from 'path';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  const __dirname = path.dirname(new url.URL(import.meta.url).pathname);
  const TESTDIR = path.join(__dirname, 'test-results');
  const golden = new GoldenMatchers(TESTDIR, TESTDIR, process.argv.includes('--reset-results'));

  describe('Viewport decoration', () => {
    it('should work', () => {
      const renderer = new SVGRenderer(new TestPlatformSupport());
      renderer.editor().reset('hello\nasdf\nasdf\nasdf\n');
      renderer.editor().document().setSelection([
        {anchor: 0, focus: 7},
        {anchor: 19, focus: 19},
      ]);
      golden.expectText(renderer.render(1.1, 0), 'simple.svg');
    });
  });
}

