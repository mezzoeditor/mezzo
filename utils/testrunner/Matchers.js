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

export class Matchers {
  constructor(customMatchers = {}) {
    this._matchers = {};
    Object.assign(this._matchers, DefaultMatchers);
    Object.assign(this._matchers, customMatchers);
    this.expect = this.expect.bind(this);
  }

  addMatcher(name, matcher) {
    this._matchers[name] = matcher;
  }

  expect(value) {
    return new Expect(value, this._matchers);
  }
};

class Expect {
  constructor(value, matchers) {
    this.not = {};
    this.not.not = this;
    for (const matcherName of Object.keys(matchers)) {
      const matcher = matchers[matcherName];
      this[matcherName] = applyMatcher.bind(null, matcherName, matcher, false, value);
      this.not[matcherName] = applyMatcher.bind(null, matcherName, matcher, true, value);
    }

    function applyMatcher(matcherName, matcher, inverse, value, ...args) {
      const result = matcher.call(null, value, ...args);
      const message = `expect.${matcherName} failed` + (result.message ? `: ${result.message}` : '');
      if (result.pass === inverse)
        throw new Error(message);
    }
  }
}

const DefaultMatchers = {
  /**
   * @param {*} value
   * @param {*} other
   * @param {string=} message
   */
  toBe: function(value, other, message) {
    // 1. PASS if values are strictly equal
    if (Object.is(value, other))
      return { pass: true, message: message || `${value} === ${other}` };
    // 2. FAIL if values are of different type
    if (typeof value !== typeof other)
      return { pass: false, message: message || `${value} === ${other}` };
    // 3. Compare value serialization
    const valueJson = stringify(value);
    const otherJson = stringify(other);
    message = message || `${valueJson} ≈ ${otherJson}`;
    return { pass: valueJson === otherJson, message };
  },

  toBeFalsy: function(value, message) {
    message = message || `${value}`;
    return { pass: !value, message };
  },

  toBeTruthy: function(value, message) {
    message = message || `${value}`;
    return { pass: !!value, message };
  },

  toBeGreaterThan: function(value, other, message) {
    message = message || `${value} > ${other}`;
    return { pass: value > other, message };
  },

  toBeGreaterThanOrEqual: function(value, other, message) {
    message = message || `${value} >= ${other}`;
    return { pass: value >= other, message };
  },

  toBeLessThan: function(value, other, message) {
    message = message || `${value} < ${other}`;
    return { pass: value < other, message };
  },

  toBeLessThanOrEqual: function(value, other, message) {
    message = message || `${value} <= ${other}`;
    return { pass: value <= other, message };
  },

  toBeNull: function(value, message) {
    message = message || `${value} == null`;
    return { pass: value === null, message };
  },

  toContain: function(value, other, message) {
    message = message || `${value} ⊇ ${other}`;
    return { pass: value.includes(other), message };
  },

  toBeCloseTo: function(value, other, precision, message) {
    return {
      pass: Math.abs(value - other) < Math.pow(10, -precision),
      message
    };
  }
};

function stringify(value) {
  function stabilize(key, object) {
    if (typeof object !== 'object' || object === undefined || object === null || Array.isArray(object))
      return object;
    const result = {};
    for (const key of Object.keys(object).sort())
      result[key] = object[key];
    return result;
  }

  return JSON.stringify(stabilize(null, value), stabilize);
}
