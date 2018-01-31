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

const {helper} = require('./helper');
const Page = require('./Page');
const EventEmitter = require('events');

class Browser extends EventEmitter {
  /**
   * @param {!Puppeteer.Connection} connection
   * @param {!Object=} options
   * @param {?Puppeteer.ChildProcess} process
   * @param {(function():Promise)=} closeCallback
   */
  constructor(connection, options = {}, process, closeCallback) {
    super();
    this._ignoreHTTPSErrors = !!options.ignoreHTTPSErrors;
    this._appMode = !!options.appMode;
    this._process = process;
    this._screenshotTaskQueue = new TaskQueue();
    this._connection = connection;
    this._closeCallback = closeCallback || new Function();
    /** @type {Map<string, Target>} */
    this._targets = new Map();
    this._connection.setClosedCallback(() => {
      this.emit(Browser.Events.Disconnected);
    });
    this._connection.on('Target.targetCreated', this._targetCreated.bind(this));
    this._connection.on('Target.targetDestroyed', this._targetDestroyed.bind(this));
    this._connection.on('Target.targetInfoChanged', this._targetInfoChanged.bind(this));
  }

  /**
   * @return {?Puppeteer.ChildProcess}
   */
  process() {
    return this._process;
  }

  /**
   * @param {!Puppeteer.Connection} connection
   * @param {!Object=} options
   * @param {?Puppeteer.ChildProcess} process
   * @param {function()=} closeCallback
   */
  static async create(connection, options, process, closeCallback) {
    const browser = new Browser(connection, options, process, closeCallback);
    await connection.send('Target.setDiscoverTargets', {discover: true});
    return browser;
  }

  /**
   * @param {{targetInfo: !Target.TargetInfo}} event
   */
  async _targetCreated(event) {
    const target = new Target(this, event.targetInfo);
    console.assert(!this._targets.has(event.targetInfo.targetId), 'Target should not exist before targetCreated');
    this._targets.set(event.targetInfo.targetId, target);

    if (await target._initializedPromise)
      this.emit(Browser.Events.TargetCreated, target);
  }

  /**
   * @param {{targetId: string}} event
   */
  async _targetDestroyed(event) {
    const target = this._targets.get(event.targetId);
    target._initializedCallback(false);
    this._targets.delete(event.targetId);
    if (await target._initializedPromise)
      this.emit(Browser.Events.TargetDestroyed, target);
  }

  /**
   * @param {{targetInfo: !Target.TargetInfo}} event
   */
  _targetInfoChanged(event) {
    const target = this._targets.get(event.targetInfo.targetId);
    console.assert(target, 'target should exist before targetInfoChanged');
    target._targetInfoChanged(event.targetInfo);
  }

  /**
   * @return {string}
   */
  wsEndpoint() {
    return this._connection.url();
  }

  /**
   * @return {!Promise<!Page>}
   */
  async newPage() {
    const {targetId} = await this._connection.send('Target.createTarget', {url: 'about:blank'});
    const target = await this._targets.get(targetId);
    console.assert(await target._initializedPromise, 'Failed to create target for page');
    const page = await target.page();
    return page;
  }

  /**
   * @return {!Array<!Target>}
   */
  targets() {
    return Array.from(this._targets.values()).filter(target => target._isInitialized);
  }

  /**
   * @return {!Promise<!Array<!Page>>}
   */
  async pages() {
    const pages = await Promise.all(this.targets().map(target => target.page()));
    return pages.filter(page => !!page);
  }

  /**
   * @return {!Promise<string>}
   */
  async version() {
    const version = await this._getVersion();
    return version.product;
  }

  /**
   * @return {!Promise<string>}
   */
  async userAgent() {
    const version = await this._getVersion();
    return version.userAgent;
  }

  async close() {
    await this._closeCallback.call(null);
    this.disconnect();
  }

  disconnect() {
    this._connection.dispose();
  }

  /**
   * @return {!Promise<!Object>}
   */
  _getVersion() {
    return this._connection.send('Browser.getVersion');
  }
}

/** @enum {string} */
Browser.Events = {
  TargetCreated: 'targetcreated',
  TargetDestroyed: 'targetdestroyed',
  TargetChanged: 'targetchanged',
  Disconnected: 'disconnected'
};

helper.tracePublicAPI(Browser);

class TaskQueue {
  constructor() {
    this._chain = Promise.resolve();
  }

  /**
   * @param {function()} task
   * @return {!Promise}
   */
  postTask(task) {
    const result = this._chain.then(task);
    this._chain = result.catch(() => {});
    return result;
  }
}

class Target {
  /**
   * @param {!Browser} browser
   * @param {!Target.TargetInfo} targetInfo
   */
  constructor(browser, targetInfo) {
    this._browser = browser;
    this._targetId = targetInfo.targetId;
    this._targetInfo = targetInfo;
    /** @type {?Promise<!Page>} */
    this._pagePromise = null;
    this._initializedPromise = new Promise(fulfill => this._initializedCallback = fulfill);
    this._isInitialized = this._targetInfo.type !== 'page' || this._targetInfo.url !== '';
    if (this._isInitialized)
      this._initializedCallback(true);
  }

  /**
   * @return {!Promise<!Puppeteer.CDPSession>}
   */
  createCDPSession() {
    return this._browser._connection.createSession(this._targetId);
  }

  /**
   * @return {!Promise<?Page>}
   */
  async page() {
    if (this._targetInfo.type === 'page' && !this._pagePromise) {
      this._pagePromise = this._browser._connection.createSession(this._targetId)
          .then(client => Page.create(client, this, this._browser._ignoreHTTPSErrors, this._browser._appMode, this._browser._screenshotTaskQueue));
    }
    return this._pagePromise;
  }

  /**
   * @return {string}
   */
  url() {
    return this._targetInfo.url;
  }

  /**
   * @return {"page"|"service_worker"|"other"}
   */
  type() {
    const type = this._targetInfo.type;
    if (type === 'page' || type === 'service_worker')
      return type;
    return 'other';
  }

  /**
   * @param {!Target.TargetInfo} targetInfo
   */
  _targetInfoChanged(targetInfo) {
    const previousURL = this._targetInfo.url;
    this._targetInfo = targetInfo;

    if (!this._isInitialized && (this._targetInfo.type !== 'page' || this._targetInfo.url !== '')) {
      this._isInitialized = true;
      this._initializedCallback(true);
      return;
    }

    if (previousURL !== targetInfo.url)
      this._browser.emit(Browser.Events.TargetChanged, this);
  }
}
helper.tracePublicAPI(Target);

/**
 * @typedef {Object} Target.TargetInfo
 * @property {string} type
 * @property {string} targetId
 * @property {string} title
 * @property {string} url
 * @property {boolean} attached
 */

module.exports = { Browser, TaskQueue, Target };
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
const {helper} = require('./helper');
const debugProtocol = require('debug')('puppeteer:protocol');
const debugSession = require('debug')('puppeteer:session');

const EventEmitter = require('events');
const WebSocket = require('ws');

class Connection extends EventEmitter {
  /**
   * @param {string} url
   * @param {number=} delay
   * @return {!Promise<!Connection>}
   */
  static async create(url, delay = 0) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { perMessageDeflate: false });
      ws.on('open', () => resolve(new Connection(url, ws, delay)));
      ws.on('error', reject);
    });
  }

  /**
   * @param {string} url
   * @param {!WebSocket} ws
   * @param {number=} delay
   */
  constructor(url, ws, delay = 0) {
    super();
    this._url = url;
    this._lastId = 0;
    /** @type {!Map<number, {resolve: function, reject: function, error: !Error, method: string}>}*/
    this._callbacks = new Map();
    this._delay = delay;

    this._ws = ws;
    this._ws.on('message', this._onMessage.bind(this));
    this._ws.on('close', this._onClose.bind(this));
    /** @type {!Map<string, !CDPSession>}*/
    this._sessions = new Map();
  }

  /**
   * @return {string}
   */
  url() {
    return this._url;
  }

  /**
   * @param {string} method
   * @param {!Object=} params
   * @return {!Promise<?Object>}
   */
  send(method, params = {}) {
    const id = ++this._lastId;
    const message = JSON.stringify({id, method, params});
    debugProtocol('SEND ► ' + message);
    this._ws.send(message);
    return new Promise((resolve, reject) => {
      this._callbacks.set(id, {resolve, reject, error: new Error(), method});
    });
  }

  /**
   * @param {function()} callback
   */
  setClosedCallback(callback) {
    this._closeCallback = callback;
  }

  /**
   * @param {string} message
   */
  async _onMessage(message) {
    if (this._delay)
      await new Promise(f => setTimeout(f, this._delay));
    debugProtocol('◀ RECV ' + message);
    const object = JSON.parse(message);
    if (object.id && this._callbacks.has(object.id)) {
      const callback = this._callbacks.get(object.id);
      this._callbacks.delete(object.id);
      if (object.error)
        callback.reject(rewriteError(callback.error, `Protocol error (${callback.method}): ${object.error.message} ${object.error.data}`));
      else
        callback.resolve(object.result);
    } else {
      console.assert(!object.id);
      if (object.method === 'Target.receivedMessageFromTarget') {
        const session = this._sessions.get(object.params.sessionId);
        if (session)
          session._onMessage(object.params.message);
      } else if (object.method === 'Target.detachedFromTarget') {
        const session = this._sessions.get(object.params.sessionId);
        if (session)
          session._onClosed();
        this._sessions.delete(object.params.sessionId);
      } else {
        this.emit(object.method, object.params);
      }
    }
  }

  _onClose() {
    if (this._closeCallback) {
      this._closeCallback();
      this._closeCallback = null;
    }
    this._ws.removeAllListeners();
    for (const callback of this._callbacks.values())
      callback.reject(rewriteError(callback.error, `Protocol error (${callback.method}): Target closed.`));
    this._callbacks.clear();
    for (const session of this._sessions.values())
      session._onClosed();
    this._sessions.clear();
  }

  dispose() {
    this._onClose();
    this._ws.close();
  }

  /**
   * @param {string} targetId
   * @return {!Promise<!CDPSession>}
   */
  async createSession(targetId) {
    const {sessionId} = await this.send('Target.attachToTarget', {targetId});
    const session = new CDPSession(this, targetId, sessionId);
    this._sessions.set(sessionId, session);
    return session;
  }
}

class CDPSession extends EventEmitter {
  /**
   * @param {!Connection} connection
   * @param {string} targetId
   * @param {string} sessionId
   */
  constructor(connection, targetId, sessionId) {
    super();
    this._lastId = 0;
    /** @type {!Map<number, {resolve: function, reject: function, error: !Error, method: string}>}*/
    this._callbacks = new Map();
    this._connection = connection;
    this._targetId = targetId;
    this._sessionId = sessionId;
  }

  /**
   * @param {string} method
   * @param {!Object=} params
   * @return {!Promise<?Object>}
   */
  send(method, params = {}) {
    if (!this._connection)
      return Promise.reject(new Error(`Protocol error (${method}): Session closed. Most likely the page has been closed.`));
    const id = ++this._lastId;
    const message = JSON.stringify({id, method, params});
    debugSession('SEND ► ' + message);
    this._connection.send('Target.sendMessageToTarget', {sessionId: this._sessionId, message}).catch(e => {
      // The response from target might have been already dispatched.
      if (!this._callbacks.has(id))
        return;
      const callback = this._callbacks.get(id);
      this._callbacks.delete(id);
      callback.reject(rewriteError(callback.error, e && e.message));
    });
    return new Promise((resolve, reject) => {
      this._callbacks.set(id, {resolve, reject, error: new Error(), method});
    });
  }

  /**
   * @param {string} message
   */
  _onMessage(message) {
    debugSession('◀ RECV ' + message);
    const object = JSON.parse(message);
    if (object.id && this._callbacks.has(object.id)) {
      const callback = this._callbacks.get(object.id);
      this._callbacks.delete(object.id);
      if (object.error)
        callback.reject(rewriteError(callback.error, `Protocol error (${callback.method}): ${object.error.message} ${object.error.data}`));
      else
        callback.resolve(object.result);
    } else {
      console.assert(!object.id);
      this.emit(object.method, object.params);
    }
  }

  async detach() {
    await this._connection.send('Target.detachFromTarget',  {sessionId: this._sessionId});
  }

  _onClosed() {
    for (const callback of this._callbacks.values())
      callback.reject(rewriteError(callback.error, `Protocol error (${callback.method}): Target closed.`));
    this._callbacks.clear();
    this._connection = null;
  }
}
helper.tracePublicAPI(CDPSession);

/**
 * @param {!Error} error
 * @param {string} message
 * @return {!Error}
 */
function rewriteError(error, message) {
  error.message = message;
  return error;
}

module.exports = {Connection, CDPSession};
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

const {helper, debugError} = require('./helper');

/**
 * @typedef {Object} CoverageEntry
 * @property {string} url
 * @property {string} text
 * @property {!Array<!{start: number, end: number}>} ranges
 */

class Coverage {
  /**
   * @param {!Puppeteer.CDPSession} client
   */
  constructor(client) {
    this._jsCoverage = new JSCoverage(client);
    this._cssCoverage = new CSSCoverage(client);
  }

  /**
   * @param {!Object} options
   */
  async startJSCoverage(options) {
    return await this._jsCoverage.start(options);
  }

  /**
   * @return {!Promise<!Array<!CoverageEntry>>}
   */
  async stopJSCoverage() {
    return await this._jsCoverage.stop();
  }

  /**
   * @param {!Object} options
   */
  async startCSSCoverage(options) {
    return await this._cssCoverage.start(options);
  }

  /**
   * @return {!Promise<!Array<!CoverageEntry>>}
   */
  async stopCSSCoverage() {
    return await this._cssCoverage.stop();
  }
}

module.exports = {Coverage};
helper.tracePublicAPI(Coverage);

class JSCoverage {
  /**
   * @param {!Puppeteer.CDPSession} client
   */
  constructor(client) {
    this._client = client;
    this._enabled = false;
    this._scriptURLs = new Map();
    this._scriptSources = new Map();
    this._eventListeners = [];
    this._resetOnNavigation = false;
  }

  /**
   * @param {!Object} options
   */
  async start(options = {}) {
    console.assert(!this._enabled, 'JSCoverage is already enabled');
    this._resetOnNavigation = options.resetOnNavigation === undefined ? true : !!options.resetOnNavigation;
    this._enabled = true;
    this._scriptURLs.clear();
    this._scriptSources.clear();
    this._eventListeners = [
      helper.addEventListener(this._client, 'Debugger.scriptParsed', this._onScriptParsed.bind(this)),
      helper.addEventListener(this._client, 'Runtime.executionContextsCleared', this._onExecutionContextsCleared.bind(this)),
    ];
    await Promise.all([
      this._client.send('Profiler.enable'),
      this._client.send('Profiler.startPreciseCoverage', {callCount: false, detailed: true}),
      this._client.send('Debugger.enable'),
      this._client.send('Debugger.setSkipAllPauses', {skip: true})
    ]);
  }

  _onExecutionContextsCleared() {
    if (!this._resetOnNavigation)
      return;
    this._scriptURLs.clear();
    this._scriptSources.clear();
  }

  /**
   * @param {!Object} event
   */
  async _onScriptParsed(event) {
    // Ignore anonymous scripts
    if (!event.url)
      return;
    try {
      const response = await this._client.send('Debugger.getScriptSource', {scriptId: event.scriptId});
      this._scriptURLs.set(event.scriptId, event.url);
      this._scriptSources.set(event.scriptId, response.scriptSource);
    } catch (e) {
      // This might happen if the page has already navigated away.
      debugError(e);
    }
  }

  /**
   * @return {!Promise<!Array<!CoverageEntry>>}
   */
  async stop() {
    console.assert(this._enabled, 'JSCoverage is not enabled');
    this._enabled = false;
    const [profileResponse] = await Promise.all([
      this._client.send('Profiler.takePreciseCoverage'),
      this._client.send('Profiler.stopPreciseCoverage'),
      this._client.send('Profiler.disable'),
      this._client.send('Debugger.disable'),
    ]);
    helper.removeEventListeners(this._eventListeners);

    const coverage = [];
    for (const entry of profileResponse.result) {
      const url = this._scriptURLs.get(entry.scriptId);
      const text = this._scriptSources.get(entry.scriptId);
      if (text === undefined || url === undefined)
        continue;
      const flattenRanges = [];
      for (const func of entry.functions)
        flattenRanges.push(...func.ranges);
      const ranges = convertToDisjointRanges(flattenRanges);
      coverage.push({url, ranges, text});
    }
    return coverage;
  }
}

class CSSCoverage {
  /**
   * @param {!Puppeteer.CDPSession} client
   */
  constructor(client) {
    this._client = client;
    this._enabled = false;
    this._stylesheetURLs = new Map();
    this._stylesheetSources = new Map();
    this._eventListeners = [];
    this._resetOnNavigation = false;
  }

  /**
   * @param {!Object} options
   */
  async start(options = {}) {
    console.assert(!this._enabled, 'CSSCoverage is already enabled');
    this._resetOnNavigation = options.resetOnNavigation === undefined ? true : !!options.resetOnNavigation;
    this._enabled = true;
    this._stylesheetURLs.clear();
    this._stylesheetSources.clear();
    this._eventListeners = [
      helper.addEventListener(this._client, 'CSS.styleSheetAdded', this._onStyleSheet.bind(this)),
      helper.addEventListener(this._client, 'Runtime.executionContextsCleared', this._onExecutionContextsCleared.bind(this)),
    ];
    await Promise.all([
      this._client.send('DOM.enable'),
      this._client.send('CSS.enable'),
      this._client.send('CSS.startRuleUsageTracking'),
    ]);
  }

  _onExecutionContextsCleared() {
    if (!this._resetOnNavigation)
      return;
    this._stylesheetURLs.clear();
    this._stylesheetSources.clear();
  }

  /**
   * @param {!Object} event
   */
  async _onStyleSheet(event) {
    const header = event.header;
    // Ignore anonymous scripts
    if (!header.sourceURL)
      return;
    try {
      const response = await this._client.send('CSS.getStyleSheetText', {styleSheetId: header.styleSheetId});
      this._stylesheetURLs.set(header.styleSheetId, header.sourceURL);
      this._stylesheetSources.set(header.styleSheetId, response.text);
    } catch (e) {
      // This might happen if the page has already navigated away.
      debugError(e);
    }
  }

  /**
   * @return {!Promise<!Array<!CoverageEntry>>}
   */
  async stop() {
    console.assert(this._enabled, 'CSSCoverage is not enabled');
    this._enabled = false;
    const [ruleTrackingResponse] = await Promise.all([
      this._client.send('CSS.stopRuleUsageTracking'),
      this._client.send('CSS.disable'),
      this._client.send('DOM.disable'),
    ]);
    helper.removeEventListeners(this._eventListeners);

    // aggregarte by styleSheetId
    const styleSheetIdToCoverage = new Map();
    for (const entry of ruleTrackingResponse.ruleUsage) {
      let ranges = styleSheetIdToCoverage.get(entry.styleSheetId);
      if (!ranges) {
        ranges = [];
        styleSheetIdToCoverage.set(entry.styleSheetId, ranges);
      }
      ranges.push({
        startOffset: entry.startOffset,
        endOffset: entry.endOffset,
        count: entry.used ? 1 : 0,
      });
    }

    const coverage = [];
    for (const styleSheetId of this._stylesheetURLs.keys()) {
      const url = this._stylesheetURLs.get(styleSheetId);
      const text = this._stylesheetSources.get(styleSheetId);
      const ranges = convertToDisjointRanges(styleSheetIdToCoverage.get(styleSheetId) || []);
      coverage.push({url, ranges, text});
    }

    return coverage;
  }
}

/**
 * @param {!Array<!{startOffset:number, endOffset:number, count:number}>} nestedRanges
 * @return {!Array<!{start:number, end:number}>}
 */
function convertToDisjointRanges(nestedRanges) {
  const points = [];
  for (const range of nestedRanges) {
    points.push({ offset: range.startOffset, type: 0, range });
    points.push({ offset: range.endOffset, type: 1, range });
  }
  // Sort points to form a valid parenthesis sequence.
  points.sort((a, b) => {
    // Sort with increasing offsets.
    if (a.offset !== b.offset)
      return a.offset - b.offset;
    // All "end" points should go before "start" points.
    if (a.type !== b.type)
      return b.type - a.type;
    const aLength = a.range.endOffset - a.range.startOffset;
    const bLength = b.range.endOffset - b.range.startOffset;
    // For two "start" points, the one with longer range goes first.
    if (a.type === 0)
      return bLength - aLength;
    // For two "end" points, the one with shorter range goes first.
    return aLength - bLength;
  });

  const hitCountStack = [];
  const results = [];
  let lastOffset = 0;
  // Run scanning line to intersect all ranges.
  for (const point of points) {
    if (hitCountStack.length && lastOffset < point.offset && hitCountStack[hitCountStack.length - 1] > 0) {
      const lastResult = results.length ? results[results.length - 1] : null;
      if (lastResult && lastResult.end === lastOffset)
        lastResult.end = point.offset;
      else
        results.push({start: lastOffset, end: point.offset});
    }
    lastOffset = point.offset;
    if (point.type === 0)
      hitCountStack.push(point.range.count);
    else
      hitCountStack.pop();
  }
  // Filter out empty ranges.
  return results.filter(range => range.end - range.start > 1);
}

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

const {helper} = require('./helper');

class Dialog {
  /**
   * @param {!Puppeteer.CDPSession} client
   * @param {string} type
   * @param {string} message
   * @param {(string|undefined)} defaultValue
   */
  constructor(client, type, message, defaultValue = '') {
    this._client = client;
    this._type = type;
    this._message = message;
    this._handled = false;
    this._defaultValue = defaultValue;
  }

  /**
   * @return {string}
   */
  type() {
    return this._type;
  }

  /**
   * @return {string}
   */
  message() {
    return this._message;
  }

  /**
   * @return {string}
   */
  defaultValue() {
    return this._defaultValue;
  }

  /**
   * @param {string=} promptText
   */
  async accept(promptText) {
    console.assert(!this._handled, 'Cannot accept dialog which is already handled!');
    this._handled = true;
    await this._client.send('Page.handleJavaScriptDialog', {
      accept: true,
      promptText: promptText
    });
  }

  async dismiss() {
    console.assert(!this._handled, 'Cannot dismiss dialog which is already handled!');
    this._handled = true;
    await this._client.send('Page.handleJavaScriptDialog', {
      accept: false
    });
  }
}

Dialog.Type = {
  Alert: 'alert',
  BeforeUnload: 'beforeunload',
  Confirm: 'confirm',
  Prompt: 'prompt'
};

module.exports = Dialog;
helper.tracePublicAPI(Dialog);
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

const os = require('os');
const fs = require('fs');
const path = require('path');
const extract = require('extract-zip');
const util = require('util');
const URL = require('url');
const removeRecursive = require('rimraf');
// @ts-ignore
const ProxyAgent = require('https-proxy-agent');
// @ts-ignore
const getProxyForUrl = require('proxy-from-env').getProxyForUrl;

const DEFAULT_DOWNLOAD_HOST = 'https://storage.googleapis.com';
const downloadURLs = {
  linux: '%s/chromium-browser-snapshots/Linux_x64/%d/chrome-linux.zip',
  mac: '%s/chromium-browser-snapshots/Mac/%d/chrome-mac.zip',
  win32: '%s/chromium-browser-snapshots/Win/%d/chrome-win32.zip',
  win64: '%s/chromium-browser-snapshots/Win_x64/%d/chrome-win32.zip',
};

// Project root will be different for node6-transpiled code.
const PROJECT_ROOT = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');

class Downloader {
  /**
   * @param {string} downloadsFolder
   */
  constructor(downloadsFolder) {
    this._downloadsFolder = downloadsFolder;
    this._downloadHost = DEFAULT_DOWNLOAD_HOST;
  }

  /**
   * @return {string}
   */
  static defaultRevision() {
    return require(path.join(PROJECT_ROOT, 'package.json')).puppeteer.chromium_revision;
  }

  /**
   * @return {!Downloader}
   */
  static createDefault() {
    const downloadsFolder = path.join(PROJECT_ROOT, '.local-chromium');
    return new Downloader(downloadsFolder);
  }

  /**
   * @param {string} downloadHost
   */
  setDownloadHost(downloadHost) {
    this._downloadHost = downloadHost.replace(/\/+$/, '');
  }

  /**
   * @return {!Array<string>}
   */
  supportedPlatforms() {
    return Object.keys(downloadURLs);
  }

  /**
   * @return {string}
   */
  currentPlatform() {
    const platform = os.platform();
    if (platform === 'darwin')
      return 'mac';
    if (platform === 'linux')
      return 'linux';
    if (platform === 'win32')
      return os.arch() === 'x64' ? 'win64' : 'win32';
    return '';
  }

  /**
   * @param {string} platform
   * @param {string} revision
   * @return {!Promise<boolean>}
   */
  canDownloadRevision(platform, revision) {
    console.assert(downloadURLs[platform], 'Unknown platform: ' + platform);

    const url = util.format(downloadURLs[platform], this._downloadHost, revision);

    let resolve;
    const promise = new Promise(x => resolve = x);
    const request = httpRequest(url, 'HEAD', response => {
      resolve(response.statusCode === 200);
    });
    request.on('error', error => {
      console.error(error);
      resolve(false);
    });
    return promise;
  }

  /**
   * @param {string} platform
   * @param {string} revision
   * @param {?function(number, number)} progressCallback
   * @return {!Promise}
   */
  downloadRevision(platform, revision, progressCallback) {
    let url = downloadURLs[platform];
    console.assert(url, `Unsupported platform: ${platform}`);
    url = util.format(url, this._downloadHost, revision);
    const zipPath = path.join(this._downloadsFolder, `download-${platform}-${revision}.zip`);
    const folderPath = this._getFolderPath(platform, revision);
    if (fs.existsSync(folderPath))
      return;
    if (!fs.existsSync(this._downloadsFolder))
      fs.mkdirSync(this._downloadsFolder);
    return downloadFile(url, zipPath, progressCallback)
        .then(() => extractZip(zipPath, folderPath))
        .catch(err => err)
        .then(err => {
          if (fs.existsSync(zipPath))
            fs.unlinkSync(zipPath);
          if (err)
            throw err;
        });
  }

  /**
   * @return {!Array<!{platform:string, revision: string}>}
   */
  downloadedRevisions() {
    if (!fs.existsSync(this._downloadsFolder))
      return [];
    const fileNames = fs.readdirSync(this._downloadsFolder);
    return fileNames.map(fileName => parseFolderPath(fileName)).filter(revision => !!revision);
  }

  /**
   * @param {string} platform
   * @param {string} revision
   * @return {!Promise}
   */
  removeRevision(platform, revision) {
    console.assert(downloadURLs[platform], `Unsupported platform: ${platform}`);
    const folderPath = this._getFolderPath(platform, revision);
    console.assert(fs.existsSync(folderPath));
    return new Promise(fulfill => removeRecursive(folderPath, fulfill));
  }

  /**
   * @param {string} platform
   * @param {string} revision
   * @return {!{revision: string, folderPath: string, executablePath: string, downloaded: boolean}}
   */
  revisionInfo(platform, revision) {
    console.assert(downloadURLs[platform], `Unsupported platform: ${platform}`);
    const folderPath = this._getFolderPath(platform, revision);
    let executablePath = '';
    if (platform === 'mac')
      executablePath = path.join(folderPath, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
    else if (platform === 'linux')
      executablePath = path.join(folderPath, 'chrome-linux', 'chrome');
    else if (platform === 'win32' || platform === 'win64')
      executablePath = path.join(folderPath, 'chrome-win32', 'chrome.exe');
    else
      throw 'Unsupported platform: ' + platform;
    return {
      revision,
      executablePath,
      folderPath,
      downloaded: fs.existsSync(folderPath)
    };
  }

  /**
   * @param {string} platform
   * @param {string} revision
   * @return {string}
   */
  _getFolderPath(platform, revision) {
    return path.join(this._downloadsFolder, platform + '-' + revision);
  }
}

module.exports = Downloader;

/**
 * @param {string} folderPath
 * @return {?{platform: string, revision: string}}
 */
function parseFolderPath(folderPath) {
  const name = path.basename(folderPath);
  const splits = name.split('-');
  if (splits.length !== 2)
    return null;
  const [platform, revision] = splits;
  if (!downloadURLs[platform])
    return null;
  return {platform, revision};
}

/**
 * @param {string} url
 * @param {string} destinationPath
 * @param {?function(number, number)} progressCallback
 * @return {!Promise}
 */
function downloadFile(url, destinationPath, progressCallback) {
  let fulfill, reject;

  const promise = new Promise((x, y) => { fulfill = x; reject = y; });

  const request = httpRequest(url, 'GET', response => {
    if (response.statusCode !== 200) {
      const error = new Error(`Download failed: server returned code ${response.statusCode}. URL: ${url}`);
      // consume response data to free up memory
      response.resume();
      reject(error);
      return;
    }
    const file = fs.createWriteStream(destinationPath);
    file.on('finish', () => fulfill());
    file.on('error', error => reject(error));
    response.pipe(file);
    const totalBytes = parseInt(/** @type {string} */ (response.headers['content-length']), 10);
    if (progressCallback)
      response.on('data', onData.bind(null, totalBytes));
  });
  request.on('error', error => reject(error));
  return promise;

  function onData(totalBytes, chunk) {
    progressCallback(totalBytes, chunk.length);
  }
}

/**
 * @param {string} zipPath
 * @param {string} folderPath
 * @return {!Promise<?Error>}
 */
function extractZip(zipPath, folderPath) {
  return new Promise(fulfill => extract(zipPath, {dir: folderPath}, fulfill));
}

function httpRequest(url, method, response) {
  /** @type {Object} */
  const options = URL.parse(url);
  options.method = method;

  const proxyURL = getProxyForUrl(url);
  if (proxyURL) {
    /** @type {Object} */
    const parsedProxyURL = URL.parse(proxyURL);
    parsedProxyURL.secureProxy = parsedProxyURL.protocol === 'https:';

    options.agent = new ProxyAgent(parsedProxyURL);
    options.rejectUnauthorized = false;
  }

  const driver = options.protocol === 'https:' ? 'https' : 'http';
  const request = require(driver).request(options, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
      httpRequest(res.headers.location, method, response);
    else
      response(res);
  });
  request.end();
  return request;
}
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
const path = require('path');
const {JSHandle} = require('./ExecutionContext');
const {helper, debugError} = require('./helper');

class ElementHandle extends JSHandle {
  /**
   * @param {!Puppeteer.ExecutionContext} context
   * @param {!Puppeteer.CDPSession} client
   * @param {!Object} remoteObject
   * @param {!Puppeteer.Page} page
   */
  constructor(context, client, remoteObject, page) {
    super(context, client, remoteObject);
    this._client = client;
    this._remoteObject = remoteObject;
    this._page = page;
    this._disposed = false;
  }

  /**
   * @override
   * @return {?ElementHandle}
   */
  asElement() {
    return this;
  }

  async _scrollIntoViewIfNeeded() {
    const error = await this.executionContext().evaluate(element => {
      if (!element.isConnected)
        return 'Node is detached from document';
      if (element.nodeType !== Node.ELEMENT_NODE)
        return 'Node is not of type HTMLElement';
      element.scrollIntoViewIfNeeded();
      return false;
    }, this);
    if (error)
      throw new Error(error);
  }

  /**
   * @return {!Promise<{x: number, y: number}>}
   */
  async _visibleCenter() {
    await this._scrollIntoViewIfNeeded();
    const box = await this.boundingBox();
    if (!box)
      throw new Error('Node is not visible');
    return {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2
    };
  }

  async hover() {
    const {x, y} = await this._visibleCenter();
    await this._page.mouse.move(x, y);
  }

  /**
   * @param {!Object=} options
   */
  async click(options = {}) {
    const {x, y} = await this._visibleCenter();
    await this._page.mouse.click(x, y, options);
  }

  /**
   * @param {!Array<string>} filePaths
   * @return {!Promise}
   */
  async uploadFile(...filePaths) {
    const files = filePaths.map(filePath => path.resolve(filePath));
    const objectId = this._remoteObject.objectId;
    return this._client.send('DOM.setFileInputFiles', { objectId, files });
  }

  async tap() {
    const {x, y} = await this._visibleCenter();
    await this._page.touchscreen.tap(x, y);
  }

  async focus() {
    await this.executionContext().evaluate(element => element.focus(), this);
  }

  /**
   * @param {string} text
   * @param {{delay: (number|undefined)}=} options
   */
  async type(text, options) {
    await this.focus();
    await this._page.keyboard.type(text, options);
  }

  /**
   * @param {string} key
   * @param {!Object=} options
   */
  async press(key, options) {
    await this.focus();
    await this._page.keyboard.press(key, options);
  }

  /**
   * @return {!Promise<?{x: number, y: number, width: number, height: number}>}
   */
  async boundingBox() {
    const result = await this._client.send('DOM.getBoxModel', {
      objectId: this._remoteObject.objectId
    }).catch(error => void debugError(error));

    if (!result)
      return null;

    const quad = result.model.border;
    const x = Math.min(quad[0], quad[2], quad[4], quad[6]);
    const y = Math.min(quad[1], quad[3], quad[5], quad[7]);
    const width = Math.max(quad[0], quad[2], quad[4], quad[6]) - x;
    const height = Math.max(quad[1], quad[3], quad[5], quad[7]) - y;

    return {x, y, width, height};
  }

  /**
   *
   * @param {!Object=} options
   * @returns {!Promise<Object>}
   */
  async screenshot(options = {}) {
    await this._scrollIntoViewIfNeeded();
    const { layoutViewport: { pageX, pageY } } = await this._client.send('Page.getLayoutMetrics');

    const boundingBox = await this.boundingBox();
    if (!boundingBox)
      throw new Error('Node is not visible');
    const clip = Object.assign({}, boundingBox);
    clip.x += pageX;
    clip.y += pageY;
    return await this._page.screenshot(Object.assign({}, {
      clip
    }, options));
  }

  /**
   * @param {string} selector
   * @return {!Promise<?ElementHandle>}
   */
  async $(selector) {
    const handle = await this.executionContext().evaluateHandle(
        (element, selector) => element.querySelector(selector),
        this, selector
    );
    const element = handle.asElement();
    if (element)
      return element;
    await handle.dispose();
    return null;
  }

  /**
   * @param {string} selector
   * @return {!Promise<!Array<!ElementHandle>>}
   */
  async $$(selector) {
    const arrayHandle = await this.executionContext().evaluateHandle(
        (element, selector) => element.querySelectorAll(selector),
        this, selector
    );
    const properties = await arrayHandle.getProperties();
    await arrayHandle.dispose();
    const result = [];
    for (const property of properties.values()) {
      const elementHandle = property.asElement();
      if (elementHandle)
        result.push(elementHandle);
    }
    return result;
  }

  /**
   * @param {string} expression
   * @return {!Promise<!Array<!ElementHandle>>}
   */
  async $x(expression) {
    const arrayHandle = await this.executionContext().evaluateHandle(
        (element, expression) => {
          const document = element.ownerDocument || element;
          const iterator = document.evaluate(expression, element, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE);
          const array = [];
          let item;
          while ((item = iterator.iterateNext()))
            array.push(item);
          return array;
        },
        this, expression
    );
    const properties = await arrayHandle.getProperties();
    await arrayHandle.dispose();
    const result = [];
    for (const property of properties.values()) {
      const elementHandle = property.asElement();
      if (elementHandle)
        result.push(elementHandle);
    }
    return result;
  }
}

module.exports = ElementHandle;
helper.tracePublicAPI(ElementHandle);
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

class EmulationManager {
  /**
   * @param {!Puppeteer.CDPSession} client
   */
  constructor(client) {
    this._client = client;
    this._emulatingMobile = false;
    this._injectedTouchScriptId = null;
  }

  /**
   * @param {!EmulationManager.Viewport} viewport
   * @return {Promise<boolean>}
   */
  async emulateViewport(client, viewport) {
    const mobile = viewport.isMobile || false;
    const width = viewport.width;
    const height = viewport.height;
    const deviceScaleFactor = viewport.deviceScaleFactor || 1;
    const screenOrientation = viewport.isLandscape ? { angle: 90, type: 'landscapePrimary' } : { angle: 0, type: 'portraitPrimary' };

    await Promise.all([
      this._client.send('Emulation.setDeviceMetricsOverride', { mobile, width, height, deviceScaleFactor, screenOrientation }),
      this._client.send('Emulation.setTouchEmulationEnabled', {
        enabled: viewport.hasTouch || false,
        configuration: viewport.isMobile ? 'mobile' : 'desktop'
      })
    ]);

    let reloadNeeded = false;
    if (viewport.hasTouch && !this._injectedTouchScriptId) {
      const source = `(${injectedTouchEventsFunction})()`;
      this._injectedTouchScriptId = (await this._client.send('Page.addScriptToEvaluateOnNewDocument', { source })).identifier;
      reloadNeeded = true;
    } else if (!viewport.hasTouch && this._injectedTouchScriptId) {
      await this._client.send('Page.removeScriptToEvaluateOnNewDocument', {identifier: this._injectedTouchScriptId});
      this._injectedTouchScriptId = null;
      reloadNeeded = true;
    }

    if (this._emulatingMobile !== mobile)
      reloadNeeded = true;
    this._emulatingMobile = mobile;
    return reloadNeeded;

    function injectedTouchEventsFunction() {
      const touchEvents = ['ontouchstart', 'ontouchend', 'ontouchmove', 'ontouchcancel'];
      // @ts-ignore
      const recepients = [window.__proto__, document.__proto__];
      for (let i = 0; i < touchEvents.length; ++i) {
        for (let j = 0; j < recepients.length; ++j) {
          if (!(touchEvents[i] in recepients[j])) {
            Object.defineProperty(recepients[j], touchEvents[i], {
              value: null, writable: true, configurable: true, enumerable: true
            });
          }
        }
      }
    }
  }
}

/**
 * @typedef {Object} EmulationManager.Viewport
 * @property {number} width
 * @property {number} height
 * @property {number=} deviceScaleFactor
 * @property {boolean=} isMobile
 * @property {boolean=} isLandscape
 * @property {boolean=} hasTouch
 */

module.exports = EmulationManager;
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

const {helper} = require('./helper');

class ExecutionContext {
  /**
   * @param {!Puppeteer.CDPSession} client
   * @param {!Object} contextPayload
   * @param {function(*):!JSHandle} objectHandleFactory
   */
  constructor(client, contextPayload, objectHandleFactory) {
    this._client = client;
    this._contextId = contextPayload.id;

    const auxData = contextPayload.auxData || {isDefault: true};
    this._frameId = auxData.frameId || null;
    this._isDefault = !!auxData.isDefault;
    this._objectHandleFactory = objectHandleFactory;
  }

  /**
   * @param {Function|string} pageFunction
   * @param {...*} args
   * @return {!Promise<(!Object|undefined)>}
   */
  async evaluate(pageFunction, ...args) {
    const handle = await this.evaluateHandle(pageFunction, ...args);
    const result = await handle.jsonValue().catch(error => undefined);
    await handle.dispose();
    return result;
  }

  /**
   * @param {Function|string} pageFunction
   * @param {...*} args
   * @return {!Promise<!JSHandle>}
   */
  async evaluateHandle(pageFunction, ...args) {
    if (helper.isString(pageFunction)) {
      const contextId = this._contextId;
      const expression = pageFunction;
      const { exceptionDetails, result: remoteObject } = await this._client.send('Runtime.evaluate', { expression, contextId, returnByValue: false, awaitPromise: true});
      if (exceptionDetails)
        throw new Error('Evaluation failed: ' + helper.getExceptionMessage(exceptionDetails));
      return this._objectHandleFactory(remoteObject);
    }

    const { exceptionDetails, result: remoteObject } = await this._client.send('Runtime.callFunctionOn', {
      functionDeclaration: pageFunction.toString(),
      executionContextId: this._contextId,
      arguments: args.map(convertArgument.bind(this)),
      returnByValue: false,
      awaitPromise: true
    });
    if (exceptionDetails)
      throw new Error('Evaluation failed: ' + helper.getExceptionMessage(exceptionDetails));
    return this._objectHandleFactory(remoteObject);

    /**
     * @param {*} arg
     * @return {*}
     * @this {Frame}
     */
    function convertArgument(arg) {
      if (Object.is(arg, -0))
        return { unserializableValue: '-0' };
      if (Object.is(arg, Infinity))
        return { unserializableValue: 'Infinity' };
      if (Object.is(arg, -Infinity))
        return { unserializableValue: '-Infinity' };
      if (Object.is(arg, NaN))
        return { unserializableValue: 'NaN' };
      const objectHandle = arg && (arg instanceof JSHandle) ? arg : null;
      if (objectHandle) {
        if (objectHandle._context !== this)
          throw new Error('JSHandles can be evaluated only in the context they were created!');
        if (objectHandle._disposed)
          throw new Error('JSHandle is disposed!');
        if (objectHandle._remoteObject.unserializableValue)
          return { unserializableValue: objectHandle._remoteObject.unserializableValue };
        if (!objectHandle._remoteObject.objectId)
          return { value: objectHandle._remoteObject.value };
        return { objectId: objectHandle._remoteObject.objectId };
      }
      return { value: arg };
    }
  }

  /**
   * @param {!JSHandle} prototypeHandle
   * @return {!Promise<!JSHandle>}
   */
  async queryObjects(prototypeHandle) {
    console.assert(!prototypeHandle._disposed, 'Prototype JSHandle is disposed!');
    console.assert(prototypeHandle._remoteObject.objectId, 'Prototype JSHandle must not be referencing primitive value');
    const response = await this._client.send('Runtime.queryObjects', {
      prototypeObjectId: prototypeHandle._remoteObject.objectId
    });
    return this._objectHandleFactory(response.objects);
  }
}

class JSHandle {
  /**
   * @param {!ExecutionContext} context
   * @param {!Puppeteer.CDPSession} client
   * @param {!Object} remoteObject
   */
  constructor(context, client, remoteObject) {
    this._context = context;
    this._client = client;
    this._remoteObject = remoteObject;
    this._disposed = false;
  }

  /**
   * @return {!ExecutionContext}
   */
  executionContext() {
    return this._context;
  }

  /**
   * @param {string} propertyName
   * @return {!Promise<?JSHandle>}
   */
  async getProperty(propertyName) {
    const objectHandle = await this._context.evaluateHandle((object, propertyName) => {
      const result = {__proto__: null};
      result[propertyName] = object[propertyName];
      return result;
    }, this, propertyName);
    const properties = await objectHandle.getProperties();
    const result = properties.get(propertyName) || null;
    await objectHandle.dispose();
    return result;
  }

  /**
   * @return {!Promise<Map<string, !JSHandle>>}
   */
  async getProperties() {
    const response = await this._client.send('Runtime.getProperties', {
      objectId: this._remoteObject.objectId,
      ownProperties: true
    });
    const result = new Map();
    for (const property of response.result) {
      if (!property.enumerable)
        continue;
      result.set(property.name, this._context._objectHandleFactory(property.value));
    }
    return result;
  }

  /**
   * @return {!Promise<?Object>}
   */
  async jsonValue() {
    if (this._remoteObject.objectId) {
      const response = await this._client.send('Runtime.callFunctionOn', {
        functionDeclaration: 'function() { return this; }',
        objectId: this._remoteObject.objectId,
        returnByValue: true,
        awaitPromise: true,
      });
      return helper.valueFromRemoteObject(response.result);
    }
    return helper.valueFromRemoteObject(this._remoteObject);
  }

  /**
   * @return {?Puppeteer.ElementHandle}
   */
  asElement() {
    return null;
  }

  async dispose() {
    if (this._disposed)
      return;
    this._disposed = true;
    await helper.releaseObject(this._client, this._remoteObject);
  }

  /**
   * @override
   * @return {string}
   */
  toString() {
    if (this._remoteObject.objectId) {
      const type =  this._remoteObject.subtype || this._remoteObject.type;
      return 'JSHandle@' + type;
    }
    return 'JSHandle:' + helper.valueFromRemoteObject(this._remoteObject);
  }
}

helper.tracePublicAPI(JSHandle);
module.exports = {ExecutionContext, JSHandle};
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

const fs = require('fs');
const EventEmitter = require('events');
const {helper} = require('./helper');
const {ExecutionContext, JSHandle} = require('./ExecutionContext');
const ElementHandle = require('./ElementHandle');

const readFileAsync = helper.promisify(fs.readFile);

class FrameManager extends EventEmitter {
  /**
   * @param {!Puppeteer.CDPSession} client
   * @param {{frame: Object, childFrames: ?Array}} frameTree
   * @param {!Puppeteer.Page} page
   */
  constructor(client, frameTree, page) {
    super();
    this._client = client;
    this._page = page;
    /** @type {!Map<string, !Frame>} */
    this._frames = new Map();
    /** @type {!Map<string, !ExecutionContext>} */
    this._contextIdToContext = new Map();

    this._client.on('Page.frameAttached', event => this._onFrameAttached(event.frameId, event.parentFrameId));
    this._client.on('Page.frameNavigated', event => this._onFrameNavigated(event.frame));
    this._client.on('Page.frameDetached', event => this._onFrameDetached(event.frameId));
    this._client.on('Runtime.executionContextCreated', event => this._onExecutionContextCreated(event.context));
    this._client.on('Runtime.executionContextDestroyed', event => this._onExecutionContextDestroyed(event.executionContextId));
    this._client.on('Runtime.executionContextsCleared', event => this._onExecutionContextsCleared());
    this._client.on('Page.lifecycleEvent', event => this._onLifecycleEvent(event));

    this._handleFrameTree(frameTree);
  }

  /**
   * @param {!Object} event
   */
  _onLifecycleEvent(event) {
    const frame = this._frames.get(event.frameId);
    if (!frame)
      return;
    frame._onLifecycleEvent(event.loaderId, event.name);
    this.emit(FrameManager.Events.LifecycleEvent, frame);
  }

  /**
   * @param {{frame: Object, childFrames: ?Array}} frameTree
   */
  _handleFrameTree(frameTree) {
    if (frameTree.frame.parentId)
      this._onFrameAttached(frameTree.frame.id, frameTree.frame.parentId);
    this._onFrameNavigated(frameTree.frame);
    if (!frameTree.childFrames)
      return;

    for (const child of frameTree.childFrames)
      this._handleFrameTree(child);
  }

  /**
   * @return {!Frame}
   */
  mainFrame() {
    return this._mainFrame;
  }

  /**
   * @return {!Array<!Frame>}
   */
  frames() {
    return Array.from(this._frames.values());
  }

  /**
   * @param {!string} frameId
   * @return {?Frame}
   */
  frame(frameId) {
    return this._frames.get(frameId) || null;
  }

  /**
   * @param {string} frameId
   * @param {?string} parentFrameId
   * @return {?Frame}
   */
  _onFrameAttached(frameId, parentFrameId) {
    if (this._frames.has(frameId))
      return;
    console.assert(parentFrameId);
    const parentFrame = this._frames.get(parentFrameId);
    const frame = new Frame(this._client, this._page, parentFrame, frameId);
    this._frames.set(frame._id, frame);
    this.emit(FrameManager.Events.FrameAttached, frame);
  }

  /**
   * @param {!Object} framePayload
   */
  _onFrameNavigated(framePayload) {
    const isMainFrame = !framePayload.parentId;
    let frame = isMainFrame ? this._mainFrame : this._frames.get(framePayload.id);
    console.assert(isMainFrame || frame, 'We either navigate top level or have old version of the navigated frame');

    // Detach all child frames first.
    if (frame) {
      for (const child of frame.childFrames())
        this._removeFramesRecursively(child);
    }

    // Update or create main frame.
    if (isMainFrame) {
      if (frame) {
        // Update frame id to retain frame identity on cross-process navigation.
        this._frames.delete(frame._id);
        frame._id = framePayload.id;
      } else {
        // Initial main frame navigation.
        frame = new Frame(this._client, this._page, null, framePayload.id);
      }
      this._frames.set(framePayload.id, frame);
      this._mainFrame = frame;
    }

    // Update frame payload.
    frame._navigated(framePayload);

    this.emit(FrameManager.Events.FrameNavigated, frame);
  }

  /**
   * @param {string} frameId
   */
  _onFrameDetached(frameId) {
    const frame = this._frames.get(frameId);
    if (frame)
      this._removeFramesRecursively(frame);
  }

  _onExecutionContextCreated(contextPayload) {
    const context = new ExecutionContext(this._client, contextPayload, this.createJSHandle.bind(this, contextPayload.id));
    this._contextIdToContext.set(contextPayload.id, context);

    const frame = context._frameId ? this._frames.get(context._frameId) : null;
    if (frame && context._isDefault)
      frame._setDefaultContext(context);
  }

  /**
   * @param {!ExecutionContext} context
   */
  _removeContext(context) {
    const frame = context._frameId ? this._frames.get(context._frameId) : null;
    if (frame && context._isDefault)
      frame._setDefaultContext(null);
  }

  /**
   * @param {string} executionContextId
   */
  _onExecutionContextDestroyed(executionContextId) {
    const context = this._contextIdToContext.get(executionContextId);
    if (!context)
      return;
    this._contextIdToContext.delete(executionContextId);
    this._removeContext(context);
  }

  _onExecutionContextsCleared() {
    for (const context of this._contextIdToContext.values())
      this._removeContext(context);
    this._contextIdToContext.clear();
  }

  /**
   * @param {string} contextId
   * @param {*} remoteObject
   * @return {!JSHandle}
   */
  createJSHandle(contextId, remoteObject) {
    const context = this._contextIdToContext.get(contextId);
    console.assert(context, 'INTERNAL ERROR: missing context with id = ' + contextId);
    if (remoteObject.subtype === 'node')
      return new ElementHandle(context, this._client, remoteObject, this._page);
    return new JSHandle(context, this._client, remoteObject);
  }

  /**
   * @param {!Frame} frame
   */
  _removeFramesRecursively(frame) {
    for (const child of frame.childFrames())
      this._removeFramesRecursively(child);
    frame._detach();
    this._frames.delete(frame._id);
    this.emit(FrameManager.Events.FrameDetached, frame);
  }
}

/** @enum {string} */
FrameManager.Events = {
  FrameAttached: 'frameattached',
  FrameNavigated: 'framenavigated',
  FrameDetached: 'framedetached',
  LifecycleEvent: 'lifecycleevent'
};

/**
 * @unrestricted
 */
class Frame {
  /**
   * @param {!Puppeteer.CDPSession} client
   * @param {?Frame} parentFrame
   * @param {string} frameId
   */
  constructor(client, page, parentFrame, frameId) {
    this._client = client;
    this._page = page;
    this._parentFrame = parentFrame;
    this._url = '';
    this._id = frameId;

    /** @type {?Promise<!ElementHandle>} */
    this._documentPromise = null;
    /** @type {?Promise<!ExecutionContext>} */
    this._contextPromise = null;
    this._contextResolveCallback = null;
    this._setDefaultContext(null);

    /** @type {!Set<!WaitTask>} */
    this._waitTasks = new Set();
    this._loaderId = '';
    /** @type {!Set<string>} */
    this._lifecycleEvents = new Set();

    /** @type {!Set<!Frame>} */
    this._childFrames = new Set();
    if (this._parentFrame)
      this._parentFrame._childFrames.add(this);
  }

  /**
   * @param {?ExecutionContext} context
   */
  _setDefaultContext(context) {
    if (context) {
      this._contextResolveCallback.call(null, context);
      this._contextResolveCallback = null;
      for (const waitTask of this._waitTasks)
        waitTask.rerun();
    } else {
      this._documentPromise = null;
      this._contextPromise = new Promise(fulfill => {
        this._contextResolveCallback = fulfill;
      });
    }
  }

  /**
   * @return {!Promise<!ExecutionContext>}
   */
  executionContext() {
    return this._contextPromise;
  }

  /**
   * @param {function()|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<!Puppeteer.JSHandle>}
   */
  async evaluateHandle(pageFunction, ...args) {
    const context = await this._contextPromise;
    return context.evaluateHandle(pageFunction, ...args);
  }

  /**
   * @param {Function|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<*>}
   */
  async evaluate(pageFunction, ...args) {
    const context = await this._contextPromise;
    return context.evaluate(pageFunction, ...args);
  }

  /**
   * @param {string} selector
   * @return {!Promise<?ElementHandle>}
   */
  async $(selector) {
    const document = await this._document();
    const value = await document.$(selector);
    return value;
  }

  /**
   * @return {!Promise<!ElementHandle>}
   */
  async _document() {
    if (this._documentPromise)
      return this._documentPromise;
    this._documentPromise = this._contextPromise.then(async context => {
      const document = await context.evaluateHandle('document');
      return document.asElement();
    });
    return this._documentPromise;
  }

  /**
   * @param {string} expression
   * @return {!Promise<!Array<!ElementHandle>>}
   */
  async $x(expression) {
    const document = await this._document();
    const value = await document.$x(expression);
    return value;
  }

  /**
   * @param {string} selector
   * @param {Function|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<(!Object|undefined)>}
   */
  async $eval(selector, pageFunction, ...args) {
    const elementHandle = await this.$(selector);
    if (!elementHandle)
      throw new Error(`Error: failed to find element matching selector "${selector}"`);
    const result = await this.evaluate(pageFunction, elementHandle, ...args);
    await elementHandle.dispose();
    return result;
  }

  /**
   * @param {string} selector
   * @param {Function|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<(!Object|undefined)>}
   */
  async $$eval(selector, pageFunction, ...args) {
    const context = await this._contextPromise;
    const arrayHandle = await context.evaluateHandle(selector => Array.from(document.querySelectorAll(selector)), selector);
    const result = await this.evaluate(pageFunction, arrayHandle, ...args);
    await arrayHandle.dispose();
    return result;
  }

  /**
   * @param {string} selector
   * @return {!Promise<!Array<!ElementHandle>>}
   */
  async $$(selector) {
    const document = await this._document();
    const value = await document.$$(selector);
    return value;
  }

  /**
   * @return {!Promise<String>}
   */
  async content() {
    return await this.evaluate(() => {
      let retVal = '';
      if (document.doctype)
        retVal = new XMLSerializer().serializeToString(document.doctype);
      if (document.documentElement)
        retVal += document.documentElement.outerHTML;
      return retVal;
    });
  }

  /**
   * @param {string} html
   */
  async setContent(html) {
    await this.evaluate(html => {
      document.open();
      document.write(html);
      document.close();
    }, html);
  }

  /**
   * @return {string}
   */
  name() {
    return this._name || '';
  }

  /**
   * @return {string}
   */
  url() {
    return this._url;
  }

  /**
   * @return {?Frame}
   */
  parentFrame() {
    return this._parentFrame;
  }

  /**
   * @return {!Array.<!Frame>}
   */
  childFrames() {
    return Array.from(this._childFrames);
  }

  /**
   * @return {boolean}
   */
  isDetached() {
    return this._detached;
  }

  /**
   * @param {Object} options
   * @return {!Promise<!ElementHandle>}
   */
  async addScriptTag(options) {
    if (typeof options.url === 'string') {
      const url = options.url;
      try {
        const context = await this._contextPromise;
        return (await context.evaluateHandle(addScriptUrl, url)).asElement();
      } catch (error) {
        throw new Error(`Loading script from ${url} failed`);
      }
    }

    if (typeof options.path === 'string') {
      let contents = await readFileAsync(options.path, 'utf8');
      contents += '//# sourceURL=' + options.path.replace(/\n/g, '');
      const context = await this._contextPromise;
      return (await context.evaluateHandle(addScriptContent, contents)).asElement();
    }

    if (typeof options.content === 'string') {
      const context = await this._contextPromise;
      return (await context.evaluateHandle(addScriptContent, options.content)).asElement();
    }

    throw new Error('Provide an object with a `url`, `path` or `content` property');

    /**
     * @param {string} url
     * @return {!Promise<!HTMLElement>}
     */
    async function addScriptUrl(url) {
      const script = document.createElement('script');
      script.src = url;
      document.head.appendChild(script);
      await new Promise((res, rej) => {
        script.onload = res;
        script.onerror = rej;
      });
      return script;
    }

    /**
     * @param {string} content
     * @return {!HTMLElement}
     */
    function addScriptContent(content) {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.text = content;
      document.head.appendChild(script);
      return script;
    }
  }

  /**
   * @param {Object} options
   * @return {!Promise<!ElementHandle>}
   */
  async addStyleTag(options) {
    if (typeof options.url === 'string') {
      const url = options.url;
      try {
        const context = await this._contextPromise;
        return (await context.evaluateHandle(addStyleUrl, url)).asElement();
      } catch (error) {
        throw new Error(`Loading style from ${url} failed`);
      }
    }

    if (typeof options.path === 'string') {
      let contents = await readFileAsync(options.path, 'utf8');
      contents += '/*# sourceURL=' + options.path.replace(/\n/g, '') + '*/';
      const context = await this._contextPromise;
      return (await context.evaluateHandle(addStyleContent, contents)).asElement();
    }

    if (typeof options.content === 'string') {
      const context = await this._contextPromise;
      return (await context.evaluateHandle(addStyleContent, options.content)).asElement();
    }

    throw new Error('Provide an object with a `url`, `path` or `content` property');

    /**
     * @param {string} url
     * @return {!Promise<!HTMLElement>}
     */
    async function addStyleUrl(url) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      document.head.appendChild(link);
      await new Promise((res, rej) => {
        link.onload = res;
        link.onerror = rej;
      });
      return link;
    }

    /**
     * @param {string} content
     * @return {!HTMLElement}
     */
    function addStyleContent(content) {
      const style = document.createElement('style');
      style.type = 'text/css';
      style.appendChild(document.createTextNode(content));
      document.head.appendChild(style);
      return style;
    }
  }

  /**
  * @param {string} selector
  * @param {!Array<string>} values
  * @return {!Promise<!Array<string>>}
  */
  select(selector, ...values){
    for (const value of values)
      console.assert(helper.isString(value), 'Values must be strings. Found value "' + value + '" of type "' + (typeof value) + '"');
    return this.$eval(selector, (element, values) => {
      if (element.nodeName.toLowerCase() !== 'select')
        throw new Error('Element is not a <select> element.');

      const options = Array.from(element.options);
      element.value = undefined;
      for (const option of options) {
        option.selected = values.includes(option.value);
        if (option.selected && !element.multiple)
          break;
      }
      element.dispatchEvent(new Event('input', { 'bubbles': true }));
      element.dispatchEvent(new Event('change', { 'bubbles': true }));
      return options.filter(option => option.selected).map(option => option.value);
    }, values);
  }

  /**
   * @param {(string|number|Function)} selectorOrFunctionOrTimeout
   * @param {!Object=} options
   * @param {!Array<*>} args
   * @return {!Promise}
   */
  waitFor(selectorOrFunctionOrTimeout, options = {}, ...args) {
    const xPathPattern = '//';

    if (helper.isString(selectorOrFunctionOrTimeout)) {
      const string = /** @type {string} */ (selectorOrFunctionOrTimeout);
      if (string.startsWith(xPathPattern))
        return this.waitForXPath(string, options);
      return this.waitForSelector(string, options);
    }
    if (helper.isNumber(selectorOrFunctionOrTimeout))
      return new Promise(fulfill => setTimeout(fulfill, selectorOrFunctionOrTimeout));
    if (typeof selectorOrFunctionOrTimeout === 'function')
      return this.waitForFunction(selectorOrFunctionOrTimeout, options, ...args);
    return Promise.reject(new Error('Unsupported target type: ' + (typeof selectorOrFunctionOrTimeout)));
  }

  /**
   * @param {string} selector
   * @param {!Object=} options
   * @return {!Promise}
   */
  waitForSelector(selector, options = {}) {
    return this._waitForSelectorOrXPath(selector, false, options);
  }

  /**
   * @param {string} xpath
   * @param {!Object=} options
   * @return {!Promise}
   */
  waitForXPath(xpath, options = {}) {
    return this._waitForSelectorOrXPath(xpath, true, options);
  }

  /**
   * @param {Function|string} pageFunction
   * @param {!Object=} options
   * @return {!Promise}
   */
  waitForFunction(pageFunction, options = {}, ...args) {
    const timeout = options.timeout || 30000;
    const polling = options.polling || 'raf';
    return new WaitTask(this, pageFunction, polling, timeout, ...args).promise;
  }

  /**
   * @return {!Promise<string>}
   */
  async title() {
    return this.evaluate(() =>  document.title);
  }

  /**
   * @param {string} selectorOrXPath
   * @param {boolean} isXPath
   * @param {!Object=} options
   * @return {!Promise}
   */
  _waitForSelectorOrXPath(selectorOrXPath, isXPath, options = {}) {
    const timeout = options.timeout || 30000;
    const waitForVisible = !!options.visible;
    const waitForHidden = !!options.hidden;
    const polling = waitForVisible || waitForHidden ? 'raf' : 'mutation';
    return this.waitForFunction(predicate, {timeout, polling}, selectorOrXPath, isXPath, waitForVisible, waitForHidden);

    /**
     * @param {string} selectorOrXPath
     * @param {boolean} isXPath
     * @param {boolean} waitForVisible
     * @param {boolean} waitForHidden
     * @return {?Node|boolean}
     */
    function predicate(selectorOrXPath, isXPath, waitForVisible, waitForHidden) {
      const node = isXPath
        ? document.evaluate(selectorOrXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
        : document.querySelector(selectorOrXPath);
      if (!node)
        return waitForHidden;
      if (!waitForVisible && !waitForHidden)
        return node;
      const element = /** @type {Element} */ (node.nodeType === Node.TEXT_NODE ? node.parentElement : node);

      const style = window.getComputedStyle(element);
      const isVisible = style && style.visibility !== 'hidden' && hasVisibleBoundingBox();
      const success = (waitForVisible === isVisible || waitForHidden === !isVisible);
      return success ? node : null;

      /**
       * @return {boolean}
       */
      function hasVisibleBoundingBox() {
        const rect = element.getBoundingClientRect();
        return !!(rect.top || rect.bottom || rect.width || rect.height);
      }
    }
  }

  /**
   * @param {!Object} framePayload
   */
  _navigated(framePayload) {
    this._name = framePayload.name;
    this._url = framePayload.url;
  }

  /**
   * @param {string} loaderId
   * @param {string} name
   */
  _onLifecycleEvent(loaderId, name) {
    if (name === 'init') {
      this._loaderId = loaderId;
      this._lifecycleEvents.clear();
    }
    this._lifecycleEvents.add(name);
  }

  _detach() {
    for (const waitTask of this._waitTasks)
      waitTask.terminate(new Error('waitForFunction failed: frame got detached.'));
    this._detached = true;
    if (this._parentFrame)
      this._parentFrame._childFrames.delete(this);
    this._parentFrame = null;
  }
}
helper.tracePublicAPI(Frame);

class WaitTask {
  /**
   * @param {!Frame} frame
   * @param {Function|string} predicateBody
   * @param {string|number} polling
   * @param {number} timeout
   * @param {!Array<*>} args
   */
  constructor(frame, predicateBody, polling, timeout, ...args) {
    if (helper.isString(polling))
      console.assert(polling === 'raf' || polling === 'mutation', 'Unknown polling option: ' + polling);
    else if (helper.isNumber(polling))
      console.assert(polling > 0, 'Cannot poll with non-positive interval: ' + polling);
    else
      throw new Error('Unknown polling options: ' + polling);

    this._frame = frame;
    this._polling = polling;
    this._timeout = timeout;
    this._predicateBody = helper.isString(predicateBody) ? 'return ' + predicateBody : 'return (' + predicateBody + ')(...args)';
    this._args = args;
    this._runCount = 0;
    frame._waitTasks.add(this);
    this.promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    // Since page navigation requires us to re-install the pageScript, we should track
    // timeout on our end.
    this._timeoutTimer = setTimeout(() => this.terminate(new Error(`waiting failed: timeout ${timeout}ms exceeded`)), timeout);
    this.rerun();
  }

  /**
   * @param {!Error} error
   */
  terminate(error) {
    this._terminated = true;
    this._reject(error);
    this._cleanup();
  }

  async rerun() {
    const runCount = ++this._runCount;
    /** @type {?JSHandle} */
    let success = null;
    let error = null;
    try {
      success = await (await this._frame.executionContext()).evaluateHandle(waitForPredicatePageFunction, this._predicateBody, this._polling, this._timeout, ...this._args);
    } catch (e) {
      error = e;
    }

    if (this._terminated || runCount !== this._runCount) {
      if (success)
        await success.dispose();
      return;
    }

    // Ignore timeouts in pageScript - we track timeouts ourselves.
    if (!error && await this._frame.evaluate(s => !s, success)) {
      await success.dispose();
      return;
    }

    // When the page is navigated, the promise is rejected.
    // We will try again in the new execution context.
    if (error && error.message.includes('Execution context was destroyed'))
      return;

    // We could have tried to evaluate in a context which was already
    // destroyed.
    if (error && error.message.includes('Cannot find context with specified id'))
      return;

    if (error)
      this._reject(error);
    else
      this._resolve(success);

    this._cleanup();
  }

  _cleanup() {
    clearTimeout(this._timeoutTimer);
    this._frame._waitTasks.delete(this);
    this._runningTask = null;
  }
}

/**
 * @param {string} predicateBody
 * @param {string} polling
 * @param {number} timeout
 * @return {!Promise<*>}
 */
async function waitForPredicatePageFunction(predicateBody, polling, timeout, ...args) {
  const predicate = new Function('...args', predicateBody);
  let timedOut = false;
  setTimeout(() => timedOut = true, timeout);
  if (polling === 'raf')
    return await pollRaf();
  if (polling === 'mutation')
    return await pollMutation();
  if (typeof polling === 'number')
    return await pollInterval(polling);

  /**
   * @return {!Promise<*>}
   */
  function pollMutation() {
    const success = predicate.apply(null, args);
    if (success)
      return Promise.resolve(success);

    let fulfill;
    const result = new Promise(x => fulfill = x);
    const observer = new MutationObserver(mutations => {
      if (timedOut) {
        observer.disconnect();
        fulfill();
      }
      const success = predicate.apply(null, args);
      if (success) {
        observer.disconnect();
        fulfill(success);
      }
    });
    observer.observe(document, {
      childList: true,
      subtree: true,
      attributes: true
    });
    return result;
  }

  /**
   * @return {!Promise<*>}
   */
  function pollRaf() {
    let fulfill;
    const result = new Promise(x => fulfill = x);
    onRaf();
    return result;

    function onRaf() {
      if (timedOut) {
        fulfill();
        return;
      }
      const success = predicate.apply(null, args);
      if (success)
        fulfill(success);
      else
        requestAnimationFrame(onRaf);
    }
  }

  /**
   * @param {number} pollInterval
   * @return {!Promise<*>}
   */
  function pollInterval(pollInterval) {
    let fulfill;
    const result = new Promise(x => fulfill = x);
    onTimeout();
    return result;

    function onTimeout() {
      if (timedOut) {
        fulfill();
        return;
      }
      const success = predicate.apply(null, args);
      if (success)
        fulfill(success);
      else
        setTimeout(onTimeout, pollInterval);
    }
  }
}

module.exports = {FrameManager, Frame};
/**
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const {helper} = require('./helper');
const keyDefinitions = require('./USKeyboardLayout');

/**
 * @typedef {Object} KeyDescription
 * @property {number} keyCode
 * @property {string} key
 * @property {string} text
 * @property {string} code
 * @property {number} location
 */

class Keyboard {
  /**
   * @param {!Puppeteer.CDPSession} client
   */
  constructor(client) {
    this._client = client;
    this._modifiers = 0;
    this._pressedKeys = new Set();
  }

  /**
   * @param {string} key
   * @param {{text: string}=} options
   */
  async down(key, options = { text: undefined }) {
    const description = this._keyDescriptionForString(key);

    const autoRepeat = this._pressedKeys.has(description.code);
    this._pressedKeys.add(description.code);
    this._modifiers |= this._modifierBit(description.key);

    const text = options.text === undefined ? description.text : options.text;
    await this._client.send('Input.dispatchKeyEvent', {
      type: text ? 'keyDown' : 'rawKeyDown',
      modifiers: this._modifiers,
      windowsVirtualKeyCode: description.keyCode,
      code: description.code,
      key: description.key,
      text: text,
      unmodifiedText: text,
      autoRepeat,
      location: description.location,
      isKeypad: description.location === 3
    });
  }

  /**
   * @param {string} key
   * @return {number}
   */
  _modifierBit(key) {
    if (key === 'Alt')
      return 1;
    if (key === 'Control')
      return 2;
    if (key === 'Meta')
      return 4;
    if (key === 'Shift')
      return 8;
    return 0;
  }

  /**
   * @param {string} keyString
   * @return {KeyDescription}
   */
  _keyDescriptionForString(keyString) {
    const shift = this._modifiers & 8;
    const description = {
      key: '',
      keyCode: 0,
      code: '',
      text: '',
      location: 0
    };

    const definition = keyDefinitions[keyString];
    console.assert(definition, `Unknown key: "${keyString}"`);

    if (definition.key)
      description.key = definition.key;
    if (shift && definition.shiftKey)
      description.key = definition.shiftKey;

    if (definition.keyCode)
      description.keyCode = definition.keyCode;
    if (shift && definition.shiftKeyCode)
      description.keyCode = definition.shiftKeyCode;

    if (definition.code)
      description.code = definition.code;

    if (definition.location)
      description.location = definition.location;

    if (description.key.length === 1)
      description.text = description.key;

    if (definition.text)
      description.text = definition.text;
    if (shift && definition.shiftText)
      description.text = definition.shiftText;

    // if any modifiers besides shift are pressed, no text should be sent
    if (this._modifiers & ~8)
      description.text = '';

    return description;
  }

  /**
   * @param {string} key
   */
  async up(key) {
    const description = this._keyDescriptionForString(key);

    this._modifiers &= ~this._modifierBit(description.key);
    this._pressedKeys.delete(description.key);
    await this._client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      modifiers: this._modifiers,
      key: description.key,
      windowsVirtualKeyCode: description.keyCode,
      code: description.code,
      location: description.location
    });
  }

  /**
   * @param {string} char
   */
  async sendCharacter(char) {
    await this._client.send('Input.dispatchKeyEvent', {
      type: 'char',
      modifiers: this._modifiers,
      text: char,
      key: char,
      unmodifiedText: char
    });
  }

  /**
   * @param {string} text
   * @param {{delay: (number|undefined)}=} options
   */
  async type(text, options) {
    let delay = 0;
    if (options && options.delay)
      delay = options.delay;
    for (const char of text) {
      if (keyDefinitions[char])
        await this.press(char, {delay});
      else
        await this.sendCharacter(char);
      if (delay)
        await new Promise(f => setTimeout(f, delay));
    }
  }

  /**
   * @param {string} key
   * @param {!Object=} options
   */
  async press(key, options) {
    await this.down(key, options);
    if (options && options.delay)
      await new Promise(f => setTimeout(f, options.delay));
    await this.up(key);
  }
}

class Mouse {
  /**
   * @param {Puppeteer.CDPSession} client
   * @param {!Keyboard} keyboard
   */
  constructor(client, keyboard) {
    this._client = client;
    this._keyboard = keyboard;
    this._x = 0;
    this._y = 0;
    this._button = 'none';
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {Object=} options
   * @return {!Promise}
   */
  async move(x, y, options = {}) {
    const fromX = this._x, fromY = this._y;
    this._x = x;
    this._y = y;
    const steps = options.steps || 1;
    for (let i = 1; i <= steps; i++) {
      await this._client.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        button: this._button,
        x: fromX + (this._x - fromX) * (i / steps),
        y: fromY + (this._y - fromY) * (i / steps),
        modifiers: this._keyboard._modifiers
      });
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {!Object=} options
   */
  async click(x, y, options = {}) {
    this.move(x, y);
    this.down(options);
    if (typeof options.delay === 'number')
      await new Promise(f => setTimeout(f, options.delay));
    await this.up(options);
  }

  /**
   * @param {!Object=} options
   */
  async down(options = {}) {
    this._button = (options.button || 'left');
    await this._client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: this._button,
      x: this._x,
      y: this._y,
      modifiers: this._keyboard._modifiers,
      clickCount: (options.clickCount || 1)
    });
  }

  /**
   * @param {!Object=} options
   */
  async up(options = {}) {
    this._button = 'none';
    await this._client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: (options.button || 'left'),
      x: this._x,
      y: this._y,
      modifiers: this._keyboard._modifiers,
      clickCount: (options.clickCount || 1)
    });
  }
}

class Touchscreen {
  /**
   * @param {Puppeteer.CDPSession} client
   * @param {Keyboard} keyboard
   */
  constructor(client, keyboard) {
    this._client = client;
    this._keyboard = keyboard;
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  async tap(x, y) {
    // Touches appear to be lost during the first frame after navigation.
    // This waits a frame before sending the tap.
    // @see https://crbug.com/613219
    await this._client.send('Runtime.evaluate', {
      expression: 'new Promise(x => requestAnimationFrame(() => requestAnimationFrame(x)))',
      awaitPromise: true
    });

    const touchPoints = [{x: Math.round(x), y: Math.round(y)}];
    await this._client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints,
      modifiers: this._keyboard._modifiers
    });
    await this._client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
      modifiers: this._keyboard._modifiers
    });
  }
}

module.exports = { Keyboard, Mouse, Touchscreen};
helper.tracePublicAPI(Keyboard);
helper.tracePublicAPI(Mouse);
helper.tracePublicAPI(Touchscreen);
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
const os = require('os');
const path = require('path');
const removeFolder = require('rimraf');
const childProcess = require('child_process');
const Downloader = require('./Downloader');
const {Connection} = require('./Connection');
const {Browser} = require('./Browser');
const readline = require('readline');
const fs = require('fs');
const {helper} = require('./helper');
const ChromiumRevision = Downloader.defaultRevision();

const mkdtempAsync = helper.promisify(fs.mkdtemp);
const removeFolderAsync = helper.promisify(removeFolder);

const CHROME_PROFILE_PATH = path.join(os.tmpdir(), 'puppeteer_dev_profile-');

const DEFAULT_ARGS = [
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-client-side-phishing-detection',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-hang-monitor',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-sync',
  '--disable-translate',
  '--metrics-recording-only',
  '--no-first-run',
  '--remote-debugging-port=0',
  '--safebrowsing-disable-auto-update',
];

const AUTOMATION_ARGS = [
  '--enable-automation',
  '--password-store=basic',
  '--use-mock-keychain',
];

class Launcher {
  /**
   * @param {!Object=} options
   * @return {!Promise<!Browser>}
   */
  static async launch(options) {
    options = Object.assign({}, options || {});
    let temporaryUserDataDir = null;
    const chromeArguments = [];
    if (!options.ignoreDefaultArgs)
      chromeArguments.push(...DEFAULT_ARGS);

    if (options.appMode)
      options.headless = false;
    else if (!options.ignoreDefaultArgs)
      chromeArguments.push(...AUTOMATION_ARGS);

    if (!options.args || !options.args.some(arg => arg.startsWith('--user-data-dir'))) {
      if (!options.userDataDir)
        temporaryUserDataDir = await mkdtempAsync(CHROME_PROFILE_PATH);

      chromeArguments.push(`--user-data-dir=${options.userDataDir || temporaryUserDataDir}`);
    }
    if (options.devtools === true) {
      chromeArguments.push('--auto-open-devtools-for-tabs');
      options.headless = false;
    }
    if (typeof options.headless !== 'boolean' || options.headless) {
      chromeArguments.push(
          '--headless',
          '--disable-gpu',
          '--hide-scrollbars',
          '--mute-audio'
      );
    }
    let chromeExecutable = options.executablePath;
    if (typeof chromeExecutable !== 'string') {
      const downloader = Downloader.createDefault();
      const revisionInfo = downloader.revisionInfo(downloader.currentPlatform(), ChromiumRevision);
      console.assert(revisionInfo.downloaded, `Chromium revision is not downloaded. Run "npm install" or "yarn install"`);
      chromeExecutable = revisionInfo.executablePath;
    }
    if (Array.isArray(options.args))
      chromeArguments.push(...options.args);

    const chromeProcess = childProcess.spawn(
        chromeExecutable,
        chromeArguments,
        {
          detached: true,
          env: options.env || process.env
        }
    );
    if (options.dumpio) {
      chromeProcess.stdout.pipe(process.stdout);
      chromeProcess.stderr.pipe(process.stderr);
    }

    let chromeClosed = false;
    const waitForChromeToClose = new Promise((fulfill, reject) => {
      chromeProcess.once('close', () => {
        chromeClosed = true;
        // Cleanup as processes exit.
        if (temporaryUserDataDir) {
          removeFolderAsync(temporaryUserDataDir)
              .then(() => fulfill())
              .catch(err => console.error(err));
        } else {
          fulfill();
        }
      });
    });

    const listeners = [ helper.addEventListener(process, 'exit', forceKillChrome) ];
    if (options.handleSIGINT !== false)
      listeners.push(helper.addEventListener(process, 'SIGINT', forceKillChrome));
    if (options.handleSIGTERM !== false)
      listeners.push(helper.addEventListener(process, 'SIGTERM', killChrome));
    if (options.handleSIGHUP !== false)
      listeners.push(helper.addEventListener(process, 'SIGHUP', killChrome));
    /** @type {?Connection} */
    let connection = null;
    try {
      const connectionDelay = options.slowMo || 0;
      const browserWSEndpoint = await waitForWSEndpoint(chromeProcess, options.timeout || 30 * 1000);
      connection = await Connection.create(browserWSEndpoint, connectionDelay);
      return Browser.create(connection, options, chromeProcess, killChrome);
    } catch (e) {
      forceKillChrome();
      throw e;
    }

    /**
     * @return {Promise}
     */
    function killChrome() {
      helper.removeEventListeners(listeners);
      if (temporaryUserDataDir) {
        forceKillChrome();
      } else if (connection) {
        // Attempt to close chrome gracefully
        connection.send('Browser.close');
      }
      return waitForChromeToClose;
    }

    function forceKillChrome() {
      helper.removeEventListeners(listeners);
      if (chromeProcess.pid && !chromeProcess.killed && !chromeClosed) {
        // Force kill chrome.
        if (process.platform === 'win32')
          childProcess.execSync(`taskkill /pid ${chromeProcess.pid} /T /F`);
        else
          process.kill(-chromeProcess.pid, 'SIGKILL');
      }
      // Attempt to remove temporary profile directory to avoid littering.
      try {
        removeFolder.sync(temporaryUserDataDir);
      } catch (e) { }
    }
  }

  /**
   * @return {!Array<string>}
   */
  static defaultArgs() {
    return DEFAULT_ARGS.concat(AUTOMATION_ARGS);
  }

  /**
   * @return {string}
   */
  static executablePath() {
    const downloader = Downloader.createDefault();
    const revisionInfo = downloader.revisionInfo(downloader.currentPlatform(), ChromiumRevision);
    return revisionInfo.executablePath;
  }

  /**
   * @param {!Object=} options
   * @return {!Promise<!Browser>}
   */
  static async connect(options = {}) {
    const connectionDelay = options.slowMo || 0;
    const connection = await Connection.create(options.browserWSEndpoint, connectionDelay);
    return Browser.create(connection, options, null, () => connection.send('Browser.close'));
  }
}

/**
 * @param {!Puppeteer.ChildProcess} chromeProcess
 * @param {number} timeout
 * @return {!Promise<string>}
 */
function waitForWSEndpoint(chromeProcess, timeout) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: chromeProcess.stderr });
    let stderr = '';
    const listeners = [
      helper.addEventListener(rl, 'line', onLine),
      helper.addEventListener(rl, 'close', () => onClose()),
      helper.addEventListener(chromeProcess, 'exit', () => onClose()),
      helper.addEventListener(chromeProcess, 'error', error => onClose(error))
    ];
    const timeoutId = timeout ? setTimeout(onTimeout, timeout) : 0;

    /**
     * @param {!Error=} error
     */
    function onClose(error) {
      cleanup();
      reject(new Error([
        'Failed to launch chrome!' + (error ? ' ' + error.message : ''),
        stderr,
        '',
        'TROUBLESHOOTING: https://github.com/GoogleChrome/puppeteer/blob/master/docs/troubleshooting.md',
        '',
      ].join('\n')));
    }

    function onTimeout() {
      cleanup();
      reject(new Error(`Timed out after ${timeout} ms while trying to connect to Chrome! The only Chrome revision guaranteed to work is r${ChromiumRevision}`));
    }

    /**
     * @param {string} line
     */
    function onLine(line) {
      stderr += line + '\n';
      const match = line.match(/^DevTools listening on (ws:\/\/.*)$/);
      if (!match)
        return;
      cleanup();
      resolve(match[1]);
    }

    function cleanup() {
      if (timeoutId)
        clearTimeout(timeoutId);
      helper.removeEventListeners(listeners);
    }
  });
}

module.exports = Launcher;
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

class Multimap {
  constructor() {
    this._map = new Map();
  }

  set(key, value) {
    let set = this._map.get(key);
    if (!set) {
      set = new Set();
      this._map.set(key, set);
    }
    set.add(value);
  }

  get(key) {
    let result = this._map.get(key);
    if (!result)
      result = new Set();
    return result;
  }

  has(key) {
    return this._map.has(key);
  }

  hasValue(key, value) {
    const set = this._map.get(key);
    if (!set)
      return false;
    return set.has(value);
  }

  /**
   * @return {number}
   */
  get size() {
    return this._map.size;
  }

  delete(key, value) {
    const values = this.get(key);
    const result = values.delete(value);
    if (!values.size)
      this._map.delete(key);
    return result;
  }

  deleteAll(key) {
    this._map.delete(key);
  }

  firstValue(key) {
    const set = this._map.get(key);
    if (!set)
      return null;
    return set.values().next().value;
  }

  firstKey() {
    return this._map.keys().next().value;
  }

  valuesArray() {
    const result = [];
    for (const key of this._map.keys())
      result.push(...Array.from(this._map.get(key).values()));
    return result;
  }

  keysArray() {
    return Array.from(this._map.keys());
  }

  clear() {
    this._map.clear();
  }
}

module.exports = Multimap;
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

const {helper} = require('./helper');
const {FrameManager} = require('./FrameManager');

class NavigatorWatcher {
  /**
   * @param {!FrameManager} frameManager
   * @param {!Puppeteer.Frame} frame
   * @param {number} timeout
   * @param {!Object=} options
   */
  constructor(frameManager, frame, timeout, options = {}) {
    console.assert(options.networkIdleTimeout === undefined, 'ERROR: networkIdleTimeout option is no longer supported.');
    console.assert(options.networkIdleInflight === undefined, 'ERROR: networkIdleInflight option is no longer supported.');
    console.assert(options.waitUntil !== 'networkidle', 'ERROR: "networkidle" option is no longer supported. Use "networkidle2" instead');
    let waitUntil = ['load'];
    if (Array.isArray(options.waitUntil))
      waitUntil = options.waitUntil.slice();
    else if (typeof options.waitUntil === 'string')
      waitUntil = [options.waitUntil];
    this._expectedLifecycle = waitUntil.map(value => {
      const protocolEvent = puppeteerToProtocolLifecycle[value];
      console.assert(protocolEvent, 'Unknown value for options.waitUntil: ' + value);
      return protocolEvent;
    });

    this._frameManager = frameManager;
    this._frame = frame;
    this._initialLoaderId = frame._loaderId;
    this._timeout = timeout;
    this._eventListeners = [
      helper.addEventListener(this._frameManager, FrameManager.Events.LifecycleEvent, this._checkLifecycleComplete.bind(this)),
      helper.addEventListener(this._frameManager, FrameManager.Events.FrameDetached, this._checkLifecycleComplete.bind(this))
    ];

    const lifecycleCompletePromise = new Promise(fulfill => {
      this._lifecycleCompleteCallback = fulfill;
    });
    this._navigationPromise = Promise.race([
      this._createTimeoutPromise(),
      lifecycleCompletePromise
    ]).then(error => {
      this._cleanup();
      return error;
    });
  }

  /**
   * @return {!Promise<?Error>}
   */
  _createTimeoutPromise() {
    if (!this._timeout)
      return new Promise(() => {});
    const errorMessage = 'Navigation Timeout Exceeded: ' + this._timeout + 'ms exceeded';
    return new Promise(fulfill => this._maximumTimer = setTimeout(fulfill, this._timeout))
        .then(() => new Error(errorMessage));
  }

  /**
   * @return {!Promise<?Error>}
   */
  async navigationPromise() {
    return this._navigationPromise;
  }

  _checkLifecycleComplete() {
    // We expect navigation to commit.
    if (this._frame._loaderId === this._initialLoaderId)
      return;
    if (!checkLifecycle(this._frame, this._expectedLifecycle))
      return;
    this._lifecycleCompleteCallback();

    /**
     * @param {!Puppeteer.Frame} frame
     * @param {!Array<string>} expectedLifecycle
     * @return {boolean}
     */
    function checkLifecycle(frame, expectedLifecycle) {
      for (const event of expectedLifecycle) {
        if (!frame._lifecycleEvents.has(event))
          return false;
      }
      for (const child of frame.childFrames()) {
        if (!checkLifecycle(child, expectedLifecycle))
          return false;
      }
      return true;
    }
  }

  cancel() {
    this._cleanup();
  }

  _cleanup() {
    helper.removeEventListeners(this._eventListeners);
    this._lifecycleCompleteCallback(new Error('Navigation failed'));
    clearTimeout(this._maximumTimer);
  }
}

const puppeteerToProtocolLifecycle = {
  'load': 'load',
  'domcontentloaded': 'DOMContentLoaded',
  'networkidle0': 'networkIdle',
  'networkidle2': 'networkAlmostIdle',
};

module.exports = NavigatorWatcher;
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
const EventEmitter = require('events');
const {helper, debugError} = require('./helper');
const Multimap = require('./Multimap');

class NetworkManager extends EventEmitter {
  /**
   * @param {!Puppeteer.CDPSession} client
   * @param {!Puppeteer.FrameManager} frameManager
   */
  constructor(client, frameManager) {
    super();
    this._client = client;
    this._frameManager = frameManager;
    /** @type {!Map<string, !Request>} */
    this._requestIdToRequest = new Map();
    /** @type {!Map<string, !Request>} */
    this._interceptionIdToRequest = new Map();
    /** @type {!Object<string, string>} */
    this._extraHTTPHeaders = {};

    this._offline = false;

    /** @type {?{username: string, password: string}} */
    this._credentials = null;
    /** @type {!Set<string>} */
    this._attemptedAuthentications = new Set();
    this._userRequestInterceptionEnabled = false;
    this._protocolRequestInterceptionEnabled = false;
    /** @type {!Multimap} */
    this._requestHashToRequestIds = new Multimap();
    /** @type {!Multimap} */
    this._requestHashToInterceptionIds = new Multimap();

    this._client.on('Network.requestWillBeSent', this._onRequestWillBeSent.bind(this));
    this._client.on('Network.requestIntercepted', this._onRequestIntercepted.bind(this));
    this._client.on('Network.responseReceived', this._onResponseReceived.bind(this));
    this._client.on('Network.loadingFinished', this._onLoadingFinished.bind(this));
    this._client.on('Network.loadingFailed', this._onLoadingFailed.bind(this));
  }

  /**
   * @param {?{username: string, password: string}} credentials
   */
  async authenticate(credentials) {
    this._credentials = credentials;
    await this._updateProtocolRequestInterception();
  }

  /**
   * @param {!Object<string, string>} extraHTTPHeaders
   */
  async setExtraHTTPHeaders(extraHTTPHeaders) {
    this._extraHTTPHeaders = {};
    for (const key of Object.keys(extraHTTPHeaders)) {
      const value = extraHTTPHeaders[key];
      console.assert(helper.isString(value), `Expected value of header "${key}" to be String, but "${typeof value}" is found.`);
      this._extraHTTPHeaders[key.toLowerCase()] = value;
    }
    await this._client.send('Network.setExtraHTTPHeaders', { headers: this._extraHTTPHeaders });
  }

  /**
   * @return {!Object<string, string>}
   */
  extraHTTPHeaders() {
    return Object.assign({}, this._extraHTTPHeaders);
  }

  /**
   * @param {boolean} value
   */
  async setOfflineMode(value) {
    if (this._offline === value)
      return;
    this._offline = value;
    await this._client.send('Network.emulateNetworkConditions', {
      offline: this._offline,
      // values of 0 remove any active throttling. crbug.com/456324#c9
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1
    });
  }

  /**
   * @param {string} userAgent
   */
  async setUserAgent(userAgent) {
    await this._client.send('Network.setUserAgentOverride', { userAgent });
  }

  /**
   * @param {boolean} value
   */
  async setRequestInterception(value) {
    this._userRequestInterceptionEnabled = value;
    await this._updateProtocolRequestInterception();
  }

  async _updateProtocolRequestInterception() {
    const enabled = this._userRequestInterceptionEnabled || !!this._credentials;
    if (enabled === this._protocolRequestInterceptionEnabled)
      return;
    this._protocolRequestInterceptionEnabled = enabled;
    const patterns = enabled ? [{urlPattern: '*'}] : [];
    await Promise.all([
      this._client.send('Network.setCacheDisabled', {cacheDisabled: enabled}),
      this._client.send('Network.setRequestInterception', {patterns})
    ]);
  }

  /**
   * @param {!Object} event
   */
  _onRequestIntercepted(event) {
    if (event.authChallenge) {
      let response = 'Default';
      if (this._attemptedAuthentications.has(event.interceptionId)) {
        response = 'CancelAuth';
      } else if (this._credentials) {
        response = 'ProvideCredentials';
        this._attemptedAuthentications.add(event.interceptionId);
      }
      const {username, password} = this._credentials || {username: undefined, password: undefined};
      this._client.send('Network.continueInterceptedRequest', {
        interceptionId: event.interceptionId,
        authChallengeResponse: { response, username, password }
      }).catch(debugError);
      return;
    }
    if (!this._userRequestInterceptionEnabled && this._protocolRequestInterceptionEnabled) {
      this._client.send('Network.continueInterceptedRequest', {
        interceptionId: event.interceptionId
      }).catch(debugError);
    }

    if (event.redirectUrl) {
      const request = this._interceptionIdToRequest.get(event.interceptionId);
      if (request) {
        this._handleRequestRedirect(request, event.responseStatusCode, event.responseHeaders);
        this._handleRequestStart(request._requestId, event.interceptionId, event.redirectUrl, event.resourceType, event.request, event.frameId);
      }
      return;
    }
    const requestHash = generateRequestHash(event.request);
    const requestId = this._requestHashToRequestIds.firstValue(requestHash);
    if (requestId) {
      this._requestHashToRequestIds.delete(requestHash, requestId);
      this._handleRequestStart(requestId, event.interceptionId, event.request.url, event.resourceType, event.request, event.frameId);
    } else {
      this._requestHashToInterceptionIds.set(requestHash, event.interceptionId);
      this._handleRequestStart(null, event.interceptionId, event.request.url, event.resourceType, event.request, event.frameId);
    }
  }

  /**
   * @param {!Request} request
   * @param {number} redirectStatus
   * @param {!Object} redirectHeaders
   */
  _handleRequestRedirect(request, redirectStatus, redirectHeaders) {
    const response = new Response(this._client, request, redirectStatus, redirectHeaders);
    request._response = response;
    this._requestIdToRequest.delete(request._requestId);
    this._interceptionIdToRequest.delete(request._interceptionId);
    this._attemptedAuthentications.delete(request._interceptionId);
    this.emit(NetworkManager.Events.Response, response);
    this.emit(NetworkManager.Events.RequestFinished, request);
  }

  /**
   * @param {?string} requestId
   * @param {?string} interceptionId
   * @param {string} url
   * @param {string} resourceType
   * @param {!Object} requestPayload
   * @param {?string} frameId
   */
  _handleRequestStart(requestId, interceptionId, url, resourceType, requestPayload, frameId) {
    let frame = null;
    if (frameId)
      frame = this._frameManager.frame(frameId);
    const request = new Request(this._client, requestId, interceptionId, this._userRequestInterceptionEnabled, url, resourceType, requestPayload, frame);
    if (requestId)
      this._requestIdToRequest.set(requestId, request);
    if (interceptionId)
      this._interceptionIdToRequest.set(interceptionId, request);
    this.emit(NetworkManager.Events.Request, request);
  }

  /**
   * @param {!Object} event
   */
  _onRequestWillBeSent(event) {
    if (this._protocolRequestInterceptionEnabled) {
      // All redirects are handled in requestIntercepted.
      if (event.redirectResponse)
        return;
      const requestHash = generateRequestHash(event.request);
      const interceptionId = this._requestHashToInterceptionIds.firstValue(requestHash);
      const request = interceptionId ? this._interceptionIdToRequest.get(interceptionId) : null;
      if (request) {
        request._requestId = event.requestId;
        this._requestIdToRequest.set(event.requestId, request);
        this._requestHashToInterceptionIds.delete(requestHash, interceptionId);
      } else {
        this._requestHashToRequestIds.set(requestHash, event.requestId);
      }
      return;
    }
    if (event.redirectResponse) {
      const request = this._requestIdToRequest.get(event.requestId);
      // If we connect late to the target, we could have missed the requestWillBeSent event.
      if (request)
        this._handleRequestRedirect(request, event.redirectResponse.status, event.redirectResponse.headers);
    }
    this._handleRequestStart(event.requestId, null, event.request.url, event.type, event.request, event.frameId);
  }

  /**
   * @param {!Object} event
   */
  _onResponseReceived(event) {
    const request = this._requestIdToRequest.get(event.requestId);
    // FileUpload sends a response without a matching request.
    if (!request)
      return;
    const response = new Response(this._client, request, event.response.status, event.response.headers);
    request._response = response;
    this.emit(NetworkManager.Events.Response, response);
  }

  /**
   * @param {!Object} event
   */
  _onLoadingFinished(event) {
    const request = this._requestIdToRequest.get(event.requestId);
    // For certain requestIds we never receive requestWillBeSent event.
    // @see https://crbug.com/750469
    if (!request)
      return;
    request._completePromiseFulfill.call(null);
    this._requestIdToRequest.delete(request._requestId);
    this._interceptionIdToRequest.delete(request._interceptionId);
    this._attemptedAuthentications.delete(request._interceptionId);
    this.emit(NetworkManager.Events.RequestFinished, request);
  }

  /**
   * @param {!Object} event
   */
  _onLoadingFailed(event) {
    const request = this._requestIdToRequest.get(event.requestId);
    // For certain requestIds we never receive requestWillBeSent event.
    // @see https://crbug.com/750469
    if (!request)
      return;
    request._failureText = event.errorText;
    request._completePromiseFulfill.call(null);
    this._requestIdToRequest.delete(request._requestId);
    this._interceptionIdToRequest.delete(request._interceptionId);
    this._attemptedAuthentications.delete(request._interceptionId);
    this.emit(NetworkManager.Events.RequestFailed, request);
  }
}

class Request {
  /**
   * @param {!Puppeteer.CDPSession} client
   * @param {?string} requestId
   * @param {string} interceptionId
   * @param {boolean} allowInterception
   * @param {string} url
   * @param {string} resourceType
   * @param {!Object} payload
   * @param {?Puppeteer.Frame} frame
   */
  constructor(client, requestId, interceptionId, allowInterception, url, resourceType, payload, frame) {
    this._client = client;
    this._requestId = requestId;
    this._interceptionId = interceptionId;
    this._allowInterception = allowInterception;
    this._interceptionHandled = false;
    this._response = null;
    this._failureText = null;
    this._completePromise = new Promise(fulfill => {
      this._completePromiseFulfill = fulfill;
    });

    this._url = url;
    this._resourceType = resourceType.toLowerCase();
    this._method = payload.method;
    this._postData = payload.postData;
    this._headers = {};
    this._frame = frame;
    for (const key of Object.keys(payload.headers))
      this._headers[key.toLowerCase()] = payload.headers[key];
  }

  /**
   * @return {string}
   */
  url() {
    return this._url;
  }

  /**
   * @return {string}
   */
  resourceType() {
    return this._resourceType;
  }

  /**
   * @return {string}
   */
  method() {
    return this._method;
  }

  /**
   * @return {string}
   */
  postData() {
    return this._postData;
  }

  /**
   * @return {!Object}
   */
  headers() {
    return this._headers;
  }

  /**
   * @return {?Response}
   */
  response() {
    return this._response;
  }

  /**
   * @return {?Puppeteer.Frame}
   */
  frame() {
    return this._frame;
  }

  /**
   * @return {?{errorText: string}}
   */
  failure() {
    if (!this._failureText)
      return null;
    return {
      errorText: this._failureText
    };
  }

  /**
   * @param {!Object=} overrides
   */
  async continue(overrides = {}) {
    console.assert(this._allowInterception, 'Request Interception is not enabled!');
    console.assert(!this._interceptionHandled, 'Request is already handled!');
    this._interceptionHandled = true;
    await this._client.send('Network.continueInterceptedRequest', {
      interceptionId: this._interceptionId,
      url: overrides.url,
      method: overrides.method,
      postData: overrides.postData,
      headers: overrides.headers,
    }).catch(error => {
      // In certain cases, protocol will return error if the request was already canceled
      // or the page was closed. We should tolerate these errors.
      debugError(error);
    });
  }

  /**
   * @param {!{status: number, headers: Object, contentType: string, body: (string|Buffer)}} response
   */
  async respond(response) {
    // Mocking responses for dataURL requests is not currently supported.
    if (this._url.startsWith('data:'))
      return;
    console.assert(this._allowInterception, 'Request Interception is not enabled!');
    console.assert(!this._interceptionHandled, 'Request is already handled!');
    this._interceptionHandled = true;

    const responseBody = response.body && helper.isString(response.body) ? Buffer.from(/** @type {string} */(response.body)) : /** @type {?Buffer} */(response.body || null);

    const responseHeaders = {};
    if (response.headers) {
      for (const header of Object.keys(response.headers))
        responseHeaders[header.toLowerCase()] = response.headers[header];
    }
    if (response.contentType)
      responseHeaders['content-type'] = response.contentType;
    if (responseBody && !('content-length' in responseHeaders)) {
      // @ts-ignore
      responseHeaders['content-length'] = Buffer.byteLength(responseBody);
    }

    const statusCode = response.status || 200;
    const statusText = statusTexts[statusCode] || '';
    const statusLine = `HTTP/1.1 ${statusCode} ${statusText}`;

    const CRLF = '\r\n';
    let text = statusLine + CRLF;
    for (const header of Object.keys(responseHeaders))
      text += header + ': ' + responseHeaders[header] + CRLF;
    text += CRLF;
    let responseBuffer = Buffer.from(text, 'utf8');
    if (responseBody)
      responseBuffer = Buffer.concat([responseBuffer, responseBody]);

    await this._client.send('Network.continueInterceptedRequest', {
      interceptionId: this._interceptionId,
      rawResponse: responseBuffer.toString('base64')
    }).catch(error => {
      // In certain cases, protocol will return error if the request was already canceled
      // or the page was closed. We should tolerate these errors.
      debugError(error);
    });
  }

  /**
   * @param {string=} errorCode
   */
  async abort(errorCode = 'failed') {
    const errorReason = errorReasons[errorCode];
    console.assert(errorReason, 'Unknown error code: ' + errorCode);
    console.assert(this._allowInterception, 'Request Interception is not enabled!');
    console.assert(!this._interceptionHandled, 'Request is already handled!');
    this._interceptionHandled = true;
    await this._client.send('Network.continueInterceptedRequest', {
      interceptionId: this._interceptionId,
      errorReason
    }).catch(error => {
      // In certain cases, protocol will return error if the request was already canceled
      // or the page was closed. We should tolerate these errors.
      debugError(error);
    });
  }
}

const errorReasons = {
  'aborted': 'Aborted',
  'accessdenied': 'AccessDenied',
  'addressunreachable': 'AddressUnreachable',
  'connectionaborted': 'ConnectionAborted',
  'connectionclosed': 'ConnectionClosed',
  'connectionfailed': 'ConnectionFailed',
  'connectionrefused': 'ConnectionRefused',
  'connectionreset': 'ConnectionReset',
  'internetdisconnected': 'InternetDisconnected',
  'namenotresolved': 'NameNotResolved',
  'timedout': 'TimedOut',
  'failed': 'Failed',
};

helper.tracePublicAPI(Request);

class Response {
  /**
   * @param {!Puppeteer.CDPSession} client
   * @param {!Request} request
   * @param {number} status
   * @param {!Object} headers
   */
  constructor(client, request, status, headers) {
    this._client = client;
    this._request = request;
    this._contentPromise = null;

    this._status = status;
    this._url = request.url();
    this._headers = {};
    for (const key of Object.keys(headers))
      this._headers[key.toLowerCase()] = headers[key];
  }

  /**
   * @return {string}
   */
  url() {
    return this._url;
  }

  /**
   * @return {boolean}
   */
  ok() {
    return this._status >= 200 && this._status <= 299;
  }

  /**
   * @return {number}
   */
  status() {
    return this._status;
  }

  /**
   * @return {!Object}
   */
  headers() {
    return this._headers;
  }

  /**
   * @return {!Promise<!Buffer>}
   */
  buffer() {
    if (!this._contentPromise) {
      this._contentPromise = this._request._completePromise.then(async() => {
        const response = await this._client.send('Network.getResponseBody', {
          requestId: this._request._requestId
        });
        return Buffer.from(response.body, response.base64Encoded ? 'base64' : 'utf8');
      });
    }
    return this._contentPromise;
  }

  /**
   * @return {!Promise<string>}
   */
  async text() {
    const content = await this.buffer();
    return content.toString('utf8');
  }

  /**
   * @return {!Promise<!Object>}
   */
  async json() {
    const content = await this.text();
    return JSON.parse(content);
  }

  /**
   * @return {!Request}
   */
  request() {
    return this._request;
  }
}
helper.tracePublicAPI(Response);

/**
 * @param {!Object} request
 * @return {string}
 */
function generateRequestHash(request) {
  let normalizedURL = request.url;
  try {
    // Decoding is necessary to normalize URLs. @see crbug.com/759388
    // The method will throw if the URL is malformed. In this case,
    // consider URL to be normalized as-is.
    normalizedURL = decodeURI(request.url);
  } catch (e) {
  }
  const hash = {
    url: normalizedURL,
    method: request.method,
    postData: request.postData,
    headers: {},
  };

  if (!normalizedURL.startsWith('data:')) {
    const headers = Object.keys(request.headers);
    headers.sort();
    for (let header of headers) {
      const headerValue = request.headers[header];
      header = header.toLowerCase();
      if (header === 'accept' || header === 'referer' || header === 'x-devtools-emulate-network-conditions-client-id')
        continue;
      hash.headers[header] = headerValue;
    }
  }
  return JSON.stringify(hash);
}

NetworkManager.Events = {
  Request: 'request',
  Response: 'response',
  RequestFailed: 'requestfailed',
  RequestFinished: 'requestfinished',
};

const statusTexts = {
  '100': 'Continue',
  '101': 'Switching Protocols',
  '102': 'Processing',
  '200': 'OK',
  '201': 'Created',
  '202': 'Accepted',
  '203': 'Non-Authoritative Information',
  '204': 'No Content',
  '206': 'Partial Content',
  '207': 'Multi-Status',
  '208': 'Already Reported',
  '209': 'IM Used',
  '300': 'Multiple Choices',
  '301': 'Moved Permanently',
  '302': 'Found',
  '303': 'See Other',
  '304': 'Not Modified',
  '305': 'Use Proxy',
  '306': 'Switch Proxy',
  '307': 'Temporary Redirect',
  '308': 'Permanent Redirect',
  '400': 'Bad Request',
  '401': 'Unauthorized',
  '402': 'Payment Required',
  '403': 'Forbidden',
  '404': 'Not Found',
  '405': 'Method Not Allowed',
  '406': 'Not Acceptable',
  '407': 'Proxy Authentication Required',
  '408': 'Request Timeout',
  '409': 'Conflict',
  '410': 'Gone',
  '411': 'Length Required',
  '412': 'Precondition Failed',
  '413': 'Payload Too Large',
  '414': 'URI Too Long',
  '415': 'Unsupported Media Type',
  '416': 'Range Not Satisfiable',
  '417': 'Expectation Failed',
  '418': 'I\'m a teapot',
  '421': 'Misdirected Request',
  '422': 'Unprocessable Entity',
  '423': 'Locked',
  '424': 'Failed Dependency',
  '426': 'Upgrade Required',
  '428': 'Precondition Required',
  '429': 'Too Many Requests',
  '431': 'Request Header Fields Too Large',
  '451': 'Unavailable For Legal Reasons',
  '500': 'Internal Server Error',
  '501': 'Not Implemented',
  '502': 'Bad Gateway',
  '503': 'Service Unavailable',
  '504': 'Gateway Timeout',
  '505': 'HTTP Version Not Supported',
  '506': 'Variant Also Negotiates',
  '507': 'Insufficient Storage',
  '508': 'Loop Detected',
  '510': 'Not Extended',
  '511': 'Network Authentication Required',
};

module.exports = NetworkManager;
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

const fs = require('fs');
const EventEmitter = require('events');
const mime = require('mime');
const NetworkManager = require('./NetworkManager');
const NavigatorWatcher = require('./NavigatorWatcher');
const Dialog = require('./Dialog');
const EmulationManager = require('./EmulationManager');
const {FrameManager} = require('./FrameManager');
const {Keyboard, Mouse, Touchscreen} = require('./Input');
const Tracing = require('./Tracing');
const {helper, debugError} = require('./helper');
const {Coverage} = require('./Coverage');

const writeFileAsync = helper.promisify(fs.writeFile);

class Page extends EventEmitter {
  /**
   * @param {!Puppeteer.CDPSession} client
   * @param {!Puppeteer.Target} target
   * @param {boolean} ignoreHTTPSErrors
   * @param {boolean} appMode
   * @param {!Puppeteer.TaskQueue} screenshotTaskQueue
   * @return {!Promise<!Page>}
   */
  static async create(client, target, ignoreHTTPSErrors, appMode, screenshotTaskQueue) {

    await client.send('Page.enable');
    const {frameTree} = await client.send('Page.getFrameTree');
    const page = new Page(client, target, frameTree, ignoreHTTPSErrors, screenshotTaskQueue);

    await Promise.all([
      client.send('Page.setLifecycleEventsEnabled', { enabled: true }),
      client.send('Network.enable', {}),
      client.send('Runtime.enable', {}),
      client.send('Security.enable', {}),
      client.send('Performance.enable', {}),
    ]);
    if (ignoreHTTPSErrors)
      await client.send('Security.setOverrideCertificateErrors', {override: true});
    // Initialize default page size.
    if (!appMode)
      await page.setViewport({width: 800, height: 600});

    return page;
  }

  /**
   * @param {!Puppeteer.CDPSession} client
   * @param {!Puppeteer.Target} target
   * @param {{frame: Object, childFrames: ?Array}} frameTree
   * @param {boolean} ignoreHTTPSErrors
   * @param {!Puppeteer.TaskQueue} screenshotTaskQueue
   */
  constructor(client, target, frameTree, ignoreHTTPSErrors, screenshotTaskQueue) {
    super();
    this._client = client;
    this._target = target;
    this._keyboard = new Keyboard(client);
    this._mouse = new Mouse(client, this._keyboard);
    this._touchscreen = new Touchscreen(client, this._keyboard);
    this._frameManager = new FrameManager(client, frameTree, this);
    this._networkManager = new NetworkManager(client, this._frameManager);
    this._emulationManager = new EmulationManager(client);
    this._tracing = new Tracing(client);
    /** @type {!Map<string, Function>} */
    this._pageBindings = new Map();
    this._ignoreHTTPSErrors = ignoreHTTPSErrors;
    this._coverage = new Coverage(client);
    this._defaultNavigationTimeout = 30000;

    this._screenshotTaskQueue = screenshotTaskQueue;

    this._frameManager.on(FrameManager.Events.FrameAttached, event => this.emit(Page.Events.FrameAttached, event));
    this._frameManager.on(FrameManager.Events.FrameDetached, event => this.emit(Page.Events.FrameDetached, event));
    this._frameManager.on(FrameManager.Events.FrameNavigated, event => this.emit(Page.Events.FrameNavigated, event));

    this._networkManager.on(NetworkManager.Events.Request, event => this.emit(Page.Events.Request, event));
    this._networkManager.on(NetworkManager.Events.Response, event => this.emit(Page.Events.Response, event));
    this._networkManager.on(NetworkManager.Events.RequestFailed, event => this.emit(Page.Events.RequestFailed, event));
    this._networkManager.on(NetworkManager.Events.RequestFinished, event => this.emit(Page.Events.RequestFinished, event));

    client.on('Page.domContentEventFired', event => this.emit(Page.Events.DOMContentLoaded));
    client.on('Page.loadEventFired', event => this.emit(Page.Events.Load));
    client.on('Runtime.consoleAPICalled', event => this._onConsoleAPI(event));
    client.on('Page.javascriptDialogOpening', event => this._onDialog(event));
    client.on('Runtime.exceptionThrown', exception => this._handleException(exception.exceptionDetails));
    client.on('Security.certificateError', event => this._onCertificateError(event));
    client.on('Inspector.targetCrashed', event => this._onTargetCrashed());
    client.on('Performance.metrics', event => this._emitMetrics(event));
  }

  /**
   * @return {!Puppeteer.Target}
   */
  target() {
    return this._target;
  }

  _onTargetCrashed() {
    this.emit('error', new Error('Page crashed!'));
  }

  /**
   * @return {!Puppeteer.Frame}
   */
  mainFrame() {
    return this._frameManager.mainFrame();
  }

  /**
   * @return {!Keyboard}
   */
  get keyboard() {
    return this._keyboard;
  }

  /**
   * @return {!Touchscreen}
   */
  get touchscreen() {
    return this._touchscreen;
  }

  /**
   * @return {!Coverage}
   */
  get coverage() {
    return this._coverage;
  }

  /**
   * @param {string} selector
   */
  async tap(selector) {
    const handle = await this.$(selector);
    console.assert(handle, 'No node found for selector: ' + selector);
    await handle.tap();
    await handle.dispose();
  }

  /**
   * @return {!Tracing}
   */
  get tracing() {
    return this._tracing;
  }

  /**
   * @return {!Array<Puppeteer.Frame>}
   */
  frames() {
    return this._frameManager.frames();
  }

  /**
   * @param {boolean} value
   */
  async setRequestInterception(value) {
    return this._networkManager.setRequestInterception(value);
  }

  /**
   * @param {boolean} enabled
   */
  setOfflineMode(enabled) {
    return this._networkManager.setOfflineMode(enabled);
  }

  /**
   * @param {number} timeout
   */
  setDefaultNavigationTimeout(timeout) {
    this._defaultNavigationTimeout = timeout;
  }

  /**
   * @param {!Object} event
   */
  _onCertificateError(event) {
    if (!this._ignoreHTTPSErrors)
      return;
    this._client.send('Security.handleCertificateError', {
      eventId: event.eventId,
      action: 'continue'
    }).catch(debugError);
  }

  /**
   * @param {string} selector
   * @return {!Promise<?Puppeteer.ElementHandle>}
   */
  async $(selector) {
    return this.mainFrame().$(selector);
  }

  /**
   * @param {function()|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<!Puppeteer.JSHandle>}
   */
  async evaluateHandle(pageFunction, ...args) {
    const context = await this.mainFrame().executionContext();
    return context.evaluateHandle(pageFunction, ...args);
  }

  /**
   * @param {!Puppeteer.JSHandle} prototypeHandle
   * @return {!Promise<!Puppeteer.JSHandle>}
   */
  async queryObjects(prototypeHandle) {
    const context = await this.mainFrame().executionContext();
    return context.queryObjects(prototypeHandle);
  }

  /**
   * @param {string} selector
   * @param {function()|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<(!Object|undefined)>}
   */
  async $eval(selector, pageFunction, ...args) {
    return this.mainFrame().$eval(selector, pageFunction, ...args);
  }

  /**
   * @param {string} selector
   * @param {Function|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<(!Object|undefined)>}
   */
  async $$eval(selector, pageFunction, ...args) {
    return this.mainFrame().$$eval(selector, pageFunction, ...args);
  }

  /**
   * @param {string} selector
   * @return {!Promise<!Array<!Puppeteer.ElementHandle>>}
   */
  async $$(selector) {
    return this.mainFrame().$$(selector);
  }

  /**
   * @param {string} expression
   * @return {!Promise<!Array<!Puppeteer.ElementHandle>>}
   */
  async $x(expression) {
    return this.mainFrame().$x(expression);
  }

  /**
   * @param {!Array<string>} urls
   * @return {!Promise<!Array<Network.Cookie>>}
   */
  async cookies(...urls) {
    return (await this._client.send('Network.getCookies', {
      urls: urls.length ? urls : [this.url()]
    })).cookies;
  }

  /**
   * @param {Array<Network.CookieParam>} cookies
   */
  async deleteCookie(...cookies) {
    const pageURL = this.url();
    for (const cookie of cookies) {
      const item = Object.assign({}, cookie);
      if (!cookie.url && pageURL.startsWith('http'))
        item.url = pageURL;
      await this._client.send('Network.deleteCookies', item);
    }
  }

  /**
   * @param {Array<Network.CookieParam>} cookies
   */
  async setCookie(...cookies) {
    const pageURL = this.url();
    const startsWithHTTP = pageURL.startsWith('http');
    const items = cookies.map(cookie => {
      const item = Object.assign({}, cookie);
      if (!item.url && startsWithHTTP)
        item.url = pageURL;
      console.assert(
          item.url !== 'about:blank',
          `Blank page can not have cookie "${item.name}"`
      );
      console.assert(
          !String.prototype.startsWith.call(item.url || '', 'data:'),
          `Data URL page can not have cookie "${item.name}"`
      );
      return item;
    });
    await this.deleteCookie(...items);
    if (items.length)
      await this._client.send('Network.setCookies', { cookies: items });
  }

  /**
   * @param {Object} options
   * @return {!Promise<!Puppeteer.ElementHandle>}
   */
  async addScriptTag(options) {
    return this.mainFrame().addScriptTag(options);
  }

  /**
   * @param {Object} options
   * @return {!Promise<!Puppeteer.ElementHandle>}
   */
  async addStyleTag(options) {
    return this.mainFrame().addStyleTag(options);
  }

  /**
   * @param {string} name
   * @param {function(?)} puppeteerFunction
   */
  async exposeFunction(name, puppeteerFunction) {
    if (this._pageBindings[name])
      throw new Error(`Failed to add page binding with name ${name}: window['${name}'] already exists!`);
    this._pageBindings[name] = puppeteerFunction;

    const expression = helper.evaluationString(addPageBinding, name);
    await this._client.send('Page.addScriptToEvaluateOnNewDocument', {source: expression});
    await Promise.all(this.frames().map(frame => frame.evaluate(expression).catch(debugError)));

    function addPageBinding(bindingName) {
      window[bindingName] = async(...args) => {
        const me = window[bindingName];
        let callbacks = me['callbacks'];
        if (!callbacks) {
          callbacks = new Map();
          me['callbacks'] = callbacks;
        }
        const seq = (me['lastSeq'] || 0) + 1;
        me['lastSeq'] = seq;
        const promise = new Promise(fulfill => callbacks.set(seq, fulfill));
        // eslint-disable-next-line no-console
        console.debug('driver:page-binding', JSON.stringify({name: bindingName, seq, args}));
        return promise;
      };
    }
  }

  /**
   * @param {?{username: string, password: string}} credentials
   */
  async authenticate(credentials) {
    return this._networkManager.authenticate(credentials);
  }

  /**
   * @param {!Object<string, string>} headers
   */
  async setExtraHTTPHeaders(headers) {
    return this._networkManager.setExtraHTTPHeaders(headers);
  }

  /**
   * @param {string} userAgent
   */
  async setUserAgent(userAgent) {
    return this._networkManager.setUserAgent(userAgent);
  }

  /**
   * @return {!Promise<!Object>}
   */
  async metrics() {
    const response = await this._client.send('Performance.getMetrics');
    return this._buildMetricsObject(response.metrics);
  }

  /**
   * @param {*} event
   */
  _emitMetrics(event) {
    this.emit(Page.Events.Metrics, {
      title: event.title,
      metrics: this._buildMetricsObject(event.metrics)
    });
  }

  /**
   * @param {?Array<!{name: string, value: number}>} metrics
   * @return {!Object}
   */
  _buildMetricsObject(metrics) {
    const result = {};
    for (const metric of metrics || []) {
      if (supportedMetrics.has(metric.name))
        result[metric.name] = metric.value;
    }
    return result;
  }

  /**
   * @param {!Object} exceptionDetails
   */
  _handleException(exceptionDetails) {
    const message = helper.getExceptionMessage(exceptionDetails);
    this.emit(Page.Events.PageError, new Error(message));
  }

  async _onConsoleAPI(event) {
    if (event.type === 'debug' && event.args.length && event.args[0].value === 'driver:page-binding') {
      const {name, seq, args} = JSON.parse(event.args[1].value);
      const result = await this._pageBindings[name](...args);
      const expression = helper.evaluationString(deliverResult, name, seq, result);
      this._client.send('Runtime.evaluate', { expression, contextId: event.executionContextId }).catch(debugError);

      function deliverResult(name, seq, result) {
        window[name]['callbacks'].get(seq)(result);
        window[name]['callbacks'].delete(seq);
      }
      return;
    }
    if (!this.listenerCount(Page.Events.Console)) {
      event.args.map(arg => helper.releaseObject(this._client, arg));
      return;
    }
    const values = event.args.map(arg => this._frameManager.createJSHandle(event.executionContextId, arg));
    const textTokens = [];
    for (let i = 0; i < event.args.length; ++i) {
      const remoteObject = event.args[i];
      if (remoteObject.objectId)
        textTokens.push(values[i].toString());
      else
        textTokens.push(helper.valueFromRemoteObject(remoteObject));
    }
    const message = new ConsoleMessage(event.type, textTokens.join(' '), values);
    this.emit(Page.Events.Console, message);
  }

  _onDialog(event) {
    let dialogType = null;
    if (event.type === 'alert')
      dialogType = Dialog.Type.Alert;
    else if (event.type === 'confirm')
      dialogType = Dialog.Type.Confirm;
    else if (event.type === 'prompt')
      dialogType = Dialog.Type.Prompt;
    else if (event.type === 'beforeunload')
      dialogType = Dialog.Type.BeforeUnload;
    console.assert(dialogType, 'Unknown javascript dialog type: ' + event.type);
    const dialog = new Dialog(this._client, dialogType, event.message, event.defaultPrompt);
    this.emit(Page.Events.Dialog, dialog);
  }

  /**
   * @return {!string}
   */
  url() {
    return this.mainFrame().url();
  }

  /**
   * @return {!Promise<String>}
   */
  async content() {
    return await this._frameManager.mainFrame().content();
  }

  /**
   * @param {string} html
   */
  async setContent(html) {
    await this._frameManager.mainFrame().setContent(html);
  }

  /**
   * @param {string} url
   * @param {!Object=} options
   * @return {!Promise<?Response>}
   */
  async goto(url, options = {}) {
    const referrer = this._networkManager.extraHTTPHeaders()['referer'];

    const requests = new Map();
    const eventListeners = [
      helper.addEventListener(this._networkManager, NetworkManager.Events.Request, request => {
        if (!requests.get(request.url()))
          requests.set(request.url(), request);
      })
    ];

    const mainFrame = this._frameManager.mainFrame();
    const timeout = typeof options.timeout === 'number' ? options.timeout : this._defaultNavigationTimeout;
    const watcher = new NavigatorWatcher(this._frameManager, mainFrame, timeout, options);
    const navigationPromise = watcher.navigationPromise();
    let error = await Promise.race([
      navigate(this._client, url, referrer),
      navigationPromise,
    ]);
    if (!error)
      error = await navigationPromise;
    watcher.cancel();
    helper.removeEventListeners(eventListeners);
    if (error)
      throw error;
    const request = requests.get(this.mainFrame().url());
    return request ? request.response() : null;

    /**
     * @param {!Puppeteer.CDPSession} client
     * @param {string} url
     * @param {string} referrer
     * @return {!Promise<?Error>}
     */
    async function navigate(client, url, referrer) {
      try {
        const response = await client.send('Page.navigate', {url, referrer});
        return response.errorText ? new Error(response.errorText) : null;
      } catch (error) {
        return error;
      }
    }
  }

  /**
   * @param {!Object=} options
   * @return {!Promise<?Response>}
   */
  async reload(options) {
    const [response] = await Promise.all([
      this.waitForNavigation(options),
      this._client.send('Page.reload')
    ]);
    return response;
  }

  /**
   * @param {!Object=} options
   * @return {!Promise<!Response>}
   */
  async waitForNavigation(options = {}) {
    const mainFrame = this._frameManager.mainFrame();
    const timeout = typeof options.timeout === 'number' ? options.timeout : this._defaultNavigationTimeout;
    const watcher = new NavigatorWatcher(this._frameManager, mainFrame, timeout, options);

    const responses = new Map();
    const listener = helper.addEventListener(this._networkManager, NetworkManager.Events.Response, response => responses.set(response.url(), response));
    const error = await watcher.navigationPromise();
    helper.removeEventListeners([listener]);
    if (error)
      throw error;
    return responses.get(this.mainFrame().url()) || null;
  }

  /**
   * @param {!Object=} options
   * @return {!Promise<?Response>}
   */
  async goBack(options) {
    return this._go(-1, options);
  }

  /**
   * @param {!Object=} options
   * @return {!Promise<?Response>}
   */
  async goForward(options) {
    return this._go(+1, options);
  }

  /**
   * @param {!Object=} options
   * @return {!Promise<?Response>}
   */
  async _go(delta, options) {
    const history = await this._client.send('Page.getNavigationHistory');
    const entry = history.entries[history.currentIndex + delta];
    if (!entry)
      return null;
    const [response] = await Promise.all([
      this.waitForNavigation(options),
      this._client.send('Page.navigateToHistoryEntry', {entryId: entry.id}),
    ]);
    return response;
  }

  async bringToFront() {
    await this._client.send('Page.bringToFront');
  }

  /**
   * @param {!Object} options
   */
  async emulate(options) {
    return Promise.all([
      this.setViewport(options.viewport),
      this.setUserAgent(options.userAgent)
    ]);
  }

  /**
   * @param {boolean} enabled
   */
  async setJavaScriptEnabled(enabled) {
    await this._client.send('Emulation.setScriptExecutionDisabled', { value: !enabled });
  }

  /**
   * @param {?string} mediaType
   */
  async emulateMedia(mediaType) {
    console.assert(mediaType === 'screen' || mediaType === 'print' || mediaType === null, 'Unsupported media type: ' + mediaType);
    await this._client.send('Emulation.setEmulatedMedia', {media: mediaType || ''});
  }

  /**
   * @param {!Page.Viewport} viewport
   */
  async setViewport(viewport) {
    const needsReload = await this._emulationManager.emulateViewport(this._client, viewport);
    this._viewport = viewport;
    if (needsReload)
      await this.reload();
  }

  /**
   * @return {!Page.Viewport}
   */
  viewport() {
    return this._viewport;
  }

  /**
   * @param {function()} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<*>}
   */
  async evaluate(pageFunction, ...args) {
    return this._frameManager.mainFrame().evaluate(pageFunction, ...args);
  }

  /**
   * @param {function()|string} pageFunction
   * @param {!Array<*>} args
   */
  async evaluateOnNewDocument(pageFunction, ...args) {
    const source = helper.evaluationString(pageFunction, ...args);
    await this._client.send('Page.addScriptToEvaluateOnNewDocument', { source });
  }

  /**
   * @param {!Object=} options
   * @return {!Promise<!Buffer>}
   */
  async screenshot(options = {}) {
    let screenshotType = null;
    // options.type takes precedence over inferring the type from options.path
    // because it may be a 0-length file with no extension created beforehand (i.e. as a temp file).
    if (options.type) {
      console.assert(options.type === 'png' || options.type === 'jpeg', 'Unknown options.type value: ' + options.type);
      screenshotType = options.type;
    } else if (options.path) {
      const mimeType = mime.lookup(options.path);
      if (mimeType === 'image/png')
        screenshotType = 'png';
      else if (mimeType === 'image/jpeg')
        screenshotType = 'jpeg';
      console.assert(screenshotType, 'Unsupported screenshot mime type: ' + mimeType);
    }

    if (!screenshotType)
      screenshotType = 'png';

    if (options.quality) {
      console.assert(screenshotType === 'jpeg', 'options.quality is unsupported for the ' + screenshotType + ' screenshots');
      console.assert(typeof options.quality === 'number', 'Expected options.quality to be a number but found ' + (typeof options.quality));
      console.assert(Number.isInteger(options.quality), 'Expected options.quality to be an integer');
      console.assert(options.quality >= 0 && options.quality <= 100, 'Expected options.quality to be between 0 and 100 (inclusive), got ' + options.quality);
    }
    console.assert(!options.clip || !options.fullPage, 'options.clip and options.fullPage are exclusive');
    if (options.clip) {
      console.assert(typeof options.clip.x === 'number', 'Expected options.clip.x to be a number but found ' + (typeof options.clip.x));
      console.assert(typeof options.clip.y === 'number', 'Expected options.clip.y to be a number but found ' + (typeof options.clip.y));
      console.assert(typeof options.clip.width === 'number', 'Expected options.clip.width to be a number but found ' + (typeof options.clip.width));
      console.assert(typeof options.clip.height === 'number', 'Expected options.clip.height to be a number but found ' + (typeof options.clip.height));
    }
    return this._screenshotTaskQueue.postTask(this._screenshotTask.bind(this, screenshotType, options));
  }

  /**
   * @param {string} format
   * @param {!Object=} options
   * @return {!Promise<!Buffer>}
   */
  async _screenshotTask(format, options) {
    await this._client.send('Target.activateTarget', {targetId: this._target._targetId});
    let clip = options.clip ? Object.assign({}, options['clip']) : undefined;
    if (clip)
      clip.scale = 1;

    if (options.fullPage) {
      const metrics = await this._client.send('Page.getLayoutMetrics');
      const width = Math.ceil(metrics.contentSize.width);
      const height = Math.ceil(metrics.contentSize.height);

      // Overwrite clip for full page at all times.
      clip = { x: 0, y: 0, width, height, scale: 1 };
      const mobile = this._viewport.isMobile || false;
      const deviceScaleFactor = this._viewport.deviceScaleFactor || 1;
      const landscape = this._viewport.isLandscape || false;
      const screenOrientation = landscape ? { angle: 90, type: 'landscapePrimary' } : { angle: 0, type: 'portraitPrimary' };
      await this._client.send('Emulation.setDeviceMetricsOverride', { mobile, width, height, deviceScaleFactor, screenOrientation });
    }

    if (options.omitBackground)
      await this._client.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    const result = await this._client.send('Page.captureScreenshot', { format, quality: options.quality, clip });
    if (options.omitBackground)
      await this._client.send('Emulation.setDefaultBackgroundColorOverride');

    if (options.fullPage)
      await this.setViewport(this._viewport);

    const buffer = new Buffer(result.data, 'base64');
    if (options.path)
      await writeFileAsync(options.path, buffer);
    return buffer;
  }

  /**
   * @param {!Object=} options
   * @return {!Promise<!Buffer>}
   */
  async pdf(options = {}) {
    const scale = options.scale || 1;
    const displayHeaderFooter = !!options.displayHeaderFooter;
    const headerTemplate = options.headerTemplate || '';
    const footerTemplate = options.footerTemplate || '';
    const printBackground = !!options.printBackground;
    const landscape = !!options.landscape;
    const pageRanges = options.pageRanges || '';

    let paperWidth = 8.5;
    let paperHeight = 11;
    if (options.format) {
      const format = Page.PaperFormats[options.format.toLowerCase()];
      console.assert(format, 'Unknown paper format: ' + options.format);
      paperWidth = format.width;
      paperHeight = format.height;
    } else {
      paperWidth = convertPrintParameterToInches(options.width) || paperWidth;
      paperHeight = convertPrintParameterToInches(options.height) || paperHeight;
    }

    const marginOptions = options.margin || {};
    const marginTop = convertPrintParameterToInches(marginOptions.top) || 0;
    const marginLeft = convertPrintParameterToInches(marginOptions.left) || 0;
    const marginBottom = convertPrintParameterToInches(marginOptions.bottom) || 0;
    const marginRight = convertPrintParameterToInches(marginOptions.right) || 0;

    const result = await this._client.send('Page.printToPDF', {
      landscape: landscape,
      displayHeaderFooter: displayHeaderFooter,
      headerTemplate: headerTemplate,
      footerTemplate: footerTemplate,
      printBackground: printBackground,
      scale: scale,
      paperWidth: paperWidth,
      paperHeight: paperHeight,
      marginTop: marginTop,
      marginBottom: marginBottom,
      marginLeft: marginLeft,
      marginRight: marginRight,
      pageRanges: pageRanges
    });
    const buffer = new Buffer(result.data, 'base64');
    if (options.path)
      await writeFileAsync(options.path, buffer);
    return buffer;
  }

  /**
   * @return {!Promise<string>}
   */
  async title() {
    return this.mainFrame().title();
  }

  async close() {
    console.assert(!!this._client._connection, 'Protocol error: Connection closed. Most likely the page has been closed.');
    await this._client._connection.send('Target.closeTarget', {targetId: this._target._targetId});
  }

  /**
   * @return {!Mouse}
   */
  get mouse() {
    return this._mouse;
  }

  /**
   * @param {string} selector
   * @param {!Object=} options
   */
  async click(selector, options = {}) {
    const handle = await this.$(selector);
    console.assert(handle, 'No node found for selector: ' + selector);
    await handle.click(options);
    await handle.dispose();
  }

  /**
   * @param {string} selector
   */
  async hover(selector) {
    const handle = await this.$(selector);
    console.assert(handle, 'No node found for selector: ' + selector);
    await handle.hover();
    await handle.dispose();
  }

  /**
   * @param {string} selector
   */
  async focus(selector) {
    const handle = await this.$(selector);
    console.assert(handle, 'No node found for selector: ' + selector);
    await handle.focus();
    await handle.dispose();
  }

  /**
   * @param {string} selector
   * @param {!Array<string>} values
   * @return {!Promise<!Array<string>>}
   */
  async select(selector, ...values) {
    return this.mainFrame().select(selector, ...values);
  }

  /**
   * @param {string} selector
   * @param {string} text
   * @param {{delay: (number|undefined)}=} options
   */
  async type(selector, text, options) {
    const handle = await this.$(selector);
    console.assert(handle, 'No node found for selector: ' + selector);
    await handle.type(text, options);
    await handle.dispose();
  }

  /**
   * @param {(string|number|Function)} selectorOrFunctionOrTimeout
   * @param {!Object=} options
   * @param {!Array<*>} args
   * @return {!Promise}
   */
  waitFor(selectorOrFunctionOrTimeout, options = {}, ...args) {
    return this.mainFrame().waitFor(selectorOrFunctionOrTimeout, options, ...args);
  }

  /**
   * @param {string} selector
   * @param {!Object=} options
   * @return {!Promise}
   */
  waitForSelector(selector, options = {}) {
    return this.mainFrame().waitForSelector(selector, options);
  }

  /**
   * @param {string} xpath
   * @param {!Object=} options
   * @return {!Promise}
   */
  waitForXPath(xpath, options = {}) {
    return this.mainFrame().waitForXPath(xpath, options);
  }

  /**
   * @param {function()} pageFunction
   * @param {!Object=} options
   * @param {!Array<*>} args
   * @return {!Promise}
   */
  waitForFunction(pageFunction, options = {}, ...args) {
    return this.mainFrame().waitForFunction(pageFunction, options, ...args);
  }
}

/** @type {!Set<string>} */
const supportedMetrics = new Set([
  'Timestamp',
  'Documents',
  'Frames',
  'JSEventListeners',
  'Nodes',
  'LayoutCount',
  'RecalcStyleCount',
  'LayoutDuration',
  'RecalcStyleDuration',
  'ScriptDuration',
  'TaskDuration',
  'JSHeapUsedSize',
  'JSHeapTotalSize',
]);

/** @enum {string} */
Page.PaperFormats = {
  letter: {width: 8.5, height: 11},
  legal: {width: 8.5, height: 14},
  tabloid: {width: 11, height: 17},
  ledger: {width: 17, height: 11},
  a0: {width: 33.1, height: 46.8 },
  a1: {width: 23.4, height: 33.1 },
  a2: {width: 16.5, height: 23.4 },
  a3: {width: 11.7, height: 16.5 },
  a4: {width: 8.27, height: 11.7 },
  a5: {width: 5.83, height: 8.27 },
  a6: {width: 4.13, height: 5.83 },
};

const unitToPixels = {
  'px': 1,
  'in': 96,
  'cm': 37.8,
  'mm': 3.78
};

/**
 * @param {(string|number|undefined)} parameter
 * @return {(number|undefined)}
 */
function convertPrintParameterToInches(parameter) {
  if (typeof parameter === 'undefined')
    return undefined;
  let pixels;
  if (helper.isNumber(parameter)) {
    // Treat numbers as pixel values to be aligned with phantom's paperSize.
    pixels = /** @type {number} */ (parameter);
  } else if (helper.isString(parameter)) {
    const text = /** @type {string} */ (parameter);
    let unit = text.substring(text.length - 2).toLowerCase();
    let valueText = '';
    if (unitToPixels.hasOwnProperty(unit)) {
      valueText = text.substring(0, text.length - 2);
    } else {
      // In case of unknown unit try to parse the whole parameter as number of pixels.
      // This is consistent with phantom's paperSize behavior.
      unit = 'px';
      valueText = text;
    }
    const value = Number(valueText);
    console.assert(!isNaN(value), 'Failed to parse parameter value: ' + text);
    pixels = value * unitToPixels[unit];
  } else {
    throw new Error('page.pdf() Cannot handle parameter type: ' + (typeof parameter));
  }
  return pixels / 96;
}

Page.Events = {
  Console: 'console',
  Dialog: 'dialog',
  DOMContentLoaded: 'domcontentloaded',
  Error: 'error',
  // Can't use just 'error' due to node.js special treatment of error events.
  // @see https://nodejs.org/api/events.html#events_error_events
  PageError: 'pageerror',
  Request: 'request',
  Response: 'response',
  RequestFailed: 'requestfailed',
  RequestFinished: 'requestfinished',
  FrameAttached: 'frameattached',
  FrameDetached: 'framedetached',
  FrameNavigated: 'framenavigated',
  Load: 'load',
  Metrics: 'metrics',
};

/**
 * @typedef {Object} Page.Viewport
 * @property {number} width
 * @property {number} height
 * @property {number=} deviceScaleFactor
 * @property {boolean=} isMobile
 * @property {boolean=} isLandscape
 * @property {boolean=} hasTouch
 */

/**
 * @typedef {Object} Network.Cookie
 * @property {string} name
 * @property {string} value
 * @property {string} domain
 * @property {string} path
 * @property {number} expires
 * @property {number} size
 * @property {boolean} httpOnly
 * @property {boolean} secure
 * @property {boolean} session
 * @property {("Strict"|"Lax")=} sameSite
 */


/**
 * @typedef {Object} Network.CookieParam
 * @property {string} name
 * @property {string=} value
 * @property {string=} url
 * @property {string=} domain
 * @property {string=} path
 * @property {number=} expires
 * @property {boolean=} httpOnly
 * @property {boolean=} secure
 * @property {("Strict"|"Lax")=} sameSite
 */

class ConsoleMessage {
  /**
   * @param {string} type
   * @param {string} text
   * @param {!Array<*>} args
   */
  constructor(type, text, args) {
    this._type = type;
    this._text = text;
    this._args = args;
  }

  /**
   * @return {string}
   */
  type() {
    return this._type;
  }

  /**
   * @return {string}
   */
  text() {
    return this._text;
  }

  /**
   * @return {!Array<string>}
   */
  args() {
    return this._args;
  }
}


module.exports = Page;
helper.tracePublicAPI(Page);
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
const {helper} = require('./helper');
const Launcher = require('./Launcher');

class Puppeteer {
  /**
   * @param {!Object=} options
   * @return {!Promise<!Puppeteer.Browser>}
   */
  static launch(options) {
    return Launcher.launch(options);
  }

  /**
   * @param {{browserWSEndpoint: string, ignoreHTTPSErrors: boolean}} options
   * @return {!Promise<!Puppeteer.Browser>}
   */
  static connect(options) {
    return Launcher.connect(options);
  }

  /**
   * @return {string}
   */
  static executablePath() {
    return Launcher.executablePath();
  }

  /**
   * @return {!Array<string>}
   */
  static defaultArgs() {
    return Launcher.defaultArgs();
  }
}

module.exports = Puppeteer;
helper.tracePublicAPI(Puppeteer);
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
const {helper} = require('./helper');
const fs = require('fs');

const openAsync = helper.promisify(fs.open);
const writeAsync = helper.promisify(fs.write);
const closeAsync = helper.promisify(fs.close);

class Tracing {
  /**
   * @param {!Puppeteer.CDPSession} client
   */
  constructor(client) {
    this._client = client;
    this._recording = false;
    this._path = '';
  }

  /**
   * @param {!Object} options
   */
  async start(options) {
    console.assert(!this._recording, 'Cannot start recording trace while already recording trace.');
    console.assert(options.path, 'Must specify a path to write trace file to.');

    const defaultCategories = [
      '-*', 'devtools.timeline', 'v8.execute', 'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame', 'toplevel',
      'blink.console', 'blink.user_timing', 'latencyInfo', 'disabled-by-default-devtools.timeline.stack',
      'disabled-by-default-v8.cpu_profiler'
    ];
    const categoriesArray = options.categories || defaultCategories;

    if (options.screenshots)
      categoriesArray.push('disabled-by-default-devtools.screenshot');

    this._path = options.path;
    this._recording = true;
    await this._client.send('Tracing.start', {
      transferMode: 'ReturnAsStream',
      categories: categoriesArray.join(',')
    });
  }

  async stop() {
    let fulfill;
    const contentPromise = new Promise(x => fulfill = x);
    this._client.once('Tracing.tracingComplete', event => {
      this._readStream(event.stream, this._path).then(fulfill);
    });
    await this._client.send('Tracing.end');
    this._recording = false;
    return contentPromise;
  }

  /**
   * @param {string} handle
   * @param {string} path
   */
  async _readStream(handle, path) {
    let eof = false;
    const file = await openAsync(path, 'w');
    while (!eof) {
      const response = await this._client.send('IO.read', {handle});
      eof = response.eof;
      if (path)
        await writeAsync(file, response.data);
    }
    await closeAsync(file);
    await this._client.send('IO.close', {handle});
  }
}
helper.tracePublicAPI(Tracing);

module.exports = Tracing;
/**
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @typedef {Object} KeyDefinition
 * @property {number=} keyCode
 * @property {number=} shiftKeyCode
 * @property {string=} key
 * @property {string=} shiftKey
 * @property {string=} code
 * @property {string=} text
 * @property {string=} shiftText
 * @property {number=} location
 */

/**
 * @type {Object<string, KeyDefinition>}
 */
module.exports = {
  '0': {'keyCode': 48, 'key': '0', 'code': 'Digit0'},
  '1': {'keyCode': 49, 'key': '1', 'code': 'Digit1'},
  '2': {'keyCode': 50, 'key': '2', 'code': 'Digit2'},
  '3': {'keyCode': 51, 'key': '3', 'code': 'Digit3'},
  '4': {'keyCode': 52, 'key': '4', 'code': 'Digit4'},
  '5': {'keyCode': 53, 'key': '5', 'code': 'Digit5'},
  '6': {'keyCode': 54, 'key': '6', 'code': 'Digit6'},
  '7': {'keyCode': 55, 'key': '7', 'code': 'Digit7'},
  '8': {'keyCode': 56, 'key': '8', 'code': 'Digit8'},
  '9': {'keyCode': 57, 'key': '9', 'code': 'Digit9'},
  'Power': {'key': 'Power', 'code': 'Power'},
  'Eject': {'key': 'Eject', 'code': 'Eject'},
  'Abort': {'keyCode': 3, 'code': 'Abort', 'key': 'Cancel'},
  'Help': {'keyCode': 6, 'code': 'Help', 'key': 'Help'},
  'Backspace': {'keyCode': 8, 'code': 'Backspace', 'key': 'Backspace'},
  'Tab': {'keyCode': 9, 'code': 'Tab', 'key': 'Tab'},
  'Numpad5': {'keyCode': 12, 'shiftKeyCode': 101, 'key': 'Clear', 'code': 'Numpad5', 'shiftKey': '5', 'location': 3},
  'NumpadEnter': {'keyCode': 13, 'code': 'NumpadEnter', 'key': 'Enter', 'text': '\r', 'location': 3},
  'Enter': {'keyCode': 13, 'code': 'Enter', 'key': 'Enter', 'text': '\r'},
  '\r': {'keyCode': 13, 'code': 'Enter', 'key': 'Enter', 'text': '\r'},
  '\n': {'keyCode': 13, 'code': 'Enter', 'key': 'Enter', 'text': '\r'},
  'ShiftLeft': {'keyCode': 16, 'code': 'ShiftLeft', 'key': 'Shift', 'location': 1},
  'ShiftRight': {'keyCode': 16, 'code': 'ShiftRight', 'key': 'Shift', 'location': 2},
  'ControlLeft': {'keyCode': 17, 'code': 'ControlLeft', 'key': 'Control', 'location': 1},
  'ControlRight': {'keyCode': 17, 'code': 'ControlRight', 'key': 'Control', 'location': 2},
  'AltLeft': {'keyCode': 18, 'code': 'AltLeft', 'key': 'Alt', 'location': 1},
  'AltRight': {'keyCode': 18, 'code': 'AltRight', 'key': 'Alt', 'location': 2},
  'Pause': {'keyCode': 19, 'code': 'Pause', 'key': 'Pause'},
  'CapsLock': {'keyCode': 20, 'code': 'CapsLock', 'key': 'CapsLock'},
  'Escape': {'keyCode': 27, 'code': 'Escape', 'key': 'Escape'},
  'Convert': {'keyCode': 28, 'code': 'Convert', 'key': 'Convert'},
  'NonConvert': {'keyCode': 29, 'code': 'NonConvert', 'key': 'NonConvert'},
  'Space': {'keyCode': 32, 'code': 'Space', 'key': ' '},
  'Numpad9': {'keyCode': 33, 'shiftKeyCode': 105, 'key': 'PageUp', 'code': 'Numpad9', 'shiftKey': '9', 'location': 3},
  'PageUp': {'keyCode': 33, 'code': 'PageUp', 'key': 'PageUp'},
  'Numpad3': {'keyCode': 34, 'shiftKeyCode': 99, 'key': 'PageDown', 'code': 'Numpad3', 'shiftKey': '3', 'location': 3},
  'PageDown': {'keyCode': 34, 'code': 'PageDown', 'key': 'PageDown'},
  'End': {'keyCode': 35, 'code': 'End', 'key': 'End'},
  'Numpad1': {'keyCode': 35, 'shiftKeyCode': 97, 'key': 'End', 'code': 'Numpad1', 'shiftKey': '1', 'location': 3},
  'Home': {'keyCode': 36, 'code': 'Home', 'key': 'Home'},
  'Numpad7': {'keyCode': 36, 'shiftKeyCode': 103, 'key': 'Home', 'code': 'Numpad7', 'shiftKey': '7', 'location': 3},
  'ArrowLeft': {'keyCode': 37, 'code': 'ArrowLeft', 'key': 'ArrowLeft'},
  'Numpad4': {'keyCode': 37, 'shiftKeyCode': 100, 'key': 'ArrowLeft', 'code': 'Numpad4', 'shiftKey': '4', 'location': 3},
  'Numpad8': {'keyCode': 38, 'shiftKeyCode': 104, 'key': 'ArrowUp', 'code': 'Numpad8', 'shiftKey': '8', 'location': 3},
  'ArrowUp': {'keyCode': 38, 'code': 'ArrowUp', 'key': 'ArrowUp'},
  'ArrowRight': {'keyCode': 39, 'code': 'ArrowRight', 'key': 'ArrowRight'},
  'Numpad6': {'keyCode': 39, 'shiftKeyCode': 102, 'key': 'ArrowRight', 'code': 'Numpad6', 'shiftKey': '6', 'location': 3},
  'Numpad2': {'keyCode': 40, 'shiftKeyCode': 98, 'key': 'ArrowDown', 'code': 'Numpad2', 'shiftKey': '2', 'location': 3},
  'ArrowDown': {'keyCode': 40, 'code': 'ArrowDown', 'key': 'ArrowDown'},
  'Select': {'keyCode': 41, 'code': 'Select', 'key': 'Select'},
  'Open': {'keyCode': 43, 'code': 'Open', 'key': 'Execute'},
  'PrintScreen': {'keyCode': 44, 'code': 'PrintScreen', 'key': 'PrintScreen'},
  'Insert': {'keyCode': 45, 'code': 'Insert', 'key': 'Insert'},
  'Numpad0': {'keyCode': 45, 'shiftKeyCode': 96, 'key': 'Insert', 'code': 'Numpad0', 'shiftKey': '0', 'location': 3},
  'Delete': {'keyCode': 46, 'code': 'Delete', 'key': 'Delete'},
  'NumpadDecimal': {'keyCode': 46, 'shiftKeyCode': 110, 'code': 'NumpadDecimal', 'key': '\u0000', 'shiftKey': '.', 'location': 3},
  'Digit0': {'keyCode': 48, 'code': 'Digit0', 'shiftKey': ')', 'key': '0'},
  'Digit1': {'keyCode': 49, 'code': 'Digit1', 'shiftKey': '!', 'key': '1'},
  'Digit2': {'keyCode': 50, 'code': 'Digit2', 'shiftKey': '@', 'key': '2'},
  'Digit3': {'keyCode': 51, 'code': 'Digit3', 'shiftKey': '#', 'key': '3'},
  'Digit4': {'keyCode': 52, 'code': 'Digit4', 'shiftKey': '$', 'key': '4'},
  'Digit5': {'keyCode': 53, 'code': 'Digit5', 'shiftKey': '%', 'key': '5'},
  'Digit6': {'keyCode': 54, 'code': 'Digit6', 'shiftKey': '^', 'key': '6'},
  'Digit7': {'keyCode': 55, 'code': 'Digit7', 'shiftKey': '&', 'key': '7'},
  'Digit8': {'keyCode': 56, 'code': 'Digit8', 'shiftKey': '*', 'key': '8'},
  'Digit9': {'keyCode': 57, 'code': 'Digit9', 'shiftKey': '\(', 'key': '9'},
  'KeyA': {'keyCode': 65, 'code': 'KeyA', 'shiftKey': 'A', 'key': 'a'},
  'KeyB': {'keyCode': 66, 'code': 'KeyB', 'shiftKey': 'B', 'key': 'b'},
  'KeyC': {'keyCode': 67, 'code': 'KeyC', 'shiftKey': 'C', 'key': 'c'},
  'KeyD': {'keyCode': 68, 'code': 'KeyD', 'shiftKey': 'D', 'key': 'd'},
  'KeyE': {'keyCode': 69, 'code': 'KeyE', 'shiftKey': 'E', 'key': 'e'},
  'KeyF': {'keyCode': 70, 'code': 'KeyF', 'shiftKey': 'F', 'key': 'f'},
  'KeyG': {'keyCode': 71, 'code': 'KeyG', 'shiftKey': 'G', 'key': 'g'},
  'KeyH': {'keyCode': 72, 'code': 'KeyH', 'shiftKey': 'H', 'key': 'h'},
  'KeyI': {'keyCode': 73, 'code': 'KeyI', 'shiftKey': 'I', 'key': 'i'},
  'KeyJ': {'keyCode': 74, 'code': 'KeyJ', 'shiftKey': 'J', 'key': 'j'},
  'KeyK': {'keyCode': 75, 'code': 'KeyK', 'shiftKey': 'K', 'key': 'k'},
  'KeyL': {'keyCode': 76, 'code': 'KeyL', 'shiftKey': 'L', 'key': 'l'},
  'KeyM': {'keyCode': 77, 'code': 'KeyM', 'shiftKey': 'M', 'key': 'm'},
  'KeyN': {'keyCode': 78, 'code': 'KeyN', 'shiftKey': 'N', 'key': 'n'},
  'KeyO': {'keyCode': 79, 'code': 'KeyO', 'shiftKey': 'O', 'key': 'o'},
  'KeyP': {'keyCode': 80, 'code': 'KeyP', 'shiftKey': 'P', 'key': 'p'},
  'KeyQ': {'keyCode': 81, 'code': 'KeyQ', 'shiftKey': 'Q', 'key': 'q'},
  'KeyR': {'keyCode': 82, 'code': 'KeyR', 'shiftKey': 'R', 'key': 'r'},
  'KeyS': {'keyCode': 83, 'code': 'KeyS', 'shiftKey': 'S', 'key': 's'},
  'KeyT': {'keyCode': 84, 'code': 'KeyT', 'shiftKey': 'T', 'key': 't'},
  'KeyU': {'keyCode': 85, 'code': 'KeyU', 'shiftKey': 'U', 'key': 'u'},
  'KeyV': {'keyCode': 86, 'code': 'KeyV', 'shiftKey': 'V', 'key': 'v'},
  'KeyW': {'keyCode': 87, 'code': 'KeyW', 'shiftKey': 'W', 'key': 'w'},
  'KeyX': {'keyCode': 88, 'code': 'KeyX', 'shiftKey': 'X', 'key': 'x'},
  'KeyY': {'keyCode': 89, 'code': 'KeyY', 'shiftKey': 'Y', 'key': 'y'},
  'KeyZ': {'keyCode': 90, 'code': 'KeyZ', 'shiftKey': 'Z', 'key': 'z'},
  'MetaLeft': {'keyCode': 91, 'code': 'MetaLeft', 'key': 'Meta'},
  'MetaRight': {'keyCode': 92, 'code': 'MetaRight', 'key': 'Meta'},
  'ContextMenu': {'keyCode': 93, 'code': 'ContextMenu', 'key': 'ContextMenu'},
  'NumpadMultiply': {'keyCode': 106, 'code': 'NumpadMultiply', 'key': '*', 'location': 3},
  'NumpadAdd': {'keyCode': 107, 'code': 'NumpadAdd', 'key': '+', 'location': 3},
  'NumpadSubtract': {'keyCode': 109, 'code': 'NumpadSubtract', 'key': '-', 'location': 3},
  'NumpadDivide': {'keyCode': 111, 'code': 'NumpadDivide', 'key': '/', 'location': 3},
  'F1': {'keyCode': 112, 'code': 'F1', 'key': 'F1'},
  'F2': {'keyCode': 113, 'code': 'F2', 'key': 'F2'},
  'F3': {'keyCode': 114, 'code': 'F3', 'key': 'F3'},
  'F4': {'keyCode': 115, 'code': 'F4', 'key': 'F4'},
  'F5': {'keyCode': 116, 'code': 'F5', 'key': 'F5'},
  'F6': {'keyCode': 117, 'code': 'F6', 'key': 'F6'},
  'F7': {'keyCode': 118, 'code': 'F7', 'key': 'F7'},
  'F8': {'keyCode': 119, 'code': 'F8', 'key': 'F8'},
  'F9': {'keyCode': 120, 'code': 'F9', 'key': 'F9'},
  'F10': {'keyCode': 121, 'code': 'F10', 'key': 'F10'},
  'F11': {'keyCode': 122, 'code': 'F11', 'key': 'F11'},
  'F12': {'keyCode': 123, 'code': 'F12', 'key': 'F12'},
  'F13': {'keyCode': 124, 'code': 'F13', 'key': 'F13'},
  'F14': {'keyCode': 125, 'code': 'F14', 'key': 'F14'},
  'F15': {'keyCode': 126, 'code': 'F15', 'key': 'F15'},
  'F16': {'keyCode': 127, 'code': 'F16', 'key': 'F16'},
  'F17': {'keyCode': 128, 'code': 'F17', 'key': 'F17'},
  'F18': {'keyCode': 129, 'code': 'F18', 'key': 'F18'},
  'F19': {'keyCode': 130, 'code': 'F19', 'key': 'F19'},
  'F20': {'keyCode': 131, 'code': 'F20', 'key': 'F20'},
  'F21': {'keyCode': 132, 'code': 'F21', 'key': 'F21'},
  'F22': {'keyCode': 133, 'code': 'F22', 'key': 'F22'},
  'F23': {'keyCode': 134, 'code': 'F23', 'key': 'F23'},
  'F24': {'keyCode': 135, 'code': 'F24', 'key': 'F24'},
  'NumLock': {'keyCode': 144, 'code': 'NumLock', 'key': 'NumLock'},
  'ScrollLock': {'keyCode': 145, 'code': 'ScrollLock', 'key': 'ScrollLock'},
  'AudioVolumeMute': {'keyCode': 173, 'code': 'AudioVolumeMute', 'key': 'AudioVolumeMute'},
  'AudioVolumeDown': {'keyCode': 174, 'code': 'AudioVolumeDown', 'key': 'AudioVolumeDown'},
  'AudioVolumeUp': {'keyCode': 175, 'code': 'AudioVolumeUp', 'key': 'AudioVolumeUp'},
  'MediaTrackNext': {'keyCode': 176, 'code': 'MediaTrackNext', 'key': 'MediaTrackNext'},
  'MediaTrackPrevious': {'keyCode': 177, 'code': 'MediaTrackPrevious', 'key': 'MediaTrackPrevious'},
  'MediaStop': {'keyCode': 178, 'code': 'MediaStop', 'key': 'MediaStop'},
  'MediaPlayPause': {'keyCode': 179, 'code': 'MediaPlayPause', 'key': 'MediaPlayPause'},
  'Semicolon': {'keyCode': 186, 'code': 'Semicolon', 'shiftKey': ':', 'key': ';'},
  'Equal': {'keyCode': 187, 'code': 'Equal', 'shiftKey': '+', 'key': '='},
  'NumpadEqual': {'keyCode': 187, 'code': 'NumpadEqual', 'key': '=', 'location': 3},
  'Comma': {'keyCode': 188, 'code': 'Comma', 'shiftKey': '\<', 'key': ','},
  'Minus': {'keyCode': 189, 'code': 'Minus', 'shiftKey': '_', 'key': '-'},
  'Period': {'keyCode': 190, 'code': 'Period', 'shiftKey': '>', 'key': '.'},
  'Slash': {'keyCode': 191, 'code': 'Slash', 'shiftKey': '?', 'key': '/'},
  'Backquote': {'keyCode': 192, 'code': 'Backquote', 'shiftKey': '~', 'key': '`'},
  'BracketLeft': {'keyCode': 219, 'code': 'BracketLeft', 'shiftKey': '{', 'key': '['},
  'Backslash': {'keyCode': 220, 'code': 'Backslash', 'shiftKey': '|', 'key': '\\'},
  'BracketRight': {'keyCode': 221, 'code': 'BracketRight', 'shiftKey': '}', 'key': ']'},
  'Quote': {'keyCode': 222, 'code': 'Quote', 'shiftKey': '"', 'key': '\''},
  'AltGraph': {'keyCode': 225, 'code': 'AltGraph', 'key': 'AltGraph'},
  'Props': {'keyCode': 247, 'code': 'Props', 'key': 'CrSel'},
  'Cancel': {'keyCode': 3, 'key': 'Cancel', 'code': 'Abort'},
  'Clear': {'keyCode': 12, 'key': 'Clear', 'code': 'Numpad5', 'location': 3},
  'Shift': {'keyCode': 16, 'key': 'Shift', 'code': 'ShiftLeft'},
  'Control': {'keyCode': 17, 'key': 'Control', 'code': 'ControlLeft'},
  'Alt': {'keyCode': 18, 'key': 'Alt', 'code': 'AltLeft'},
  'Accept': {'keyCode': 30, 'key': 'Accept'},
  'ModeChange': {'keyCode': 31, 'key': 'ModeChange'},
  ' ': {'keyCode': 32, 'key': ' ', 'code': 'Space'},
  'Print': {'keyCode': 42, 'key': 'Print'},
  'Execute': {'keyCode': 43, 'key': 'Execute', 'code': 'Open'},
  '\u0000': {'keyCode': 46, 'key': '\u0000', 'code': 'NumpadDecimal', 'location': 3},
  'a': {'keyCode': 65, 'key': 'a', 'code': 'KeyA'},
  'b': {'keyCode': 66, 'key': 'b', 'code': 'KeyB'},
  'c': {'keyCode': 67, 'key': 'c', 'code': 'KeyC'},
  'd': {'keyCode': 68, 'key': 'd', 'code': 'KeyD'},
  'e': {'keyCode': 69, 'key': 'e', 'code': 'KeyE'},
  'f': {'keyCode': 70, 'key': 'f', 'code': 'KeyF'},
  'g': {'keyCode': 71, 'key': 'g', 'code': 'KeyG'},
  'h': {'keyCode': 72, 'key': 'h', 'code': 'KeyH'},
  'i': {'keyCode': 73, 'key': 'i', 'code': 'KeyI'},
  'j': {'keyCode': 74, 'key': 'j', 'code': 'KeyJ'},
  'k': {'keyCode': 75, 'key': 'k', 'code': 'KeyK'},
  'l': {'keyCode': 76, 'key': 'l', 'code': 'KeyL'},
  'm': {'keyCode': 77, 'key': 'm', 'code': 'KeyM'},
  'n': {'keyCode': 78, 'key': 'n', 'code': 'KeyN'},
  'o': {'keyCode': 79, 'key': 'o', 'code': 'KeyO'},
  'p': {'keyCode': 80, 'key': 'p', 'code': 'KeyP'},
  'q': {'keyCode': 81, 'key': 'q', 'code': 'KeyQ'},
  'r': {'keyCode': 82, 'key': 'r', 'code': 'KeyR'},
  's': {'keyCode': 83, 'key': 's', 'code': 'KeyS'},
  't': {'keyCode': 84, 'key': 't', 'code': 'KeyT'},
  'u': {'keyCode': 85, 'key': 'u', 'code': 'KeyU'},
  'v': {'keyCode': 86, 'key': 'v', 'code': 'KeyV'},
  'w': {'keyCode': 87, 'key': 'w', 'code': 'KeyW'},
  'x': {'keyCode': 88, 'key': 'x', 'code': 'KeyX'},
  'y': {'keyCode': 89, 'key': 'y', 'code': 'KeyY'},
  'z': {'keyCode': 90, 'key': 'z', 'code': 'KeyZ'},
  'Meta': {'keyCode': 91, 'key': 'Meta', 'code': 'MetaLeft'},
  '*': {'keyCode': 106, 'key': '*', 'code': 'NumpadMultiply', 'location': 3},
  '+': {'keyCode': 107, 'key': '+', 'code': 'NumpadAdd', 'location': 3},
  '-': {'keyCode': 109, 'key': '-', 'code': 'NumpadSubtract', 'location': 3},
  '/': {'keyCode': 111, 'key': '/', 'code': 'NumpadDivide', 'location': 3},
  ';': {'keyCode': 186, 'key': ';', 'code': 'Semicolon'},
  '=': {'keyCode': 187, 'key': '=', 'code': 'Equal'},
  ',': {'keyCode': 188, 'key': ',', 'code': 'Comma'},
  '.': {'keyCode': 190, 'key': '.', 'code': 'Period'},
  '`': {'keyCode': 192, 'key': '`', 'code': 'Backquote'},
  '[': {'keyCode': 219, 'key': '[', 'code': 'BracketLeft'},
  '\\': {'keyCode': 220, 'key': '\\', 'code': 'Backslash'},
  ']': {'keyCode': 221, 'key': ']', 'code': 'BracketRight'},
  '\'': {'keyCode': 222, 'key': '\'', 'code': 'Quote'},
  'Attn': {'keyCode': 246, 'key': 'Attn'},
  'CrSel': {'keyCode': 247, 'key': 'CrSel', 'code': 'Props'},
  'ExSel': {'keyCode': 248, 'key': 'ExSel'},
  'EraseEof': {'keyCode': 249, 'key': 'EraseEof'},
  'Play': {'keyCode': 250, 'key': 'Play'},
  'ZoomOut': {'keyCode': 251, 'key': 'ZoomOut'},
  ')': {'keyCode': 48, 'key': ')', 'code': 'Digit0'},
  '!': {'keyCode': 49, 'key': '!', 'code': 'Digit1'},
  '@': {'keyCode': 50, 'key': '@', 'code': 'Digit2'},
  '#': {'keyCode': 51, 'key': '#', 'code': 'Digit3'},
  '$': {'keyCode': 52, 'key': '$', 'code': 'Digit4'},
  '%': {'keyCode': 53, 'key': '%', 'code': 'Digit5'},
  '^': {'keyCode': 54, 'key': '^', 'code': 'Digit6'},
  '&': {'keyCode': 55, 'key': '&', 'code': 'Digit7'},
  '(': {'keyCode': 57, 'key': '\(', 'code': 'Digit9'},
  'A': {'keyCode': 65, 'key': 'A', 'code': 'KeyA'},
  'B': {'keyCode': 66, 'key': 'B', 'code': 'KeyB'},
  'C': {'keyCode': 67, 'key': 'C', 'code': 'KeyC'},
  'D': {'keyCode': 68, 'key': 'D', 'code': 'KeyD'},
  'E': {'keyCode': 69, 'key': 'E', 'code': 'KeyE'},
  'F': {'keyCode': 70, 'key': 'F', 'code': 'KeyF'},
  'G': {'keyCode': 71, 'key': 'G', 'code': 'KeyG'},
  'H': {'keyCode': 72, 'key': 'H', 'code': 'KeyH'},
  'I': {'keyCode': 73, 'key': 'I', 'code': 'KeyI'},
  'J': {'keyCode': 74, 'key': 'J', 'code': 'KeyJ'},
  'K': {'keyCode': 75, 'key': 'K', 'code': 'KeyK'},
  'L': {'keyCode': 76, 'key': 'L', 'code': 'KeyL'},
  'M': {'keyCode': 77, 'key': 'M', 'code': 'KeyM'},
  'N': {'keyCode': 78, 'key': 'N', 'code': 'KeyN'},
  'O': {'keyCode': 79, 'key': 'O', 'code': 'KeyO'},
  'P': {'keyCode': 80, 'key': 'P', 'code': 'KeyP'},
  'Q': {'keyCode': 81, 'key': 'Q', 'code': 'KeyQ'},
  'R': {'keyCode': 82, 'key': 'R', 'code': 'KeyR'},
  'S': {'keyCode': 83, 'key': 'S', 'code': 'KeyS'},
  'T': {'keyCode': 84, 'key': 'T', 'code': 'KeyT'},
  'U': {'keyCode': 85, 'key': 'U', 'code': 'KeyU'},
  'V': {'keyCode': 86, 'key': 'V', 'code': 'KeyV'},
  'W': {'keyCode': 87, 'key': 'W', 'code': 'KeyW'},
  'X': {'keyCode': 88, 'key': 'X', 'code': 'KeyX'},
  'Y': {'keyCode': 89, 'key': 'Y', 'code': 'KeyY'},
  'Z': {'keyCode': 90, 'key': 'Z', 'code': 'KeyZ'},
  ':': {'keyCode': 186, 'key': ':', 'code': 'Semicolon'},
  '<': {'keyCode': 188, 'key': '\<', 'code': 'Comma'},
  '_': {'keyCode': 189, 'key': '_', 'code': 'Minus'},
  '>': {'keyCode': 190, 'key': '>', 'code': 'Period'},
  '?': {'keyCode': 191, 'key': '?', 'code': 'Slash'},
  '~': {'keyCode': 192, 'key': '~', 'code': 'Backquote'},
  '{': {'keyCode': 219, 'key': '{', 'code': 'BracketLeft'},
  '|': {'keyCode': 220, 'key': '|', 'code': 'Backslash'},
  '}': {'keyCode': 221, 'key': '}', 'code': 'BracketRight'},
  '"': {'keyCode': 222, 'key': '"', 'code': 'Quote'}
};/**
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

const debugError = require('debug')(`puppeteer:error`);
/** @type {?Map<string, boolean>} */
let apiCoverage = null;
class Helper {
  /**
   * @param {Function|string} fun
   * @param {!Array<*>} args
   * @return {string}
   */
  static evaluationString(fun, ...args) {
    if (Helper.isString(fun)) {
      console.assert(args.length === 0, 'Cannot evaluate a string with arguments');
      return /** @type {string} */ (fun);
    }
    return `(${fun})(${args.map(serializeArgument).join(',')})`;

    /**
     * @param {*} arg
     * @return {string}
     */
    function serializeArgument(arg) {
      if (Object.is(arg, undefined))
        return 'undefined';
      return JSON.stringify(arg);
    }
  }

  /**
   * @param {!Object} exceptionDetails
   * @return {string}
   */
  static getExceptionMessage(exceptionDetails) {
    if (exceptionDetails.exception)
      return exceptionDetails.exception.description;
    let message = exceptionDetails.text;
    if (exceptionDetails.stackTrace) {
      for (const callframe of exceptionDetails.stackTrace.callFrames) {
        const location = callframe.url + ':' + callframe.lineNumber + ':' + callframe.columnNumber;
        const functionName = callframe.functionName || '<anonymous>';
        message += `\n    at ${functionName} (${location})`;
      }
    }
    return message;
  }

  /**
   * @param {!Object} remoteObject
   * @return {*}
   */
  static valueFromRemoteObject(remoteObject) {
    console.assert(!remoteObject.objectId, 'Cannot extract value when objectId is given');
    if (remoteObject.unserializableValue) {
      switch (remoteObject.unserializableValue) {
        case '-0':
          return -0;
        case 'NaN':
          return NaN;
        case 'Infinity':
          return Infinity;
        case '-Infinity':
          return -Infinity;
        default:
          throw new Error('Unsupported unserializable value: ' + remoteObject.unserializableValue);
      }
    }
    return remoteObject.value;
  }

  /**
   * @param {!Puppeteer.CDPSession} client
   * @param {!Object} remoteObject
   */
  static async releaseObject(client, remoteObject) {
    if (!remoteObject.objectId)
      return;
    await client.send('Runtime.releaseObject', {objectId: remoteObject.objectId}).catch(error => {
      // Exceptions might happen in case of a page been navigated or closed.
      // Swallow these since they are harmless and we don't leak anything in this case.
      debugError(error);
    });
  }

  /**
   * @param {!Object} classType
   */
  static tracePublicAPI(classType) {
    let className = classType.prototype.constructor.name;
    className = className.substring(0, 1).toLowerCase() + className.substring(1);
    const debug = require('debug')(`puppeteer:${className}`);
    if (!debug.enabled && !apiCoverage)
      return;
    for (const methodName of Reflect.ownKeys(classType.prototype)) {
      const method = Reflect.get(classType.prototype, methodName);
      if (methodName === 'constructor' || typeof methodName !== 'string' || methodName.startsWith('_') || typeof method !== 'function')
        continue;
      if (apiCoverage)
        apiCoverage.set(`${className}.${methodName}`, false);
      Reflect.set(classType.prototype, methodName, function(...args) {
        const argsText = args.map(stringifyArgument).join(', ');
        const callsite = `${className}.${methodName}(${argsText})`;
        if (debug.enabled)
          debug(callsite);
        if (apiCoverage)
          apiCoverage.set(`${className}.${methodName}`, true);
        return method.call(this, ...args);
      });
    }

    if (classType.Events) {
      if (apiCoverage) {
        for (const event of Object.values(classType.Events))
          apiCoverage.set(`${className}.emit(${JSON.stringify(event)})`, false);
      }
      const method = Reflect.get(classType.prototype, 'emit');
      Reflect.set(classType.prototype, 'emit', function(event, ...args) {
        const argsText = [JSON.stringify(event)].concat(args.map(stringifyArgument)).join(', ');
        if (debug.enabled && this.listenerCount(event))
          debug(`${className}.emit(${argsText})`);
        if (apiCoverage && this.listenerCount(event))
          apiCoverage.set(`${className}.emit(${JSON.stringify(event)})`, true);
        return method.call(this, event, ...args);
      });
    }

    /**
     * @param {!Object} arg
     * @return {string}
     */
    function stringifyArgument(arg) {
      if (Helper.isString(arg) || Helper.isNumber(arg) || !arg)
        return JSON.stringify(arg);
      if (typeof arg === 'function') {
        let text = arg.toString().split('\n').map(line => line.trim()).join('');
        if (text.length > 20)
          text = text.substring(0, 20) + '…';
        return `"${text}"`;
      }
      const state = {};
      const keys = Object.keys(arg);
      for (const key of keys) {
        const value = arg[key];
        if (Helper.isString(value) || Helper.isNumber(value))
          state[key] = JSON.stringify(value);
      }
      const name = arg.constructor.name === 'Object' ? '' : arg.constructor.name;
      return name + JSON.stringify(state);
    }
  }

  /**
   * @param {!NodeJS.EventEmitter} emitter
   * @param {string} eventName
   * @param {function(?)} handler
   * @return {{emitter: !NodeJS.EventEmitter, eventName: string, handler: function(?)}}
   */
  static addEventListener(emitter, eventName, handler) {
    emitter.on(eventName, handler);
    return { emitter, eventName, handler };
  }

  /**
   * @param {!Array<{emitter: !NodeJS.EventEmitter, eventName: string, handler: function(?)}>} listeners
   */
  static removeEventListeners(listeners) {
    for (const listener of listeners)
      listener.emitter.removeListener(listener.eventName, listener.handler);
    listeners.splice(0, listeners.length);
  }

  /**
   * @return {?Map<string, boolean>}
   */
  static publicAPICoverage() {
    return apiCoverage;
  }

  static recordPublicAPICoverage() {
    apiCoverage = new Map();
  }

  /**
   * @param {!Object} obj
   * @return {boolean}
   */
  static isString(obj) {
    return typeof obj === 'string' || obj instanceof String;
  }

  /**
   * @param {!Object} obj
   * @return {boolean}
   */
  static isNumber(obj) {
    return typeof obj === 'number' || obj instanceof Number;
  }

  static promisify(nodeFunction) {
    function promisified(...args) {
      return new Promise((resolve, reject) => {
        function callback(err, ...result) {
          if (err)
            return reject(err);
          if (result.length === 1)
            return resolve(result[0]);
          return resolve(result);
        }
        nodeFunction.call(null, ...args, callback);
      });
    }
    return promisified;
  }
}

module.exports = {
  helper: Helper,
  debugError
};
