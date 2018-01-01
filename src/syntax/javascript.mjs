import {Parser, TokenTypes, KeywordTypes} from './jslexer/index.js';
import {TextUtils} from "../utils/TextUtils.mjs";

/**
 * @interface
 */
export default class {
  /**
   * Called on every render of viewport. See Viewport for api.
   * @param {!Viewport} viewport
   */
  onViewport(viewport) {
    let document = viewport.document();
    for (let range of viewport.ranges())
      tokenizeText(viewport.rangeContent(range), range.from, viewport);
  }
};

function tokenizeText(text, offset, viewport) {
  let tt = new Parser({allowHashBang: true}, text);
  for (let token of tt) {
    if (token.type.keyword || (token.type === TokenTypes.name && token.value === 'let'))
      viewport.addDecoration(token.start + offset, token.end + offset, 'syntax.keyword');
    else if (token.type === TokenTypes.string || token.type === TokenTypes.regexp || token.type === TokenTypes.template || token.type === TokenTypes.invalidTemplate)
      viewport.addDecoration(token.start + offset, token.end + offset, 'syntax.string');
    else if (token.type === TokenTypes.num)
      viewport.addDecoration(token.start + offset, token.end + offset, 'syntax.number');
    else if (token.type === TokenTypes.blockComment || token.type === TokenTypes.lineComment)
      viewport.addDecoration(token.start + offset, token.end + offset, 'syntax.comment');
    else
      viewport.addDecoration(token.start + offset, token.end + offset, 'syntax.default');
  }
}
