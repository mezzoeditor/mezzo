import { TextDecorator, Decorator} from '../core/Decorator.mjs';
import { Parser, TokenTypes, KeywordTypes } from './jslexer/index.mjs';
import { trace } from '../core/Trace.mjs';
import { Document } from '../core/Document.mjs';
import { EventEmitter } from '../core/EventEmitter.mjs';

const HIGHLIGHT_CHUNK = 20000;
const STATE_CHUNK = 2000;

// TODO: all +0.5 here should not be necessary.
export class JSHighlighter {
  constructor(editor) {
    this._platformSupport = editor.platformSupport();
    this._highlightStates = new Decorator();
    this._highlightOffset = 0;
    this._jobId = 0;
    this._parser = null;

    this._onDecorateCallback = this._onDecorate.bind(this);

    this._viewport = editor.viewport();
    this._viewport.addDecorationCallback(this._onDecorateCallback);
    this._document = editor.document();

    this._eventListeners = [
      this._document.on(Document.Events.Changed, this._onDocumentChanged.bind(this))
    ];

    this._parser = new Parser(this._document.text().iterator(0), Parser.defaultState());
    this._highlightStates.clearAll();
    this._highlightStates.add(0, 0, Parser.defaultState());
    this._highlightOffset = 0;
    this._scheduleHighlight();
  }

  _doHighlight() {
    this._jobId = 0;
    if (this._highlightOffset >= this._document.text().length())
      return;
    let to = Math.min(this._highlightOffset + HIGHLIGHT_CHUNK, this._document.text().length());
    this._highlightStates.clearTouching(this._highlightOffset, to + 0.5);
    for (; this._highlightOffset < to; this._highlightOffset += STATE_CHUNK) {
      this._parser.it.setConstraints(0, this._highlightOffset);
      for (let token of this._parser);
      this._highlightStates.add(this._highlightOffset, this._highlightOffset, this._parser.state());
    }
    if (this._highlightOffset < this._document.text().length()) {
      this._jobId = this._platformSupport.requestIdleCallback(this._doHighlight.bind(this));
      this._viewport.raf();
    } else {
      this._highlightOffset = this._document.text().length();
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
    EventEmitter.removeEventListeners(this._eventListeners);
    this._document.off(Document.Events.Changed, this._onReplaceCallback);
    if (this._jobId) {
      this._platformSupport.cancelIdleCallback(this._jobId);
      this._jobId = 0;
    }
  }

  /**
   * @param {!DocumentChangedEvent} event
   */
  _onDocumentChanged({replacements}) {
    for (const replacement of replacements) {
      // TODO: we should probably create parser just once at the end.
      let from = replacement.offset;
      let to = from + replacement.removed.length();

      this._highlightStates.clearTouching(from, to + 0.5);
      this._highlightStates.replace(from, to, replacement.inserted.length());
      if (from === 0)
        this._highlightStates.add(0, 0, Parser.defaultState());
      if (this._highlightOffset <= from) {
        this._parser.setIterator(replacement.after.iterator(this._highlightOffset));
        continue;
      }

      let decoration = this._highlightStates.lastTouching(0, from + 0.5);
      if (decoration) {
        this._highlightOffset = decoration.from;
        this._parser = new Parser(replacement.after.iterator(this._highlightOffset), decoration.data);
      } else {
        this._highlightOffset = 0;
        this._parser = new Parser(replacement.after.iterator(this._highlightOffset), Parser.defaultState());
      }
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
      let decoration = this._highlightStates.lastTouching(range.from - STATE_CHUNK, range.from + 0.5);
      if (!decoration) {
        decorator.add(range.from, range.to, 'syntax.default');
        continue;
      }
      let parser = new Parser(visibleContent.document.text().iterator(decoration.to, 0, range.to), decoration.data);
      for (let token of parser) {
        if (token.end <= range.from)
          continue;
        let start = Math.max(range.from, token.start);
        if (token.type.keyword || (token.type === TokenTypes.name && token.value === 'let')) {
          decorator.add(start, token.end, 'syntax.keyword');
        } else if (token.type === TokenTypes.string || token.type === TokenTypes.regexp || token.type === TokenTypes.template) {
          decorator.add(start, token.end, 'syntax.string');
        } else if (token.type === TokenTypes.num) {
          decorator.add(start, token.end, 'syntax.number');
        } else if (token.type === TokenTypes.blockComment || token.type === TokenTypes.lineComment) {
          decorator.add(start, token.end, 'syntax.comment');
        } else {
          decorator.add(start, token.end, 'syntax.default');
        }
      }
    }
    trace.endGroup('js');
    return {text: [decorator]};
  }
};
