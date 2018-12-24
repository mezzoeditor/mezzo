import { EventEmitter } from '../../core/utils/EventEmitter.mjs';
import { Trace } from '../../core/utils/Trace.mjs';
import { RangeTree } from '../../core/utils/RangeTree.mjs';
import {} from './modes/runmode-standalone.js';

export class CMHighlighter {
  constructor(editor, mimeType, cmtokensToTheme) {
    this._mimeType = mimeType;
    this._editor = editor;
    this._platformSupport = editor.platformSupport();
    this._document = editor.document();
    this._mode = CodeMirror.getMode({indentUnit: 2}, mimeType);
    this._cmtokensToTheme = cmtokensToTheme;

    this._states = new RangeTree();
    this._states.add(0, 0, CodeMirror.startState(this._mode));
    this._cursor = 0;

    this._eventListeners = [
      editor.document().on('changed', this._onDocumentChanged.bind(this)),
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
   * @param {FrameContent} frameContent
   */
  decorate(frameContent) {
    Trace.beginGroup(this._mimeType);
    const decorations = new RangeTree();
    const text = this._document.text();
    for (const range of frameContent.ranges) {
      const fromPosition = text.offsetToPosition(range.from);
      const lineOffset = text.positionToOffset({line: fromPosition.line, column: 0});
      const initial = lineOffset === 0 ? this._states.lastStarting(0, 0.5) : this._states.lastStarting(0, lineOffset);
      if (!initial) {
        decorations.add(range.from, range.to, 'syntax.default');
        continue;
      }
      const state = CodeMirror.copyState(this._mode, initial.data);
      const lineText = text.content(initial.to, range.to);
      const lines = lineText.split('\n');
      let textOffset = 0;
      for (const line of lines) {
        const stream = new CodeMirror.StringStream(line);
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
          decorations.add(initial.to + stream.start + textOffset, initial.to + stream.start + value.length + textOffset, dType);
          stream.start = stream.pos;
        }
        textOffset += line.length + 1;
      }
    }
    Trace.endGroup(this._mimeType);
    frameContent.textDecorations.push(decorations);
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

// Override CodeMirror's getMode to fallback to "text/plain"
// if there's no defined mode.
//
// This is how original CodeMirror works and markdown mode
// relies on this.
CodeMirror.getMode = function(options, spec) {
  spec = CodeMirror.resolveMode(spec);
  var mfactory = CodeMirror.modes[spec.name];
  if (!mfactory) return CodeMirror.getMode(options, 'text/plain');
  return mfactory(options, spec);
};
