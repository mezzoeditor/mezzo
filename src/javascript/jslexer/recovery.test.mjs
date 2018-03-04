#!/usr/bin/env node --experimental-modules

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
import {Document} from '../../core/Document.mjs';
import fs from 'fs';
import path from 'path';
import {Parser, TokenTypes} from './index.mjs';

const runner = new TestRunner();

const {it, fit, xit} = runner;
const {describe, fdescribe, xdescribe} = runner;
const {afterAll, beforeAll, afterEach, beforeEach} = runner;
const {expect} = new Matchers();

const tokenTypeNames = new Map();
for (let typeName of Object.keys(TokenTypes)) {
  const type = TokenTypes[typeName];
  if (type.keyword)
    tokenTypeNames.set(type, 'keyword');
  else
    tokenTypeNames.set(type, typeName);
}

describe('Recovery', () => {
  it('should re-parse last token when iterator updated', () => {
    let document = new Document(() => {});
    document.reset('function');
    let parser = new Parser({allowHashBang: true}, document.iterator(0, 0, 4));
    expect(getTokens(parser)).toEqual([
      { name: 'name', start: 0, end: 4 }
    ]);

    parser.setIterator(document.iterator(parser.it.offset, 0, 7));
    expect(getTokens(parser)).toEqual([
      { name: 'name', start: 0, end: 7 }
    ]);

    parser.setIterator(document.iterator(parser.it.offset, 0, 8));
    expect(getTokens(parser)).toEqual([
      { name: 'keyword', start: 0, end: 8 }
    ]);
  });
});

function getTokens(parser) {
  const tokens = [];
  for (let token of parser) {
    tokens.push({
      name: tokenTypeNames.get(token.type),
      start: token.start,
      end: token.end
    });
  }
  return tokens;
}

new Reporter(runner);
runner.run();

