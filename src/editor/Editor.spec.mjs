import {GoldenMatchers} from '../../utils/GoldenMatchers';
import {TestPlatformSupport} from './utils.spec.mjs';
import {SVGRenderer} from '../../test/SVGRenderer.mjs';
import {Search} from '../../plugins/Search.mjs';
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
    it('simple', () => {
      const renderer = new SVGRenderer(new TestPlatformSupport());
      renderer.editor().reset('hello\nasdf\nasdf\nasdf\n');
      renderer.editor().document().setSelection([
        {anchor: 0, focus: 7},
        {anchor: 19, focus: 19},
      ]);
      golden.expectText(renderer.render(1.1, 0), 'simple.svg');
    });

    function renderComplex(scrollLeft, scrollTop) {
      const platform = new TestPlatformSupport();
      const renderer = new SVGRenderer(platform);
      const search = new Search(renderer.editor());
      const lines = [];
      for (let i = 0; i < 100; i++) {
        lines.push(Array((i % 10) + 10).join('Line' + i + ' '));
      }
      const document = renderer.editor().document();
      renderer.editor().reset(lines.join('\n'));
      search.find('Line5');
      platform.runUntilIdle();
      document.setSelection([
        {anchor: document.text().positionToOffset({line: 48, column: 70}),
         focus: document.text().positionToOffset({line: 53, column: 80})},

        {anchor: document.text().positionToOffset({line: 39, column: 77}),
         focus: document.text().positionToOffset({line: 39, column: 72})},

        {anchor: document.text().positionToOffset({line: 44, column: 84}),
         focus: document.text().positionToOffset({line: 44, column: 84})},
      ]);
      return renderer.render(scrollLeft, scrollTop);
    }

    it('complex-000-000', () => {
      golden.expectText(renderComplex(0.0, 0.0), 'complex-000-000.svg');
    });
    it('complex-002-003', () => {
      golden.expectText(renderComplex(0.2, 0.3), 'complex-002-003.svg');
    });
    it('complex-640-370', () => {
      golden.expectText(renderComplex(64.0, 37.0), 'complex-640-370.svg');
    });
    it('complex-657-384', () => {
      golden.expectText(renderComplex(65.7, 38.4), 'complex-657-384.svg');
    });
    it('complex-000-384', () => {
      golden.expectText(renderComplex(0.0, 38.4), 'complex-000-384.svg');
    });
    it('complex-999-384', () => {
      golden.expectText(renderComplex(99.9, 38.4), 'complex-999-384.svg');
    });
    it('complex-999-999', () => {
      golden.expectText(renderComplex(99.9, 99.9), 'complex-999-999.svg');
    });
  });
}

