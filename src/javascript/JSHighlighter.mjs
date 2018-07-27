import { Start, End } from '../core/Anchor.mjs';
import { TextDecorator, Decorator} from '../core/Decorator.mjs';
import { Parser, TokenTypes, KeywordTypes } from './jslexer/index.mjs';
import { trace } from '../core/Trace.mjs';
import { Document } from '../core/Document.mjs';

const HIGHLIGHT_CHUNK = 20000;
const STATE_CHUNK = 2000;

export class JSHighlighter {
  constructor(editor) {
    this._platformSupport = editor.platformSupport();
    this._highlightStates = new Decorator();
    this._highlightOffset = 0;
    this._jobId = 0;
    this._parser = null;

    this._onReplaceCallback = this._onReplace.bind(this);
    this._onDecorateCallback = this._onDecorate.bind(this);

    this._viewport = editor.viewport();
    this._viewport.addDecorationCallback(this._onDecorateCallback);
    this._document = editor.document();
    this._document.on(Document.Events.Replaced, this._onReplaceCallback);

    this._parser = new Parser(this._document.iterator(0), Parser.defaultState());
    this._highlightStates.clearAll();
    this._highlightStates.add(Start(0), Start(0), Parser.defaultState());
    this._highlightOffset = 0;
    this._scheduleHighlight();
  }

  _doHighlight() {
    this._jobId = 0;
    if (this._highlightOffset >= this._document.length())
      return;
    let to = Math.min(this._highlightOffset + HIGHLIGHT_CHUNK, this._document.length());
    this._highlightStates.clearTouching(Start(this._highlightOffset), End(to));
    for (; this._highlightOffset < to; this._highlightOffset += STATE_CHUNK) {
      this._parser.it.setConstraints(0, this._highlightOffset);
      for (let token of this._parser);
      this._highlightStates.add(Start(this._highlightOffset), Start(this._highlightOffset), this._parser.state());
    }
    if (this._highlightOffset < this._document.length()) {
      this._jobId = this._platformSupport.requestIdleCallback(this._doHighlight.bind(this));
      this._viewport.raf();
    } else {
      this._highlightOffset = this._document.length();
    }
  }

  _scheduleHighlight() {
    if (!this._jobId)
      this._jobId = this._platformSupport.requestIdleCallback(this._doHighlight.bind(this));
  }

  /**
   * @param {!Viewport} viewport
   */
  dispose() {
    this._viewport.removeDecorationCallback(this._onDecorateCallback);
    this._document.off(Document.Events.Replaced, this._onReplaceCallback);
    if (this._jobId) {
      this._platformSupport.cancelIdleCallback(this._jobId);
      this._jobId = 0;
    }
  }

  /**
   * @param {!Replacement} replacement
   */
  _onReplace(replacement) {
    // TODO: we should probably create parser just once at the end.
    let from = replacement.offset;
    let to = from + replacement.removed.length();

    this._highlightStates.clearTouching(Start(from), End(to));
    this._highlightStates.replace(from, to, replacement.inserted.length());
    if (from === 0)
      this._highlightStates.add(Start(0), Start(0), Parser.defaultState());
    if (this._highlightOffset <= from) {
      this._parser.setIterator(replacement.after.iterator(this._highlightOffset));
      this._scheduleHighlight();
      return;
    }

    let decoration = this._highlightStates.lastTouching(Start(0), End(from));
    if (decoration) {
      this._highlightOffset = decoration.from.offset;
      this._parser = new Parser(replacement.after.iterator(this._highlightOffset), decoration.data);
    } else {
      this._highlightOffset = 0;
      this._parser = new Parser(replacement.after.iterator(this._highlightOffset), Parser.defaultState());
    }
    this._scheduleHighlight();
  }

  /**
   * @param {!Viewport.VisibleContent} visibleContent
   * @return {!Viewport.DecorationResult}
   */
  _onDecorate(visibleContent) {
    trace.beginGroup('js');
    let decorator = new TextDecorator();
    for (let range of visibleContent.ranges) {
      let decoration = this._highlightStates.lastTouching(Start(range.from - STATE_CHUNK), End(range.from));
      if (!decoration) {
        decorator.add(Start(range.from), Start(range.to), 'syntax.default');
        continue;
      }
      let parser = new Parser(visibleContent.document.iterator(decoration.to.offset, 0, range.to), decoration.data);
      for (let token of parser) {
        if (token.end <= range.from)
          continue;
        let start = Math.max(range.from, token.start);
        if (token.type.keyword || (token.type === TokenTypes.name && token.value === 'let')) {
          decorator.add(Start(start), Start(token.end), 'syntax.keyword');
        } else if (token.type === TokenTypes.string || token.type === TokenTypes.regexp || token.type === TokenTypes.template) {
          decorator.add(Start(start), Start(token.end), 'syntax.string');
        } else if (token.type === TokenTypes.num) {
          decorator.add(Start(start), Start(token.end), 'syntax.number');
        } else if (token.type === TokenTypes.blockComment || token.type === TokenTypes.lineComment) {
          decorator.add(Start(start), Start(token.end), 'syntax.comment');
        } else {
          decorator.add(Start(start), Start(token.end), 'syntax.default');
        }
      }
    }
    trace.endGroup('js');
    return {text: [decorator]};
  }
};
