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
import url from 'url';

const __dirname = path.dirname(new url.URL(import.meta.url).pathname);

const actualSuffix = '.actual';
const expectedSuffix = '.expected';
const diffSuffix = '.diff';

export class GoldenMatchers {
  constructor(goldenDir, outputDir, resetResults) {
    this._goldenDir = path.normalize(goldenDir);
    this._outputDir = path.normalize(outputDir);
    this._resetResults = resetResults;
    if (resetResults && fs.existsSync(this._outputDir)) {
      const files = fs.readdirSync(this._outputDir);
      for (const file of files) {
        if (file.includes(actualSuffix) || file.includes(expectedSuffix) || file.includes(diffSuffix))
          fs.unlinkSync(path.join(this._outputDir, file));
      }
      // Cleanup .actual, .expected and .diff files.
    }
  }

  _expect(actual, goldenName, comparator) {
    if (goldenName.includes(actualSuffix) || goldenName.includes(expectedSuffix) || goldenName.includes(diffSuffix))
      throw new Error(`Invalid golden name: "${goldenName}". Name cannot contain "${actualSuffix}", "${expectedSuffix}" or ${diffSuffix}".`);
    if (this._resetResults) {
      this._overwrite(actual, goldenName);
      return;
    }
    const result = compare(this._goldenDir, this._outputDir, actual, goldenName, comparator);
    if (!result.pass)
      throw new Error(result.message);
  }

  expectText(actual, goldenName) {
    this._expect(actual, goldenName, plainTextComparator);
  }

  expectSVG(actual, goldenName) {
    this._expect(actual, goldenName, svgComparator);
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
function svgComparator(actual, expectedBuffer) {
  if (typeof actual !== 'string')
    return { errorMessage: 'Actual result should be string' };
  const expected = expectedBuffer.toString('utf-8');
  if (expected === actual)
    return null;
  const diff = new Diff();
  const result = diff.main(expected, actual);
  diff.cleanupSemantic(result);
  let htmldiff = diff.prettyHtml(result);
  const diffStylePath = path.join(__dirname, 'textdiff.css');
  let html = `
    <link rel="stylesheet" href="file://${diffStylePath}">
    <h1>SVG Diff</h1>
    <div class=svg-output>
      <h3>Actual</h3>
      <h3>Expected</h3>
      <img class='svg-actual' src='data:image/svg+xml,${actual}'></img>
      <img class='svg-expected' src='data:image/svg+xml,${expected}'></img>
      <h3>Difference</h3> <h3></h3>
      <div class=svg-difference>
        <img class=svg-difference-actual src='data:image/svg+xml,${actual}'></img>
        <img src='data:image/svg+xml,${expected}'></img>
      </div>
    </div>

    <h1>Text Diff</h1>
    <div>
      ${htmldiff}
    </div>
  `;
  return {
    diff: html,
    diffExtension: '.html'
  };
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
    fs.writeFileSync(addSuffix(actualPath, actualSuffix), actual);
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
  fs.writeFileSync(addSuffix(actualPath, actualSuffix), actual);
  fs.writeFileSync(addSuffix(actualPath, expectedSuffix), expected);
  if (result.diff) {
    const diffPath = addSuffix(actualPath, diffSuffix, result.diffExtension);
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
    if (fs.existsSync(outputPath))
      return;
    let folderPath = '';
    for (const token of outputPath.split(path.sep)) {
      folderPath += token + path.sep;
      if (!fs.existsSync(folderPath))
        fs.mkdirSync(folderPath);
    }
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
