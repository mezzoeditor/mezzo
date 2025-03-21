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
import {TestRunner, Reporter, Matchers} from '../../../utils/testrunner/index.js';
import {Document} from '../../../core/text/Document.js';
import {Parser, TokenTypes} from './index.js';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

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
      let parser = new Parser(document.text().iterator(0, 0, 4), state);

      expect(getTokens(parser)).toBe([
        {name: 'keyword', start: 0, end: 3},
      ]);

      state = parser.state();
      parser = new Parser(document.text().iterator(parser.it.offset, 0, 5), state);
      expect(getTokens(parser)).toBe([
        {name: 'name', start: 4, end: 5},
      ]);

      state = parser.state();
      parser = new Parser(document.text().iterator(parser.it.offset, 0, 8), state);
      expect(getTokens(parser)).toBe([
        {name: 'name', start: 4, end: 5},
        {name: 'eq', start: 6, end: 7},
      ]);

      state = parser.state();
      parser = new Parser(document.text().iterator(parser.it.offset, 0, 9), state);
      expect(getTokens(parser)).toBe([
        {name: 'num', start: 8, end: 9},
      ]);

      state = parser.state();
      parser = new Parser(document.text().iterator(parser.it.offset, 0, 10), state);
      expect(getTokens(parser)).toBe([
        {name: 'num', start: 8, end: 10},
      ]);

      state = parser.state();
      parser = new Parser(document.text().iterator(parser.it.offset, 0, 11), state);
      expect(getTokens(parser)).toBe([
        {name: 'num', start: 8, end: 10},
        {name: 'semi', start: 10, end: 11},
      ]);
    });
    it('should rebaseline state after edits', () => {
      let document = new Document();
      document.reset('aa;/*1234*/');
      let state = Parser.defaultState();
      let parser = new Parser(document.text().iterator(0, 0, 8), state);
      expect(getTokens(parser)).toBe([
        {name: 'name', start: 0, end: 2},
        {name: 'semi', start: 2, end: 3},
        {name: 'blockComment', start: 3, end: 8},
      ]);

      state = parser.state();
      document.replace(0, 2, '');
      expect(document.text().content()).toBe(';/*1234*/');
      parser = new Parser(document.text().iterator(parser.it.offset - 2), state);
      expect(getTokens(parser)).toBe([
        {name: 'blockComment', start: 1, end: 9},
      ]);
    });
    it('should re-parse last token', () => {
      let document = new Document();
      document.reset('function');
      let parser = new Parser(document.text().iterator(0, 0, 4), Parser.defaultState());
      expect(getTokens(parser)).toBe([
        { name: 'name', start: 0, end: 4 }
      ]);
      expect(parser.it.offset).toBe(4);

      parser = new Parser(document.text().iterator(4, 0, 7), parser.state());
      expect(getTokens(parser)).toBe([
        { name: 'name', start: 0, end: 7 }
      ]);
      expect(parser.it.offset).toBe(7);

      parser = new Parser(document.text().iterator(7, 0, 8), parser.state());
      expect(getTokens(parser)).toBe([
        { name: 'keyword', start: 0, end: 8 }
      ]);
      expect(parser.it.offset).toBe(8);
    });
    it('should re-parse last block comment', () => {
      let document = new Document();
      let text = '/* test */ ';
      document.reset(text);
      let parser = new Parser(document.text().iterator(0, 0, 1), Parser.defaultState());
      expect(getTokens(parser)).toBe([
        { name: 'regexp', start: 0, end: 1 }
      ]);
      expect(parser.it.offset).toBe(1);
      for (let i = 2; i < text.length; ++i) {
        parser = new Parser(document.text().iterator(i - 1, 0, i), parser.state());
        expect(getTokens(parser)).toBe([
          { name: 'blockComment', start: 0, end: i }
        ]);
        expect(parser.it.offset).toBe(i);
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
      let parser = new Parser(document.text().iterator(0), Parser.defaultState());
      let last = 0;
      for (let rightBorder = 4; rightBorder < N + 4; rightBorder += CHUNK) {
        parser = new Parser(document.text().iterator(last, 0, rightBorder), parser.state());
        expect(getTokens(parser)).toBe([
          { name: 'blockComment', start: 0, end: rightBorder }
        ]);
        last = rightBorder;
        expect(parser.it.offset).toBe(rightBorder);
      }
    });
    it('should re-parse last line comment', () => {
      let document = new Document();
      let text = '// test ';
      document.reset(text);
      let parser = new Parser(document.text().iterator(0, 0, 1), Parser.defaultState());
      expect(getTokens(parser)).toBe([
        { name: 'regexp', start: 0, end: 1 }
      ]);
      expect(parser.it.offset).toBe(1);
      for (let i = 2; i < text.length; ++i) {
        parser = new Parser(document.text().iterator(i - 1, 0, i), parser.state());
        expect(getTokens(parser)).toBe([
          { name: 'lineComment', start: 0, end: i }
        ]);
        expect(parser.it.offset).toBe(i);
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
      let parser = new Parser(document.text().iterator(0), Parser.defaultState());
      let last = 0;
      for (let rightBorder = 2; rightBorder < N + 2; rightBorder += CHUNK) {
        parser = new Parser(document.text().iterator(last, 0, rightBorder), parser.state());
        expect(getTokens(parser)).toBe([
          { name: 'lineComment', start: 0, end: rightBorder }
        ]);
        last = rightBorder;
        expect(parser.it.offset).toBe(rightBorder);
      }
    });
    it('should re-parse last string token', () => {
      let document = new Document();
      let text = '"foobar"';
      document.reset(text);
      let parser = new Parser(document.text().iterator(0), Parser.defaultState());
      for (let i = 1; i < text.length; ++i) {
        parser = new Parser(document.text().iterator(i - 1, 0, i), parser.state());
        expect(getTokens(parser)).toBe([
          { name: 'string', start: 0, end: i }
        ]);
        expect(parser.it.offset).toBe(i);
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
      let parser = new Parser(document.text().iterator(0), Parser.defaultState());
      let last = 0;
      for (let rightBorder = 2; rightBorder < N + 2; rightBorder += CHUNK) {
        parser = new Parser(document.text().iterator(last, 0, rightBorder), parser.state());
        expect(getTokens(parser)).toBe([
          { name: 'string', start: 0, end: rightBorder }
        ]);
        last = rightBorder;
        expect(parser.it.offset).toBe(rightBorder);
      }
    });
    it('should re-parse last template token', () => {
      let document = new Document();
      let text = '`foobar`';
      document.reset(text);
      let parser = new Parser(document.text().iterator(0, 0, 2), Parser.defaultState());
      expect(getTokens(parser)).toBe([
        { name: 'backQuote', start: 0, end: 1 },
        { name: 'template', start: 1, end: 2 }
      ]);
      expect(parser.it.offset).toBe(2);
      for (let i = 3; i < text.length; ++i) {
        parser = new Parser(document.text().iterator(i - 1, 0, i), parser.state());
        expect(getTokens(parser)).toBe([
          { name: 'template', start: 1, end: i }
        ]);
        expect(parser.it.offset).toBe(i);
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
      let parser = new Parser(document.text().iterator(0), Parser.defaultState());
      expect(tokenTypeNames.get(parser.getToken().type)).toBe('backQuote');
      expect(parser.it.offset).toBe(1);
      let last = 1;
      for (let rightBorder = 1 + CHUNK; rightBorder < N; rightBorder += CHUNK) {
        parser = new Parser(document.text().iterator(last, 0, rightBorder), parser.state());
        expect(getTokens(parser)).toBe([
          { name: 'template', start: 1, end: rightBorder }
        ]);
        last = rightBorder;
        expect(parser.it.offset).toBe(rightBorder);
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
}

