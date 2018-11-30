#!/usr/bin/env node --experimental-modules

import {TestRunner, Reporter, Matchers} from '../utils/testrunner/index.mjs';
import path from 'path';
import url from 'url';
import fs from 'fs';
import rimraf from 'rimraf';

const runner = new TestRunner();
const {expect} = new Matchers();

const __dirname = path.dirname(new url.URL(import.meta.url).pathname);
const options = {
  outputFolder: path.join(__dirname, '..', 'out'),
  resetResults: process.argv.includes('--reset-results'),
};

if (fs.existsSync(options.outputFolder))
  rimraf.sync(options.outputFolder);

(async () => {
  // Core unit tests
  (await import('../src/text/Document.spec.mjs')).addTests(runner, expect, options);
  (await import('../src/text/Text.spec.mjs')).addTests(runner, expect, options);
  (await import('../src/text/TextIterator.spec.mjs')).addTests(runner, expect, options);
  (await import('../src/text/TextMeasurer.spec.mjs')).addTests(runner, expect, options);
  (await import('../src/text/TextUtils.spec.mjs')).addTests(runner, expect, options);
  (await import('../src/utils/OrderedMonoidTree.spec.mjs')).addTests(runner, expect, options);
  (await import('../src/utils/RangeTree.spec.mjs')).addTests(runner, expect, options);
  (await import('../src/utils/WorkAllocator.spec.mjs')).addTests(runner, expect, options);
  (await import('../src/markup/Markup.spec.mjs')).addTests(runner, expect, options);

  // Plugin tests.
  (await import('../plugins/Search.spec.mjs')).addTests(runner, expect, options);
  (await import('../plugins/WordDictionary.spec.mjs')).addTests(runner, expect, options);
  (await import('../plugins/AddNextOccurence.spec.mjs')).addTests(runner, expect, options);

  // Editor tests.
  (await import('../src/editor/Editor.spec.mjs')).addTests(runner, expect, options);
  (await import('../src/editor/Input.spec.mjs')).addTests(runner, expect, options);
  (await import('../src/editor/Thread.spec.mjs')).addTests(runner, expect, options);

  // JSLexer unit tests
  (await import('../src/javascript/jslexer/tokenizer.spec.mjs')).addTests(runner, expect, options);
  (await import('../src/javascript/jslexer/recovery.spec.mjs')).addTests(runner, expect, options);

  new Reporter(runner);
  runner.run();
})();

