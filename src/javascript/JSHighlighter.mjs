import { TextDecorator } from "../core/Decorator.mjs";
import { Parser, TokenTypes, KeywordTypes } from './jslexer/index.mjs';

/**
 * @implements Plugin
 */
export class JSHighlighter {
  constructor() {
    this._speculativeHighlight = new TextDecorator();
  }

  /**
   * @override
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   */
  onReplace(from, to, inserted) {
    this._speculativeHighlight.clearTouching(from, to);
    this._speculativeHighlight.onReplace(from, to, inserted);
  }

  /**
   * @override
   * @param {!Frame} frame
   * @return {!PluginFrameResult}
   */
  onFrame(frame) {
    let decorator = new TextDecorator();
    for (let range of frame.ranges()) {
      let from = range.from;
      let decoration = this._speculativeHighlight.lastTouching(from, from);
      if (decoration) {
        decorator.add(from, Math.min(decoration.to, range.to), decoration.data);
        from = decoration.to;
      }

      this._speculativeHighlight.clearTouching(from + 1, range.to);
      let iterator = range.iterator();
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
    return {text: [decorator]};
  }
};
