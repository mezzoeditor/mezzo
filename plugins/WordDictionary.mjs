import { EventEmitter } from '../src/utils/EventEmitter.mjs';
import { WorkAllocator } from '../src/core/WorkAllocator.mjs';
import { Document } from '../src/text/Document.mjs';

const DEFAULT_OPTIONS = {
  /**
   * Words with length EQUAL or MORE will not be indexed.
   */
  maxWordLength: 100,
  /**
   * Text changes under this size will be process synchronously.
   * Should be at least 2 * |maxWordLength| so that continuous
   * editing is updated immediately.
   */
  maxSyncChunkSize: 200,
  /**
   * Asynchronous work will be split into this quants of work.
   */
  chunkSize: 2000,
  /**
   * An array of regexes to filter out word suggestions.
   */
  ignore: [],
};

export class WordDictionary extends EventEmitter {
  constructor(editor, options = DEFAULT_OPTIONS) {
    super();
    this._editor = editor;
    this._document = editor.document();
    this._options = {...DEFAULT_OPTIONS, ...options};
    if (this._options.maxSyncChunkSize < 2 * this._options.maxWordLength)
      throw new Error('maxSyncChunkSize must be at least 2 * maxWordLength!');

    this._words = new Map();
    this._tasks = [];
    this._jobId = 0;

    this._eventListeners = [
      this._document.on(Document.Events.Changed, this._onDocumentChanged.bind(this)),
    ];

    this._maybeAddTask({
      type: 'add',
      text: this._document.text(),
      from: 0,
      to: this._document.text().length(),
    });
  }

  setIgnores(ignores) {
    this._options.ignores = ignores;
    this.emit(WordDictionary.Events.Changed);
  }

  editor() {
    return this._editor;
  }

  /**
   * @param {number} offset
   * @return {string}
   */
  prefix(offset) {
    const tokenizer = this._editor.tokenizer();
    if (!tokenizer || !offset)
      return '';
    const left = Math.max(0, offset - this._options.maxWordLength);
    const it = this._document.text().iterator(offset - 1, left);
    let reversedPrefix = [];
    while (!it.outOfBounds() && tokenizer.isWordChar(it.current)) {
      reversedPrefix.push(it.current);
      it.prev();
    }
    if (!reversedPrefix.length)
      return '';
    return reversedPrefix.reverse().join('');
  }

  /**
   * @param {string} prefix
   * @param {number=} limit
   * @return {!Array<string>}
   */
  wordsWithPrefix(prefix, limit = Infinity) {
    return Array.from(this._words.keys())
      .filter(word => word.startsWith(prefix))
      .filter(word => word !== prefix || this._words.get(prefix) > 1)
      .filter(word => {
        if (!word.startsWith(prefix))
          return false;
        if (word === prefix && this._words.get(prefix) === 1)
          return false;
        for (const regex of this._options.ignore) {
          if (regex.test(word))
            return false;
        }
        return true;
      })
      .sort()
      .slice(0, limit);
  }

  /**
   * @param {!DocumentChangedEvent} event
   */
  _onDocumentChanged({replacements}) {
    if (!replacements.length)
      return;
    let changed = false;
    for (const replacement of replacements) {
      // If the remove size is more than half of the
      // text itself, than clear everything and re-add text.
      if (replacement.removed.length() > replacement.before.length() / 2) {
        // Since we remove all text - all previous tasks are irrelevant.
        this._tasks = [];
        if (this._jobId) {
          this._editor.platformSupport().cancelIdleCallback(this._jobId);
          this._jobId = 0;
        }
        this._words.clear();
      } else {
        // Otherwise, index removed text.
        changed = this._maybeAddTask({
          type: 'remove',
          text: replacement.before,
          from: replacement.offset,
          to: replacement.offset + replacement.removed.length(),
        }) || changed;
      }
      // Index added text.
      changed = this._maybeAddTask({
        type: 'add',
        text: replacement.after,
        from: replacement.offset,
        to: replacement.offset + replacement.inserted.length(),
      }) || changed;
    }
    if (changed)
      this.emit(WordDictionary.Events.Changed);
  }

  _maybeAddTask(task) {
    if (task.to - task.from < this._options.maxSyncChunkSize)
      return this._runTask(task);
    this._tasks.push(task);
    if (!this._jobId)
      this._jobId = this._editor.platformSupport().requestIdleCallback(this._doWork.bind(this));
    return false;
  }

  _doWork() {
    this._jobId = 0;
    let budget = this._options.chunkSize;;
    let changed = false;
    while (this._tasks.length && budget > 0) {
      let task = this._tasks.pop();
      if (task.to - task.from > budget) {
        const split = task.from + budget;
        const task1 = {
          type: task.type,
          text: task.text,
          from: task.from,
          to: split,
        };
        const task2 = {
          type: task.type === 'add' ? 'remove' : 'add',
          text: task.text,
          from: split,
          to: split,
        };
        const task3 = {
          type: task.type,
          text: task.text,
          from: split,
          to: task.to,
        };
        this._tasks.push(task2, task3);
        task = task1;
      }
      budget -= task.to - task.from;
      changed = this._runTask(task) || changed;
    }
    if (this._tasks.length)
      this._jobId = this._editor.platformSupport().requestIdleCallback(this._doWork.bind(this));
    if (changed)
      this.emit(WordDictionary.Events.Changed);
  }

  _runTask(task) {
    const words = this._computeWords(task.text, this._editor.tokenizer(), task.from, task.to);
    if (!words.length)
      return false;
    if (task.type === 'add') {
      for (const word of words) {
        let count = this._words.get(word) || 0;
        this._words.set(word, count + 1);
      }
    } else {
      for (const word of words) {
        let count = this._words.get(word) - 1;
        if (!count)
          this._words.delete(word);
        else
          this._words.set(word, count);
      }
    }
    return true;
  }

  _computeWords(text, tokenizer, from, to) {
    if (!tokenizer)
      return [];
    const MAX_WORD_LENGTH = this._options.maxWordLength;
    const words = [];
    const left = Math.max(0, from - MAX_WORD_LENGTH);
    const right = Math.min(text.length(), to + MAX_WORD_LENGTH);
    const it = text.iterator(left, left, right);
    while (!it.outOfBounds()) {
      // move forward to find word start
      while (!it.outOfBounds() && !tokenizer.isWordChar(it.current))
        it.next();
      let word = '';
      while (!it.outOfBounds() && tokenizer.isWordChar(it.current)) {
        word += it.current;
        it.next();
      }
      if (it.offset < from || it.offset - word.length > to)
        continue;
      if (word && word.length < MAX_WORD_LENGTH)
        words.push(word);
    }
    return words;
  }

  dispose() {
    EventEmitter.removeEventListeners(this._eventListeners);
    if (this._jobId) {
      this._editor.platformSupport().cancelIdleCallback(this._jobId);
      this._jobId = 0;
    }
    this._tasks = [];
    this._words.clear();
  }
}

WordDictionary.Events = {
  Changed: 'changed',
};

