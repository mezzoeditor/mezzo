import { Decorator, TextDecorator } from '../src/core/Decorator.mjs';
import { EventEmitter } from '../src/core/EventEmitter.mjs';
import { trace } from '../src/core/Trace.mjs';
import {} from './modes/runmode-standalone.js';

export class CMHighlighter {
  static async createCSS(editor) {
    await import('./modes/css.js');
    return new CMHighlighter(editor, 'text/css', new Map(Object.entries({
      'property': 'syntax.string',
      'atom': 'syntax.keyword',
      'number': 'syntax.number',
      'comment': 'syntax.comment',
      'variable-2': 'syntax.variable',
    })));
  }

  static async createHTML(editor) {
    await Promise.all([
      import('./modes/css.js'),
      import('./modes/xml.js'),
      import('./modes/javascript.js'),
      import('./modes/htmlmixed.js'),
    ]);

    return new CMHighlighter(editor, 'text/html', new Map(Object.entries({
      'property': 'syntax.string',
      'atom': 'syntax.keyword',
      'number': 'syntax.number',
      'comment': 'syntax.comment',
      'variable-2': 'syntax.variable',
    })));
  }

  constructor(editor, mimeType, cmtokensToTheme) {
    this._mimeType = mimeType;
    this._editor = editor;
    this._platformSupport = editor.platformSupport();
    this._document = editor.document();
    this._mode = CodeMirror.getMode({indentUnit: 2}, mimeType);
    this._cmtokensToTheme = cmtokensToTheme;

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
    const state = CodeMirror.copyState(this._mode, initial.data);
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
      this._states.add(offset - 0.5, offset, CodeMirror.copyState(this._mode, state));
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
      const state = CodeMirror.copyState(this._mode, initial.data);
      const lineText = text.content(initial.to, range.to);
      const stream = new CodeMirror.StringStream(lineText);
      while (!stream.eol()) {
        const token = this._mode.token(stream, state);
        const value = stream.current();
        let dType = 'syntax.default';
        if (token) {
          // Codemirror modes return a list of "styles". Pick
          // the first we have a mapping for.
          const type = token.split(' ').find(type => this._cmtokensToTheme.has(type));
          if (type)
            dType = this._cmtokensToTheme.get(type);
        }
        decorator.add(initial.to + stream.start, initial.to + stream.start + value.length, dType);
        stream.start = stream.pos;
      }
    }
    trace.endGroup(this._mimeType);
    return {text: [decorator]};
  }
};

CodeMirror.copyState = function(mode, state) {
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
