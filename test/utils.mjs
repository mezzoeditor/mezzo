import {Editor} from '../src/editor/Editor.mjs';
import {fork} from 'child_process';
import path from 'path';

export class TestMeasurer {
  lineHeight() {
    return 10;
  }

  defaultWidth() {
    return 10;
  }

  defaultWidthRegex() {
    return /^.*$/s;
  }

  measureString(s) {
    throw new Error('UNREACHABLE CODE');
  }
}

export class TestPlatformSupport {
  constructor(supportWorkers = true) {
    this._id = 0;
    this._callbacks = new Map();
    this._supportWorkers = supportWorkers;
  }

  requestIdleCallback(callback) {
    this._callbacks.set(++this._id, callback);
  }

  cancelIdleCallback(id) {
    this._callbacks.delete(id);
  }

  throttle(ms) {
  }

  runUntilIdle() {
    while (this._callbacks.size) {
      const [id, callback] = this._callbacks[Symbol.iterator]().next().value;
      this._callbacks.delete(id);
      callback.call(null);
    }
  }

  createWorker(script) {
    if (!this._supportWorkers)
      return null;
    return new NodeWorker(script);
  }
}

class NodeWorker {
  constructor(script) {
    function runWorkerInitialization(workerFunction, platformSupport) {
      global.self = global;
      const port = {
        onmessage: null,
        postMessage: msg => process.send(msg),
      };

      process.on('message', data => {
        if (port.onmessage)
          port.onmessage.call(null, {data});
      });
      workerFunction.call(null, port, platformSupport);
    }
    const code = [
      `(${runWorkerInitialization.toString()})(
        (${script}),
        new (${TestPlatformSupport.toString()})(false /* supportWorkers */)
      );`,
      '//# sourceURL=nodeworker.js'
    ].join('\n');
    const url = new URL('node_worker.js', import.meta.url);
    this._child = fork(url2path(url.href), [code], {
      stdio: [ 'inherit', 'inherit', 'inherit', 'ipc' ]
    });
    this._child.on('message', this._onMessage.bind(this));
    this.onmessage = null;
  }

  postMessage(msg) {
    this._child.send(msg);
  }

  terminate() {
    this._child.kill('SIGTERM');
  }

  _onMessage(data) {
    if (this.onmessage)
      this.onmessage.call(null, {data});
  }
}

export function url2path(url) {
  const {pathname} = new URL(url);
  return pathname.replace('/', path.sep);
}


export function parseTextWithCursors(textWithCursors) {
  const selection = [];
  const tokens = textWithCursors.split('|');
  let offset = 0;
  for (const token of tokens) {
    offset += token.length;
    selection.push({focus: offset, anchor: offset});
  }
  // Last token has nothing to do with cursor.
  selection.pop();
  if (!selection.length)
    selection.push({focus: 0, anchor: 0});
  return {selection, text: tokens.join('')};
}

export function createTestEditor(textWithCursors = '') {
  const editor = Editor.create(new TestMeasurer(), new TestPlatformSupport());
  if (!textWithCursors)
    return editor;
  const {text, selection} = parseTextWithCursors(textWithCursors);
  editor.reset(text, selection)
  editor.platformSupport().runUntilIdle();
  return editor;
}

export function textWithCursors(editor) {
  let text = editor.document().text().content();
  const selection = editor.document().sortedSelection();
  for (let i = selection.length - 1; i >= 0; i--) {
    const focus = selection[i].focus;
    text = text.substring(0, focus) + '|' + text.substring(focus);
  }
  return text;
}
