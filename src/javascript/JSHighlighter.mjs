import { EventEmitter } from '../utils/EventEmitter.mjs';
import { Parser, TokenTypes, isEqualState, serializeState, deserializeState } from './jslexer/index.mjs';
import { RangeTree } from '../utils/RangeTree.mjs';
import { CumulativeIndexer, RemoteCumulativeIndexer } from '../editor/CumulativeIndexer.mjs';
import { Trace } from '../utils/Trace.mjs';

const HIGHLIGHT_CHUNK = 20000;
const STATE_CHUNK = 2000;

export async function createHighlighter(editor) {
  const options = {
    budget: HIGHLIGHT_CHUNK * 10,
    density: STATE_CHUNK
  };
  if (editor.remoteDocument()) {
    const indexer = await RemoteCumulativeIndexer.create(editor.remoteDocument(), JSHighlighterIndexer, options);
    return new JSHighlighter(editor, indexer);
  }
  const indexer = new CumulativeIndexer(editor.document(), editor.platformSupport(), new JSHighlighterIndexer(), options);
  return new JSHighlighter(editor, indexer);
}

class JSHighlighter {
  constructor(editor, indexer) {
    this._indexer = indexer;

    this._eventListeners = [
      indexer.on(CumulativeIndexer.Events.Changed, () => editor.raf()),
    ];
  }

  dispose() {
    this._indexer.dispose();
    EventEmitter.removeEventListeners(this._eventListeners);
  }

  /**
   * @param {FrameContent} frameContent
   */
  decorate(frameContent) {
    Trace.beginGroup('js');
    const decorations = new RangeTree();
    for (const range of frameContent.ranges) {
      const state = this._indexer.states().lastStarting(range.from - STATE_CHUNK, range.from + 1);
      if (!state) {
        decorations.add(range.from, range.to, 'syntax.default');
        continue;
      }
      const parser = new Parser(frameContent.document.text().iterator(state.to, 0, range.to), state.data);
      for (const token of parser) {
        if (token.end <= range.from)
          continue;
        const start = Math.max(range.from, token.start);
        if (token.type.keyword || (token.type === TokenTypes.name && token.value === 'let')) {
          decorations.add(start, token.end, 'syntax.keyword');
        } else if (token.type === TokenTypes.string || token.type === TokenTypes.regexp || token.type === TokenTypes.template) {
          decorations.add(start, token.end, 'syntax.string');
        } else if (token.type === TokenTypes.num) {
          decorations.add(start, token.end, 'syntax.number');
        } else if (token.type === TokenTypes.blockComment || token.type === TokenTypes.lineComment) {
          decorations.add(start, token.end, 'syntax.comment');
        } else {
          decorations.add(start, token.end, 'syntax.default');
        }
      }
    }
    frameContent.textDecorations.push(decorations);
    Trace.endGroup('js');
  }
};

export class JSHighlighterIndexer extends CumulativeIndexer.Delegate {
  static importable() {
    return {url: import.meta.url, name: this.name};
  }

  initialState() {
    return Parser.defaultState();
  }

  isEqualStates(state1, state2) {
    return isEqualState(state1, state2);
  }

  serialize(state) {
    return serializeState(state);
  }

  deserialize(state) {
    return deserializeState(state);
  }

  indexIterator(iterator, state) {
    const parser = new Parser(iterator, state);
    for (let token of parser);
    return parser.state();
  }
}
