#!/usr/bin/env node --experimental-modules

import {TestRunner, Reporter, Matchers} from '../utils/testrunner/index.mjs';
const runner = new TestRunner();
const {expect} = new Matchers();

console.log(import.meta.url);

(async () => {
  // Core unit tests
  (await import('../src/core/Document.spec.mjs')).addTests(runner, expect);
  (await import('../src/core/TextIterator.spec.mjs')).addTests(runner, expect);
  (await import('../src/core/Markup.spec.mjs')).addTests(runner, expect);
  (await import('../src/core/Decorator.spec.mjs')).addTests(runner, expect);
  (await import('../src/core/Metrics.spec.mjs')).addTests(runner, expect);
  (await import('../src/core/Tree.spec.mjs')).addTests(runner, expect);
  (await import('../src/core/Text.spec.mjs')).addTests(runner, expect);
  (await import('../src/core/WorkAllocator.spec.mjs')).addTests(runner, expect);

  // Editor tests.
  (await import('../src/editor/Search.spec.mjs')).addTests(runner, expect);
  (await import('../src/editor/Editor.spec.mjs')).addTests(runner, expect);

  // JSLexer unit tests
  (await import('../src/javascript/jslexer/tokenizer.spec.mjs')).addTests(runner, expect);
  (await import('../src/javascript/jslexer/recovery.spec.mjs')).addTests(runner, expect);


  new Reporter(runner);
  runner.run();
})();

