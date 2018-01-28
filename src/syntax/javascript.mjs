import { Decorator } from "../core/Decorator.mjs";
import {Parser, TokenTypes, KeywordTypes} from './jslexer/index.mjs';
import {TextUtils} from "../utils/TextUtils.mjs";

/**
 * @interface
 */
export default class {
  constructor() {
    this._decorator = new Decorator();
  }

  /**
   * @override
   * @param {!Document} document
   */
  onAdded(document) {
    document.addDecorator(this._decorator);
  }

  /**
   * @override
   * @param {!Document} document
   */
  onRemoved(document) {
    document.removeDecorator(this._decorator);
  }

  /**
   * Called on every render of viewport. See Viewport for api.
   * @param {!Viewport} viewport
   */
  onViewport(viewport) {
    this._decorator.clearAll();
    for (let range of viewport.ranges())
      tokenizeText(viewport.document().iterator(range.from, range.from, range.to), this._decorator);
  }
};

function tokenizeText(text, decorator) {
  let tt = new Parser({allowHashBang: true}, text);
  for (let token of tt) {
    if (token.type.keyword || (token.type === TokenTypes.name && token.value === 'let'))
      decorator.add(token.start, token.end, 'syntax.keyword');
    else if (token.type === TokenTypes.string || token.type === TokenTypes.regexp || token.type === TokenTypes.template || token.type === TokenTypes.invalidTemplate)
      decorator.add(token.start, token.end, 'syntax.string');
    else if (token.type === TokenTypes.num)
      decorator.add(token.start, token.end, 'syntax.number');
    else if (token.type === TokenTypes.blockComment || token.type === TokenTypes.lineComment)
      decorator.add(token.start, token.end, 'syntax.comment');
    else
      decorator.add(token.start, token.end, 'syntax.default');
  }
}
