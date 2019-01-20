#!/usr/bin/env node -r esm

import {TestRunner, Reporter, Matchers} from '../utils/testrunner/index.mjs';
import path from 'path';
import url from 'url';
import fs from 'fs';
import rimraf from 'rimraf';

const runner = new TestRunner();
const {expect} = new Matchers();

const __DIRNAME = path.dirname(new url.URL(import.meta.url).pathname);
const options = {
  outputFolder: path.join(__DIRNAME, '..', 'out'),
  resetResults: process.argv.includes('--reset-results'),
};

if (fs.existsSync(options.outputFolder))
  rimraf.sync(options.outputFolder);

(async () => {
  // Core unit tests
  (await import('../core/text/Document.spec.mjs')).addTests(runner, expect, options);
  (await import('../core/text/Text.spec.mjs')).addTests(runner, expect, options);
  (await import('../core/text/TextIterator.spec.mjs')).addTests(runner, expect, options);
  (await import('../core/text/TextMeasurer.spec.mjs')).addTests(runner, expect, options);
  (await import('../core/text/TextUtils.spec.mjs')).addTests(runner, expect, options);
  (await import('../core/utils/OrderedMonoidTree.spec.mjs')).addTests(runner, expect, options);
  (await import('../core/utils/RangeTree.spec.mjs')).addTests(runner, expect, options);
  (await import('../core/utils/WorkAllocator.spec.mjs')).addTests(runner, expect, options);
  (await import('../core/markup/Markup.spec.mjs')).addTests(runner, expect, options);

  // Plugin tests.
  (await import('../plugins/Search.spec.mjs')).addTests(runner, expect, options);
  (await import('../plugins/WordDictionary.spec.mjs')).addTests(runner, expect, options);
  (await import('../plugins/AddNextOccurence.spec.mjs')).addTests(runner, expect, options);

  // Editor tests.
  (await import('../core/editor/Editor.spec.mjs')).addTests(runner, expect, options);
  (await import('../core/editor/Input.spec.mjs')).addTests(runner, expect, options);
  (await import('../core/editor/Thread.spec.mjs')).addTests(runner, expect, options);

  // JSLexer unit tests
  (await import('../lang/javascript/jslexer/tokenizer.spec.mjs')).addTests(runner, expect, options);
  (await import('../lang/javascript/jslexer/recovery.spec.mjs')).addTests(runner, expect, options);

  new Reporter(runner);
  runner.run();
})();

