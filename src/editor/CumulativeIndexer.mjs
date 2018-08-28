import { Decorator} from '../core/Decorator.mjs';
import { Document } from '../core/Document.mjs';
import { EventEmitter } from '../core/EventEmitter.mjs';

export class CumulativeIndexer {
  /**
   * @param {!Editor} editor
   * @param {!CumulativeIndexer.Delegate} delegate
   * @param {{budget: number, density: number}=} options
   */
  constructor(editor, delegate, options) {
    this._budget = options.budget || 20000;
    this._density = options.density || 2000;
    this._editor = editor;
    this._document = editor.document();
    this._platformSupport = editor.platformSupport();
    this._delegate = delegate;

    this._states = new Decorator();
    this._states.add(0, 0, delegate.initialState());
    this._cursors = new Decorator();
    this._cursors.add(0, 0);

    this._eventListeners = [
      this._document.on(Document.Events.Changed, this._onDocumentChanged.bind(this)),
    ];

    this._jobId = 0;
    this._scheduleHighlight();
  }

  states() {
    return this._states;
  }

  _doHighlight() {
    this._jobId = 0;

    let budget = this._budget;
    const STATE_CHUNK = this._density;
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
      const indexer = this._delegate.createIndexer(this._document, cursor.from, cursorState.data);
      let lastTrustedStateOffset = cursor.from;
      let successfulConvergence = false;
      let offset = cursor.from + STATE_CHUNK;
      // Try to converge on the first state.
      if (firstConvergence) {
        this._states.clearStarting(lastTrustedStateOffset + 0.5, firstConvergence.from + 0.5);
        for (; offset < firstConvergence.from; offset += STATE_CHUNK)
          this._states.add(offset, offset, indexer(offset));
        // Iterate up to the first convergence.
        const state = indexer(firstConvergence.from);
        this._states.add(firstConvergence.from, firstConvergence.from, state);
        lastTrustedStateOffset = firstConvergence.from;
        successfulConvergence = this._delegate.isEqualStates(state, firstConvergence.data);
      }
      // Try to converge on the last state.
      if (!successfulConvergence && secondConvergence) {
        this._states.clearStarting(lastTrustedStateOffset + 0.5, secondConvergence.from + 0.5);
        for (; offset < secondConvergence.from; offset += STATE_CHUNK)
          this._states.add(offset, offset, indexer(offset));
        // Iterate up to the second convergence.
        const state = indexer(secondConvergence.from);
        this._states.add(secondConvergence.from, secondConvergence.from, state);
        lastTrustedStateOffset = secondConvergence.from;
        successfulConvergence = this._delegate.isEqualStates(state, secondConvergence.data);
      }
      // If we converged either in the beginning or in the end, then
      // drop the cursor and move to the other cursors.
      if (successfulConvergence) {
        this._cursors.clearStarting(cursor.from, lastTrustedStateOffset);
        budget -= lastTrustedStateOffset - cursor.from;
        continue;
      }
      // Otherwise, eat the rest of the budget to push the cursor as far as
      // possible.
      this._states.clearStarting(lastTrustedStateOffset + 0.5, to + 0.5);
      for (; offset < to; offset += STATE_CHUNK)
        this._states.add(offset, offset, indexer(offset));
      this._states.add(to, to, indexer(to));
      lastTrustedStateOffset = to;
      this._cursors.clearStarting(cursor.from, lastTrustedStateOffset);
      this._cursors.add(lastTrustedStateOffset, lastTrustedStateOffset);
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
      this._cursors.clearStarting(state.from, state.from + 0.5);
      this._cursors.add(state.from, state.from);
    }
    this._scheduleHighlight();
  }
}

CumulativeIndexer.Delegate = class {
  initialState() { }

  isEqualStates(state1, state2) { }

  /**
   * Return a function that can be called with sequential offsets
   * and returns tokenization state at these offsets.
   * @return {function(number):*}
   */
  createIndexer(document, offset, state) {
  }
}
