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
import {GoldenMatchers} from '../../../utils/GoldenMatchers';
import {Document} from '../../text/Document.mjs';
import fs from 'fs';
import path from 'path';
import {Parser, TokenTypes} from './index.mjs';
import url from 'url';

export function addTests(runner, expect, options) {
  const __dirname = path.dirname(new url.URL(import.meta.url).pathname);
  const TESTDIR = path.join(__dirname, 'test');
  const OUTDIR = path.join(options.outputFolder, 'jslexer');
  const goldenMatchers = new GoldenMatchers(TESTDIR, OUTDIR, options.resetResults);

  const tokenTypeNames = new Map();
  for (let typeName of Object.keys(TokenTypes)) {
    const type = TokenTypes[typeName];
    if (type.keyword)
      tokenTypeNames.set(type, 'keyword');
    else
      tokenTypeNames.set(type, typeName);
  }

  runner.it('should work', async () => {
    const files = fs.readdirSync(TESTDIR);
    let document = new Document();
    for (let fileName of files) {
      if (!fileName.endsWith('.js'))
        continue;
      let text = await readFile(path.join(TESTDIR, fileName));
      document.reset(text);
      let tt = new Parser(document.text().iterator(0), Parser.defaultState());
      const tokens = [];
      for (let token of tt)
        tokens.push(tokenTypeNames.get(token.type));
      // Add trailing new line to be friendly with editors.
      tokens.push('');
      goldenMatchers.expectText(tokens.join('\n'), fileName.replace(/\.js$/, '-result.txt'));
    }
  });

  function readFile(filePath) {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf8', (err, result) => {
        if (err)
          return reject(err);
        resolve(result);
      });
    });
  }
}

