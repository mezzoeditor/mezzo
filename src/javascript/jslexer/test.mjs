/**
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {TestRunner, Reporter, Matchers} from '../../../utils/testrunner/index.mjs';
import {GoldenMatchers} from '../../../utils/GoldenMatchers';
import {Document} from '../../core/Document.mjs';
import fs from 'fs';
import path from 'path';
import __dirname from './__dirname.js';
import {Parser, TokenTypes} from './index.mjs';

const runner = new TestRunner();

const TESTDIR = path.join(__dirname, 'test');

const resetResults = process.argv.includes('--reset-results');
const goldenMatchers = new GoldenMatchers(TESTDIR, TESTDIR, resetResults);

const tokenTypeNames = new Map();
for (let typeName of Object.keys(TokenTypes)) {
  const type = TokenTypes[typeName];
  if (type.keyword)
    tokenTypeNames.set(type, 'keyword');
  else
    tokenTypeNames.set(type, typeName);
}

const files = fs.readdirSync(TESTDIR);
for (let fileName of files) {
  if (!fileName.endsWith('.js'))
    continue;
  runner.it(fileName, async () => {
    let text = await readFile(path.join(TESTDIR, fileName));
    let document = new Document();
    document.reset(text);
    let tt = new Parser({allowHashBang: true}, document.iterator(0));
    const tokens = [];
    for (let token of tt)
      tokens.push(tokenTypeNames.get(token.type));
    // Add trailing new line to be friendly with editors.
    tokens.push('');
    goldenMatchers.expectText(tokens.join('\n'), fileName.replace(/\.js$/, '-result.txt'));
  });
}

new Reporter(runner);
runner.run();

function readFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, result) => {
      if (err)
        return reject(err);
      resolve(result);
    });
  });
}
