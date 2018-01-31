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
import fs from 'fs';
import path from 'path';
import __dirname from './__dirname.js';
import {Document} from '../../core/Document.mjs';
import {Classifier} from './index.mjs';

const TESTDIR = path.join(__dirname, 'data');

let ngrams = new Map();
let totalNgrams = 0;

processFiles(fs.readdirSync(TESTDIR));

async function processFiles(files) {
  const classifier = new Classifier();
  for (let fileName of files) {
    let text = await readFile(path.join(TESTDIR, fileName));
    let document = new Document(() => {}, () => {});
    document.reset(text);
    classifier.train(document.iterator(0));
  }

  const content = 'export default ' + JSON.stringify(classifier.json(), null, 2);
  fs.writeFileSync('freq.mjs', content);
  console.log(content);

  //console.log(classify(classifier, 'bute("class",h)}}return this},removeClass:function(a){var b,c,d,e,f,g,h,i=0;if(r.isFun'));
  //console.log(classify(classifier, 'import { Decorator } from "../src/core/Decorator.mjs";'));
  console.log(classify(classifier, 'id 0!==2'));
}

function classify(classifier, text) {
  let document = new Document(() => {}, () => {});
  document.reset(text);
  console.log(classifier.classify(document.iterator(0)));
}

function readFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, result) => {
      if (err)
        return reject(err);
      resolve(result);
    });
  });
}

function tokenName(token) {
  if (token.type.keyword)
    return 'keyword';
  if (token.type.isAssign)
    return 'assign';
  if (token.type.isLoop)
    return 'loop';
  if (token.type.binop)
    return 'binop';
  return token.type.label;
}
