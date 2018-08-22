import {Editor} from './Editor.mjs';

export class TestMeasurer {
  lineHeight() {
    return 10;
  }

  defaultWidth() {
    return 10;
  }

  defaultWidthRegex() {
    return /^.*$/;
  }

  measureString(s) {
    throw new Error('UNREACHABLE CODE');
  }
}

export class TestPlatformSupport {
  constructor() {
    this._id = 0;
    this._callbacks = new Map();
  }

  requestIdleCallback(callback) {
    this._callbacks.set(++this._id, callback);
  }

  cancelIdleCallback(id) {
    this._callbacks.delete(id);
  }

  runUntilIdle() {
    while (this._callbacks.size) {
      const [id, callback] = this._callbacks[Symbol.iterator]().next().value;
      this._callbacks.delete(id);
      callback.call(null);
    }
  }
}

export function createTestEditor() {
  return new Editor(new TestMeasurer(), new TestPlatformSupport());
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
