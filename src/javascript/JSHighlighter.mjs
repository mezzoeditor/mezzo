import { EventEmitter } from '../core/EventEmitter.mjs';
import { Parser, TokenTypes, isEqualState } from './jslexer/index.mjs';
import { TextDecorator } from '../core/Decorator.mjs';
import { CumulativeIndexer } from '../editor/CumulativeIndexer.mjs';
import { trace } from '../core/Trace.mjs';

const HIGHLIGHT_CHUNK = 20000;
const STATE_CHUNK = 2000;

export class JSHighlighter {
  constructor(editor) {
    this._indexer = new CumulativeIndexer(editor, new JSHighlighterIndexer(), {
      budget: HIGHLIGHT_CHUNK,
      density: STATE_CHUNK
    });

    this._eventListeners = [
      editor.addDecorationCallback(this._onDecorate.bind(this)),
    ];
  }

  dispose() {
    this._indexer.dispose();
    EventEmitter.removeEventListeners(this._eventListeners);
  }

  /**
   * @param {!VisibleContent} visibleContent
   * @return {!DecorationResult}
   */
  _onDecorate(visibleContent) {
    trace.beginGroup('js');
    let decorator = new TextDecorator();
    for (let range of visibleContent.ranges) {
      let decoration = this._indexer.states().lastStarting(range.from - STATE_CHUNK, range.from + 1);
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

class JSHighlighterIndexer extends CumulativeIndexer.Delegate {
  initialState() {
    return Parser.defaultState();
  }

  isEqualStates(state1, state2) {
    return isEqualState(state1, state2);
  }

  /**
   * Return a function that can be called with consequent offsets
   * and returns tokenization state at these offsets.
   * @return {function(number):*}
   */
  createIndexer(document, offset, state) {
    const parser = new Parser(document.text().iterator(offset), state);
    return offset => {
      parser.it.setConstraints(0, offset);
      for (let token of parser);
      return parser.state();
    }
  }
}
