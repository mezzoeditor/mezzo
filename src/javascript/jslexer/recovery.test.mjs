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
  it('should serialize and deserialize state', () => {
    let document = new Document();
    document.reset('var a = 10;');
    let state = Parser.defaultState();
    let parser = new Parser(document.iterator(0, 0, 4), state);

    expect(getTokens(parser)).toEqual([
      {name: 'keyword', start: 0, end: 3},
    ]);

    state = parser.state();
    parser = new Parser(document.iterator(parser.it.offset, 0, 5), state);
    expect(getTokens(parser)).toEqual([
      {name: 'name', start: 4, end: 5},
    ]);

    state = parser.state();
    parser = new Parser(document.iterator(parser.it.offset, 0, 8), state);
    expect(getTokens(parser)).toEqual([
      {name: 'name', start: 4, end: 5},
      {name: 'eq', start: 6, end: 7},
    ]);

    state = parser.state();
    parser = new Parser(document.iterator(parser.it.offset, 0, 9), state);
    expect(getTokens(parser)).toEqual([
      {name: 'num', start: 8, end: 9},
    ]);

    state = parser.state();
    parser = new Parser(document.iterator(parser.it.offset, 0, 10), state);
    expect(getTokens(parser)).toEqual([
      {name: 'num', start: 8, end: 10},
    ]);

    state = parser.state();
    parser = new Parser(document.iterator(parser.it.offset, 0, 11), state);
    expect(getTokens(parser)).toEqual([
      {name: 'num', start: 8, end: 10},
      {name: 'semi', start: 10, end: 11},
    ]);
  });
  it('should rebaseline state after edits', () => {
    let document = new Document();
    document.reset('aa;/*1234*/');
    let state = Parser.defaultState();
    let parser = new Parser(document.iterator(0, 0, 8), state);
    expect(getTokens(parser)).toEqual([
      {name: 'name', start: 0, end: 2},
      {name: 'semi', start: 2, end: 3},
      {name: 'blockComment', start: 3, end: 8},
    ]);

    state = parser.state();
    document.replace(0, 2, '');
    expect(document.content()).toBe(';/*1234*/');
    parser = new Parser(document.iterator(parser.it.offset - 2), state);
    expect(getTokens(parser)).toEqual([
      {name: 'blockComment', start: 1, end: 9},
    ]);
  });
  it('should re-parse last token', () => {
    let document = new Document();
    document.reset('function');
    let parser = new Parser(document.iterator(0, 0, 4), Parser.defaultState());
    expect(getTokens(parser)).toEqual([
      { name: 'name', start: 0, end: 4 }
    ]);

    parser.it.setConstraints(0, 7);
    expect(getTokens(parser)).toEqual([
      { name: 'name', start: 0, end: 7 }
    ]);

    parser.it.setConstraints(0, 8);
    expect(getTokens(parser)).toEqual([
      { name: 'keyword', start: 0, end: 8 }
    ]);
  });
  it('should re-parse last block comment', () => {
    let document = new Document();
    let text = '/* test */ ';
    document.reset(text);
    let parser = new Parser(document.iterator(0), Parser.defaultState());
    parser.it.setConstraints(0, 1);
    expect(getTokens(parser)).toEqual([
      { name: 'regexp', start: 0, end: 1 }
    ]);
    for (let i = 2; i < text.length; ++i) {
      parser.it.setConstraints(0, i);
      expect(getTokens(parser)).toEqual([
        { name: 'blockComment', start: 0, end: i }
      ]);
    }
  });
  // NOTE: this test will work O(N^2) and will hang if parser
  // recovery doesn't work.
  it('should re-parse last block comment in O(N) time', () => {
    let document = new Document();
    // 10Mb comment
    const N = 1024 * 1024 * 10;
    let longComment = '/*' + (new Array(N).fill(' ').join('')) + '*/';
    document.reset(longComment);
    const CHUNK = 1024;
    let parser = new Parser(document.iterator(0), Parser.defaultState());
    for (let rightBorder = 4; rightBorder < N + 4; rightBorder += CHUNK) {
      parser.it.setConstraints(0, rightBorder);
      expect(getTokens(parser)).toEqual([
        { name: 'blockComment', start: 0, end: rightBorder }
      ]);
    }
  });
  it('should re-parse last line comment', () => {
    let document = new Document();
    let text = '// test ';
    document.reset(text);
    let parser = new Parser(document.iterator(0), Parser.defaultState());
    parser.it.setConstraints(0, 1);
    expect(getTokens(parser)).toEqual([
      { name: 'regexp', start: 0, end: 1 }
    ]);
    for (let i = 2; i < text.length; ++i) {
      parser.it.setConstraints(0, i);
      expect(getTokens(parser)).toEqual([
        { name: 'lineComment', start: 0, end: i }
      ]);
    }
  });
  // NOTE: this test will work O(N^2) and will hang if parser
  // recovery doesn't work.
  it('should re-parse last line comment in O(N) time', () => {
    let document = new Document();
    // 10Mb comment
    const N = 1024 * 1024 * 10;
    let longComment = '//' + (new Array(N).fill(' ').join(''));
    document.reset(longComment);
    const CHUNK = 1024;
    let parser = new Parser(document.iterator(0), Parser.defaultState());
    for (let rightBorder = 2; rightBorder < N + 2; rightBorder += CHUNK) {
      parser.it.setConstraints(0, rightBorder);
      expect(getTokens(parser)).toEqual([
        { name: 'lineComment', start: 0, end: rightBorder }
      ]);
    }
  });
  it('should re-parse last string token', () => {
    let document = new Document();
    let text = '"foobar"';
    document.reset(text);
    let parser = new Parser(document.iterator(0), Parser.defaultState());
    for (let i = 1; i < text.length; ++i) {
      parser.it.setConstraints(0, i);
      expect(getTokens(parser)).toEqual([
        { name: 'string', start: 0, end: i }
      ]);
    }
  });
  // NOTE: this test will work O(N^2) and will hang if parser
  // recovery doesn't work.
  it('should re-parse last string token in O(N) time', () => {
    let document = new Document();
    // 10Mb comment
    const N = 1024 * 1024 * 10;
    let longString = '"' + (new Array(N).fill(' ').join('')) + '"';
    document.reset(longString);
    const CHUNK = 1024;
    let parser = new Parser(document.iterator(0), Parser.defaultState());
    for (let rightBorder = 2; rightBorder < N + 2; rightBorder += CHUNK) {
      parser.it.setConstraints(0, rightBorder);
      expect(getTokens(parser)).toEqual([
        { name: 'string', start: 0, end: rightBorder }
      ]);
    }
  });
  it('should re-parse last template token', () => {
    let document = new Document();
    let text = '`foobar`';
    document.reset(text);
    let parser = new Parser(document.iterator(0), Parser.defaultState());
    parser.it.setConstraints(0, 2);
    expect(getTokens(parser)).toEqual([
      { name: 'backQuote', start: 0, end: 1 },
      { name: 'template', start: 1, end: 2 }
    ]);
    for (let i = 3; i < text.length; ++i) {
      parser.it.setConstraints(0, i);
      expect(getTokens(parser)).toEqual([
        { name: 'template', start: 1, end: i }
      ]);
    }
  });
  // NOTE: this test will work O(N^2) and will hang if parser
  // recovery doesn't work.
  it('should re-parse last template token in O(N) time', () => {
    let document = new Document();
    // 10Mb comment
    const N = 1024 * 1024 * 10;
    let longTemplate = '`' + (new Array(N).fill(' ').join('')) + '`';
    document.reset(longTemplate);
    const CHUNK = 1024;
    let parser = new Parser(document.iterator(0), Parser.defaultState());
    expect(tokenTypeNames.get(parser.getToken().type)).toBe('backQuote');
    for (let rightBorder = 1 + CHUNK; rightBorder < N; rightBorder += CHUNK) {
      parser.it.setConstraints(0, rightBorder);
      expect(getTokens(parser)).toEqual([
        { name: 'template', start: 1, end: rightBorder }
      ]);
    }
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

