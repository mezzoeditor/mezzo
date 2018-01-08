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
import path from 'path';
import fs from 'fs';
import Diff from 'text-diff';
import __dirname from './__dirname';

export class GoldenMatchers {
  constructor(goldenDir, outputDir, resetResults) {
    this._goldenDir = path.normalize(goldenDir);
    this._outputDir = path.normalize(outputDir);
    this._resetResults = resetResults;
  }

  expectText(actual, goldenName) {
    if (this._resetResults) {
      this._overwrite(actual, goldenName);
      return;
    }
    const result = compare(this._goldenDir, this._outputDir, actual, goldenName, plainTextComparator);
    console.assert(result.pass, result.message);
  }

  _overwrite(actual, goldenName) {
    const expectedPath = path.join(this._goldenDir, goldenName);
    fs.writeFileSync(expectedPath, actual);
  }
}

/**
 * @param {?Object} actual
 * @param {!Buffer} expectedBuffer
 * @return {?{diff: (!Object:undefined), errorMessage: (string|undefined)}}
 */
function plainTextComparator(actual, expectedBuffer) {
  if (typeof actual !== 'string')
    return { errorMessage: 'Actual result should be string' };
  const expected = expectedBuffer.toString('utf-8');
  if (expected === actual)
    return null;
  const diff = new Diff();
  const result = diff.main(expected, actual);
  diff.cleanupSemantic(result);
  let html = diff.prettyHtml(result);
  const diffStylePath = path.join(__dirname, 'textdiff.css');
  html = `<link rel="stylesheet" href="file://${diffStylePath}">` + html;
  return {
    diff: html,
    diffExtension: '.html'
  };
}

/**
 * @param {string} goldenPath
 * @param {string} outputPath
 * @param {?Object} actual
 * @param {string} goldenName
 * @return {!{pass: boolean, message: (undefined|string)}}
 */
function compare(goldenPath, outputPath, actual, goldenName, comparator) {
  const expectedPath = path.join(goldenPath, goldenName);
  const actualPath = path.join(outputPath, goldenName);

  const messageSuffix = 'Output is saved in "' + path.basename(outputPath + '" directory');

  if (!fs.existsSync(expectedPath)) {
    ensureOutputDir();
    fs.writeFileSync(actualPath, actual);
    return {
      pass: false,
      message: goldenName + ' is missing in golden results. ' + messageSuffix
    };
  }
  const expected = fs.readFileSync(expectedPath);
  const result = comparator(actual, expected);
  if (!result)
    return { pass: true };
  ensureOutputDir();
  if (goldenPath === outputPath) {
    fs.writeFileSync(addSuffix(actualPath, '-actual'), actual);
  } else {
    fs.writeFileSync(actualPath, actual);
    // Copy expected to the output/ folder for convenience.
    fs.writeFileSync(addSuffix(actualPath, '-expected'), expected);
  }
  if (result.diff) {
    const diffPath = addSuffix(actualPath, '-diff', result.diffExtension);
    fs.writeFileSync(diffPath, result.diff);
  }

  let message = goldenName + ' mismatch!';
  if (result.errorMessage)
    message += ' ' + result.errorMessage;
  return {
    pass: false,
    message: message + ' ' + messageSuffix
  };

  function ensureOutputDir() {
    if (!fs.existsSync(outputPath))
      fs.mkdirSync(outputPath);
  }
}

/**
 * @param {string} filePath
 * @param {string} suffix
 * @param {string=} customExtension
 * @return {string}
 */
function addSuffix(filePath, suffix, customExtension) {
  const dirname = path.dirname(filePath);
  const ext = path.extname(filePath);
  const name = path.basename(filePath, ext);
  return path.join(dirname, name + suffix + (customExtension || ext));
}
