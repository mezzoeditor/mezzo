import {Editor} from '../src/editor/Editor.mjs';

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

  defaultWidthRegexWithNewLines() {
    return /^.*$/s;
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
  const editor = new Editor(new TestMeasurer(), new TestPlatformSupport());
  if (!textWithCursors)
    return editor;
  const {text, selection} = parseTextWithCursors(textWithCursors);
  editor.reset(text, selection)
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
