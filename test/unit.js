#!/usr/bin/env node -r esm

import {TestRunner, Reporter, Matchers} from '../utils/testrunner/index.js';
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
  (await import('../core/text/Document.spec.js')).addTests(runner, expect, options);
  (await import('../core/text/Text.spec.js')).addTests(runner, expect, options);
  (await import('../core/text/TextIterator.spec.js')).addTests(runner, expect, options);
  (await import('../core/text/TextMeasurer.spec.js')).addTests(runner, expect, options);
  (await import('../core/text/TextUtils.spec.js')).addTests(runner, expect, options);
  (await import('../core/utils/OrderedMonoidTree.spec.js')).addTests(runner, expect, options);
  (await import('../core/utils/RangeTree.spec.js')).addTests(runner, expect, options);
  (await import('../core/utils/WorkAllocator.spec.js')).addTests(runner, expect, options);
  (await import('../core/markup/Markup.spec.js')).addTests(runner, expect, options);

  // Plugin tests.
  (await import('../plugins/Search.spec.js')).addTests(runner, expect, options);
  (await import('../plugins/WordDictionary.spec.js')).addTests(runner, expect, options);
  (await import('../plugins/AddNextOccurence.spec.js')).addTests(runner, expect, options);

  // Editor tests.
  (await import('../core/editor/Editor.spec.js')).addTests(runner, expect, options);
  (await import('../core/editor/Input.spec.js')).addTests(runner, expect, options);
  (await import('../core/editor/Thread.spec.js')).addTests(runner, expect, options);

  // JSLexer unit tests
  (await import('../lang/javascript/jslexer/tokenizer.spec.js')).addTests(runner, expect, options);
  (await import('../lang/javascript/jslexer/recovery.spec.js')).addTests(runner, expect, options);

  new Reporter(runner);
  runner.run();
})();

