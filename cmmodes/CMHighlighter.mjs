import { Decorator, TextDecorator } from '../src/core/Decorator.mjs';
import { EventEmitter } from '../src/core/EventEmitter.mjs';
import { trace } from '../src/core/Trace.mjs';
import {} from './modes/runmode-standalone.js';
import {} from './modes/css.js';

export class CMHighlighter {
  constructor(editor, mimeType) {
    this._mimeType = mimeType;
    this._editor = editor;
    this._platformSupport = editor.platformSupport();
    this._document = editor.document();
    this._mode = CodeMirror.getMode({indentUnit: 2}, mimeType);

    this._states = new Decorator();
    this._states.add(0, 0, CodeMirror.startState(this._mode));
    this._cursor = 0;

    this._eventListeners = [
      editor.document().on('changed', this._onDocumentChanged.bind(this)),
      editor.addDecorationCallback(this._onDecorate.bind(this)),
    ];

    this._jobId = 0;
    this._scheduleHighlight();
  }

  _onDocumentChanged({replacements}) {
    if (!replacements.length)
      return;
    for (const replacement of replacements) {
      let from = replacement.offset;
      let to = from + replacement.removed.length();
      this._states.replace(from, to, replacement.inserted.length());
      this._cursor = Math.min(replacement.offset, this._cursor);
    }
    this._scheduleHighlight();
  }

  _scheduleHighlight() {
    if (!this._jobId)
      this._jobId = this._platformSupport.requestIdleCallback(this._doHighlight.bind(this));
  }

  _doHighlight() {
    this._jobId = 0;
    const text = this._document.text();
    const initial = this._states.lastStarting(0, this._cursor + 0.5);
    let line = text.offsetToPosition(initial.to).line;
    if (line + 1 >= text.lineCount())
      return;
    let lastOffset = initial.to;
    const state = copyState(this._mode, initial.data);
    let budget = 20000;
    while (budget > 0 && ++line < text.lineCount()) {
      const offset = text.positionToOffset({line: line, column: 0});
      const lineText = text.content(lastOffset, offset - 1);
      const stream = new CodeMirror.StringStream(lineText);
      while (!stream.eol()) {
        this._mode.token(stream, state);
        stream.start = stream.pos;
      }
      this._states.clearStarting(lastOffset + 0.5, offset);
      this._states.add(offset - 0.5, offset, copyState(this._mode, state));
      budget -= lineText.length;
      lastOffset = offset;
    }
    this._cursor = lastOffset;
    this._scheduleHighlight();
    this._editor.raf();
  }

  dispose() {
    EventEmitter.removeEventListeners(this._eventListeners);
    if (this._jobId) {
      this._platformSupport.cancelIdleCallback(this._jobId);
      this._jobId = 0;
    }
  }

  /**
   * @param {!VisibleContent} visibleContent
   * @return {!DecorationResult}
   */
  _onDecorate(visibleContent) {
    trace.beginGroup(this._mimeType);
    const decorator = new TextDecorator();
    const text = this._document.text();
    for (let range of visibleContent.ranges) {
      const fromPosition = text.offsetToPosition(range.from);
      const lineOffset = text.positionToOffset({line: fromPosition.line, column: 0});
      const initial = lineOffset === 0 ? this._states.lastStarting(0, 0.5) : this._states.lastStarting(0, lineOffset);
      if (!initial) {
        decorator.add(range.from, range.to, 'syntax.default');
        continue;
      }
      const state = copyState(this._mode, initial.data);
      const lineText = text.content(initial.to, range.to);
      const stream = new CodeMirror.StringStream(lineText);
      while (!stream.eol()) {
        const type = this._mode.token(stream, state);
        const value = stream.current();
        let dType = 'syntax.default';
        if (!type)
          dType = 'syntax.default';
        else if (type.includes('property') || type.includes('string') || type.includes('meta'))
          dType = 'syntax.string';
        else if (type.includes('atom'))
          dType = 'syntax.keyword';
        else if (type.includes('number'))
          dType = 'syntax.number';
        else if (type.includes('comment'))
          dType = 'syntax.comment';
        else if (type.includes('variable-2'))
          dType = 'syntax.variable';
        decorator.add(initial.to + stream.start, initial.to + stream.start + value.length, dType);
        stream.start = stream.pos;
      }
    }
    trace.endGroup(this._mimeType);
    return {text: [decorator]};
  }
};

function copyState(mode, state) {
  if (state === true)
    return state;
  if (mode.copyState)
    return mode.copyState(state);
  let nstate = {};
  for (let n in state) {
    let val = state[n];
    if (val instanceof Array)
      val = val.concat([]);
    nstate[n] = val;
  }
  return nstate;
}
