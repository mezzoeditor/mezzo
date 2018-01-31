import { Decorator } from '../core/Decorator.mjs';
import {Parser, TokenTypes, KeywordTypes} from './jslexer/index.mjs';
import {TextUtils} from '../utils/TextUtils.mjs';
import {Classifier} from './jsbayes/index.mjs';

const classifier = Classifier.load();

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
    const doc = viewport.document();
    for (let range of viewport.ranges()) {
      let start = doc.iterator(range.from);
      while (/[a-zA-Z0-9_]/.test(start.current) && start.offset)
        start.prev();
      let best = classifier.classify(doc.iterator(start.offset, start.offset, start.offset + 100));
      let bestChar = '';
      let bestTokenTo = start.offset;
      if (Object.is(best, -Infinity)) {
        for (let char of ['\'', '"', '`']) {
          let it = doc.iterator(start.offset, start.offset, range.to);
          if (!it.find(char))
            continue;
          it.next();
          let tokenTo = it.offset;
          it = doc.iterator(it.offset, it.offset, Math.min(range.to, it.offset + 100));
          const newBest = classifier.classify(it);
          if (newBest > best) {
            best = newBest;
            bestChar = char;
            bestTokenTo = tokenTo;
          }
        }
      }
      let it = doc.iterator(bestTokenTo, bestTokenTo, range.to);
      if (bestChar)
        this._decorator.add(start.offset, bestTokenTo, 'syntax.string');
      tokenizeText(it, this._decorator);
    }
  }
};

function tokenizeText(iterator, decorator) {
  let tt = new Parser({allowHashBang: true}, iterator);
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
