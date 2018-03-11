import { TextDecorator, Decorator} from '../core/Decorator.mjs';
import { Parser, TokenTypes, KeywordTypes } from './jslexer/index.mjs';
import { trace } from '../core/Trace.mjs';

const HIGHLIGHT_CHUNK = 20000;
const STATE_CHUNK = 2000;

export class JSHighlighter {
  constructor() {
    this._highlightStates = new Decorator();
    this._highlightOffset = 0;
    this._rafId = 0;
    this._parser = null;

    this._onReplaceCallback = this._onReplace.bind(this);
    this._onDecorateCallback = this._onDecorate.bind(this);
  }

  _doHighlight() {
    this._rafId = 0;
    if (this._highlightOffset >= this._document.length())
      return;
    let to = Math.min(this._highlightOffset + HIGHLIGHT_CHUNK, this._document.length());
    this._highlightStates.clearTouching(this._highlightOffset, to);
    for (; this._highlightOffset < to; this._highlightOffset += STATE_CHUNK) {
      this._parser.it.setConstraints(0, this._highlightOffset);
      for (let token of this._parser);
      this._highlightStates.add(this._highlightOffset, this._highlightOffset, this._parser.state());
    }
    if (this._highlightOffset < this._document.length())
      this._rafId = requestAnimationFrame(this._doHighlight.bind(this));
    else
      this._highlightOffset = this._document.length();
  }

  _scheduleHighlight() {
    if (!this._rafId)
      this._rafId = requestAnimationFrame(this._doHighlight.bind(this));
  }

  /**
   * @param {!Viewport} viewport
   */
  install(viewport) {
    viewport.addDecorationCallback(this._onDecorateCallback);
    viewport.document().addReplaceCallback(this._onReplaceCallback);
    this._document = viewport.document();
    this._parser = new Parser(this._document.iterator(0), Parser.defaultState());
    this._highlightStates.clearAll();
    this._highlightOffset = 0;
    this._scheduleHighlight();
  }

  /**
   * @param {!Viewport} viewport
   */
  uninstall(viewport) {
    viewport.removeDecorationCallback(this._onDecorateCallback);
    viewport.document().removeReplaceCallback(this._onReplaceCallback);
  }

  /**
   * @param {!Replacement} replacement
   */
  _onReplace(replacement) {
    this._highlightStates.clearTouching(replacement.from, replacement.to);
    this._highlightStates.replace(replacement.from, replacement.to, replacement.inserted);
    if (replacement.from === 0)
      this._highlightStates.add(0, 0, Parser.defaultState());
    if (this._highlightOffset <= replacement.from) {
      this._parser.setIterator(this._document.iterator(this._highlightOffset));
      this._scheduleHighlight();
      return;
    }

    let decoration = this._highlightStates.lastTouching(0, replacement.from);
    if (decoration) {
      this._highlightOffset = decoration.from;
      this._parser = new Parser(this._document.iterator(this._highlightOffset), decoration.data);
    } else {
      this._highlightOffset = 0;
      this._parser = new Parser(this._document.iterator(this._highlightOffset), Parser.defaultState());
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
      let decoration = this._highlightStates.lastTouching(range.from - STATE_CHUNK, range.from);
      if (!decoration) {
        decorator.add(range.from, range.to, 'syntax.default');
        continue;
      }
      let parser = new Parser(visibleContent.document.iterator(decoration.to, 0, range.to), decoration.data);
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
