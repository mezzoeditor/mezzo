import {GoldenMatchers} from '../../utils/GoldenMatchers';
import {TestPlatformSupport} from '../../test/utils.mjs';
import {SVGRenderer} from '../../test/SVGRenderer.mjs';
import {Search} from '../../plugins/Search.mjs';
import {WrappingMode} from '../core/Markup.mjs';
import url from 'url';
import path from 'path';

export function addTests(runner, expect, options) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  const __dirname = path.dirname(new url.URL(import.meta.url).pathname);
  const TESTDIR = path.join(__dirname, 'test-results');
  const OUTDIR = path.join(options.outputFolder, 'editor');
  const golden = new GoldenMatchers(TESTDIR, OUTDIR, options.resetResults);

  describe('Viewport decoration', () => {
    it('simple', () => {
      const platform = new TestPlatformSupport();
      const renderer = new SVGRenderer(platform);
      renderer.editor().reset('hello\nasdf\nasdf\nasdf\n');
      renderer.editor().document().setSelection([
        {anchor: 0, focus: 7},
        {anchor: 19, focus: 19},
      ]);
      platform.runUntilIdle();
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
      golden.expectSVG(renderComplex(0.0, 0.0), 'complex-000-000.svg');
    });
    it('complex-002-003', () => {
      golden.expectSVG(renderComplex(0.2, 0.3), 'complex-002-003.svg');
    });
    it('complex-640-370', () => {
      golden.expectSVG(renderComplex(64.0, 37.0), 'complex-640-370.svg');
    });
    it('complex-657-384', () => {
      golden.expectSVG(renderComplex(65.7, 38.4), 'complex-657-384.svg');
    });
    it('complex-000-384', () => {
      golden.expectSVG(renderComplex(0.0, 38.4), 'complex-000-384.svg');
    });
    it('complex-999-384', () => {
      golden.expectSVG(renderComplex(99.9, 38.4), 'complex-999-384.svg');
    });
    it('complex-999-999', () => {
      golden.expectSVG(renderComplex(99.9, 99.9), 'complex-999-999.svg');
    });
  });

  describe('Wrapping', () => {
    function renderWrapping(scrollLeft, scrollTop, wrappingMode, wrapLineLength) {
      const platform = new TestPlatformSupport();
      const renderer = new SVGRenderer(platform);
      const lines = [];
      for (let i = 0; i < 100; i++) {
        let line = [];
        for (let j = 0; j < 10; j++)
          line.push(Array(j + (i % 10) + 2).join('a'));
        line = line.join(' ');
        let res = '';
        for (let j = 0; j < line.length; j++) {
          if (line[j] === ' ')
            res += ' ';
          else
            res += ((j + 1) % 10);
        }
        lines.push(res);
      }
      renderer.editor().reset(lines.join('\n'));
      renderer.editor().markup().setWrappingMode(wrappingMode, wrapLineLength);
      platform.runUntilIdle();
      return renderer.render(scrollLeft, scrollTop);
    }

    function renderWordWrap(scrollLeft, scrollTop, wrapLineLength) {
      return renderWrapping(scrollLeft, scrollTop, WrappingMode.Word, wrapLineLength);
    }

    function renderLineWrap(scrollLeft, scrollTop, wrapLineLength) {
      return renderWrapping(scrollLeft, scrollTop, WrappingMode.Line, wrapLineLength);
    }

    it('wordwrap-23', () => {
      golden.expectSVG(renderWordWrap(0.0, 0.0, 23), 'wordwrap-23.svg');
    });

    it('wordwrap-23-scroll', () => {
      golden.expectSVG(renderWordWrap(1.6, 5.8, 23), 'wordwrap-23-scroll.svg');
    });

    it('wordwrap-23-end', () => {
      golden.expectSVG(renderWordWrap(99, 99, 23), 'wordwrap-23-end.svg');
    });

    it('wordwrap-14', () => {
      golden.expectSVG(renderWordWrap(0.0, 0.0, 14), 'wordwrap-14.svg');
    });

    it('wordwrap-2.1', () => {
      golden.expectSVG(renderWordWrap(0.0, 0.0, 2.1), 'wordwrap-2.1.svg');
    });

    it('wordwrap-100', () => {
      golden.expectSVG(renderWordWrap(0.0, 0.0, 100), 'wordwrap-100.svg');
    });

    it('wordwrap-100-end', () => {
      golden.expectSVG(renderWordWrap(0, 150, 100), 'wordwrap-100-end.svg');
    });

    it('wordwrap-5.2', () => {
      golden.expectSVG(renderWordWrap(0.0, 0.0, 5.2), 'wordwrap-5.2.svg');
    });

    it('linewrap-23-scroll', () => {
      golden.expectSVG(renderLineWrap(1.6, 5.8, 23), 'linewrap-23-scroll.svg');
    });
  });
}

