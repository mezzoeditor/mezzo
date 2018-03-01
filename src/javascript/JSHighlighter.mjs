import { TextDecorator } from "../core/Decorator.mjs";
import { Parser, TokenTypes, KeywordTypes } from './jslexer/index.mjs';
import { trace } from "../core/Trace.mjs";

export class JSHighlighter {
  constructor() {
    this._speculativeHighlight = new TextDecorator();
    this._onReplaceCallback = this._onReplace.bind(this);
    this._onDecorateCallback = this._onDecorate.bind(this);
  }

  /**
   * @param {!Viewport} viewport
   */
  install(viewport) {
    viewport.addDecorationCallback(this._onDecorateCallback);
    viewport.document().addReplaceCallback(this._onReplaceCallback);
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
    this._speculativeHighlight.clearTouching(replacement.from, replacement.to);
    this._speculativeHighlight.replace(replacement.from, replacement.to, replacement.inserted);
  }

  /**
   * @param {!Viewport.VisibleContent} visibleContent
   * @return {!Viewport.DecorationResult}
   */
  _onDecorate(visibleContent) {
    trace.beginGroup('js');
    let decorator = new TextDecorator();
    for (let range of visibleContent.ranges) {
      let from = range.from;
      let decoration = this._speculativeHighlight.lastTouching(from, from);
      if (decoration) {
        decorator.add(from, Math.min(decoration.to, range.to), decoration.data);
        from = decoration.to;
      }

      this._speculativeHighlight.clearTouching(from + 1, range.to);
      let iterator = visibleContent.document.iterator(from, from, range.to);
      let tt = new Parser({allowHashBang: true}, iterator);
      for (let token of tt) {
        if (token.type.keyword || (token.type === TokenTypes.name && token.value === 'let')) {
          decorator.add(token.start, token.end, 'syntax.keyword');
        } else if (token.type === TokenTypes.string || token.type === TokenTypes.regexp || token.type === TokenTypes.template || token.type === TokenTypes.invalidTemplate) {
          decorator.add(token.start, token.end, 'syntax.string');
          this._speculativeHighlight.add(token.start, token.end, 'syntax.string');
        } else if (token.type === TokenTypes.num) {
          decorator.add(token.start, token.end, 'syntax.number');
        } else if (token.type === TokenTypes.blockComment || token.type === TokenTypes.lineComment) {
          decorator.add(token.start, token.end, 'syntax.comment');
          this._speculativeHighlight.add(token.start, token.end, 'syntax.comment');
        } else {
          decorator.add(token.start, token.end, 'syntax.default');
        }
      }
    }
    trace.endGroup('js');
    return {text: [decorator]};
  }
};
