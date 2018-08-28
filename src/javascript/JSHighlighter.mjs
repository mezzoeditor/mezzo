import { TextDecorator, Decorator} from '../core/Decorator.mjs';
import { Parser, TokenTypes, KeywordTypes, isEqualState } from './jslexer/index.mjs';
import { trace } from '../core/Trace.mjs';
import { Document } from '../core/Document.mjs';
import { EventEmitter } from '../core/EventEmitter.mjs';

const HIGHLIGHT_CHUNK = 20000;
const STATE_CHUNK = 2000;

export class JSHighlighter {
  constructor(editor) {
    this._editor = editor;
    this._document = editor.document();
    this._platformSupport = editor.platformSupport();

    this._states = new Decorator();
    this._states.add(0, 0, Parser.defaultState());
    this._cursors = new Decorator();
    this._cursors.add(0, 0);

    this._jobId = 0;

    this._eventListeners = [
      this._document.on(Document.Events.Changed, this._onDocumentChanged.bind(this)),
      this._editor.addDecorationCallback(this._onDecorate.bind(this)),
    ];

    this._scheduleHighlight();
  }

  _doHighlight() {
    this._jobId = 0;

    let budget = HIGHLIGHT_CHUNK;
    while (budget > 0) {
      const cursor = this._cursors.firstAll();
      if (!cursor || cursor.from >= this._document.text().length() - STATE_CHUNK) {
        // There's nothing to do.
        this._cursors.clearAll();
        break;
      }
      const to = Math.min(cursor.from + budget, this._document.text().length());
      const cursorState = this._states.firstStarting(cursor.from, cursor.from + 0.5);
      const firstConvergence = this._states.firstStarting(cursor.from + 0.5, to);
      const secondConvergence = firstConvergence ? this._states.lastStarting(firstConvergence.from + 0.5, to) : null;
      const parser = new Parser(this._document.text().iterator(cursor.from), cursorState.data);
      let converged = false;
      let offset = cursor.from + STATE_CHUNK;
      // Try to converge on the first state.
      if (firstConvergence) {
        this._states.clearStarting(cursor.from + 0.5, firstConvergence.from + 0.5);
        for (; offset < firstConvergence.from; offset += STATE_CHUNK) {
          parser.it.setConstraints(0, offset);
          for (let token of parser);
          this._states.add(offset, offset, parser.state());
        }
        // Iterate up to the first convergence.
        parser.it.setConstraints(0, firstConvergence.from);
        for (let token of parser);
        this._states.add(firstConvergence.from, firstConvergence.from, parser.state());
        // Check convergence.
        converged = isEqualState(parser.state(), firstConvergence.data);
      }
      // Try to converge on the last state.
      if (!converged && secondConvergence) {
        this._states.clearStarting(firstConvergence.from + 0.5, secondConvergence.from + 0.5);
        for (; offset < secondConvergence.from; offset += STATE_CHUNK) {
          parser.it.setConstraints(0, offset);
          for (let token of parser);
          this._states.add(offset, offset, parser.state());
        }
        // Iterate up to the second convergence.
        parser.it.setConstraints(0, secondConvergence.from);
        for (let token of parser);
        this._states.add(secondConvergence.from, secondConvergence.from, parser.state());
        // Check convergence.
        converged = isEqualState(parser.state(), secondConvergence.data);
      }
      // If we converged either in the beginning or in the end, then
      // drop the cursor and move to the other cursors.
      if (converged) {
        this._cursors.clearStarting(cursor.from, parser.it.offset);
        budget -= parser.it.offset - cursor.from;
        continue;
      }
      // Otherwise, eat the rest of the budget to push the cursor as far as
      // possible.
      this._states.clearStarting(offset + 0.5, to);
      for (; offset < to; offset += STATE_CHUNK) {
        parser.it.setConstraints(0, offset);
        for (let token of parser);
        this._states.add(offset, offset, parser.state());
      }
      this._cursors.clearStarting(cursor.from, to);
      const state = this._states.lastStarting(cursor.from, to);
      this._cursors.add(state.from, state.from);
      break;
    }

    // If there's at least one cursor - schedule more work.
    if (this._cursors.countAll())
      this._scheduleHighlight();
    this._editor.raf();
  }

  _scheduleHighlight() {
    if (!this._jobId)
      this._jobId = this._platformSupport.requestIdleCallback(this._doHighlight.bind(this));
  }

  dispose() {
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
    if (!replacements.length)
      return;
    for (const replacement of replacements) {
      let from = replacement.offset;
      let to = from + replacement.removed.length();
      this._states.replace(from, to, replacement.inserted.length());
      this._cursors.replace(from, to, replacement.inserted.length());
      const state = this._states.lastStarting(0, from + 0.5);
      // Cursors should be always aligned with undamaged states.
      this._cursors.clearAll(state.from, state.from + 0.5);
      this._cursors.add(state.from, state.from);
    }
    this._scheduleHighlight();
  }

  /**
   * @param {!VisibleContent} visibleContent
   * @return {!DecorationResult}
   */
  _onDecorate(visibleContent) {
    trace.beginGroup('js');
    let decorator = new TextDecorator();
    for (let range of visibleContent.ranges) {
      let decoration = this._states.lastStarting(range.from - STATE_CHUNK, range.from + 1);
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
