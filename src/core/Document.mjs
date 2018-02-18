import { History } from "./History.mjs";
import { Text } from "./Text.mjs";
import { Frame } from "./Frame.mjs";
import { Viewport } from "./Viewport.mjs";

export class Document {
  constructor() {
    this._plugins = [];
    this._viewports = [];
    this._measurer = { defaultWidth: 1, defaultHeight: 1, measureChunk: chunk => 0, measureChar: charCode => 1 };
    this._history = new History({
      text: Text.withContent('', this._measurer),
      replacements: [],
      data: new Map(),
      operation: '__initial__'
    });
    this._text = this._history.current().text;
    this._operations = [];
    this._replacements = [];
    this._frozen = false;
    this._tokenizer = null;
  }

  /**
   * @return {?Tokenizer}
   */
  tokenizer() {
    return this._tokenizer;
  }

  /**
   * @param {?Tokenizer} tokenizer
   */
  setTokenizer(tokenizer) {
    this._tokenizer = tokenizer;
  }

  /**
   * @return {!Measurer}
   */
  measurer() {
    return this._measurer;
  }

  /**
   * @param {!Measurer} measurer
   */
  setMeasurer(measurer) {
    this._measurer = measurer;
    // TODO: this is not quite correct.
    // Instead, we should either rebuild the whole history or mark history states
    // with measurer and rebuild lazily.
    this.reset(this.content());
  }

  /**
   * @param {number} fontLineHeight
   * @param {number} fontCharWidth
   * @return {!Viewport}
   */
  createViewport(fontLineHeight, fontCharWidth) {
    let viewport = new Viewport(this, fontLineHeight, fontCharWidth);
    this._viewports.push(viewport);
    return viewport;
  }

  /**
   * @param {string} text
   */
  reset(text) {
    if (this._operations.length)
      throw 'Cannot reset during operation';
    if (this._frozen)
      throw 'Cannot edit while building frame';
    let to = this._text.length();
    this._history.reset({
      text: Text.withContent(text, this._measurer),
      replacements: [],
      data: new Map(),
      operation: '__initial__'
    });
    this._text = this._history.current().text;
    for (let plugin of this._plugins) {
      if (plugin.onReplace)
        plugin.onReplace(0, to, text.length);
    }
    this.invalidate();
  }

  invalidate() {
    for (let viewport of this._viewports)
      viewport.invalidate();
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {string} insertion
   */
  replace(from, to, insertion) {
    if (!this._operations.length)
      throw 'Cannot edit outside of operation';
    if (this._frozen)
      throw 'Cannot edit while building frame';
    this._replacements.push({from, to, inserted: insertion.length});
    let text = this._text.replace(from, to, insertion);
    this._text.resetCache();
    this._text = text;
    for (let plugin of this._plugins) {
      if (plugin.onReplace)
        plugin.onReplace(from, to, insertion.length);
    }
  }

  /**
   * @param {string} name
   */
  begin(name) {
    this._operations.push(name);
  }

  /**
   * @param {string} name
   */
  end(name) {
    if (this._operations[this._operations.length - 1] !== name)
      throw 'Trying to end wrong operation';
    this._operations.pop();
    if (this._operations.length)
      return;

    let state = {
      text: this._text,
      data: new Map(),
      replacements: this._replacements,
      operation: name
    };
    this._replacements = [];
    for (let plugin of this._plugins) {
      // TODO: investigate not saving state every time if we can collapse states.
      //       Or maybe presistent data structures will save us?
      if (plugin.onSave) {
        let data = plugin.onSave();
        if (data !== undefined)
          state.data.set(plugin, data);
      }
    }
    this._history.push(state);
    this.invalidate();
  }

  /**
   * @param {string=} name
   * @return {boolean}
   */
  undo(name) {
    if (this._operations.length)
      throw 'Cannot undo during operation';

    let undone = this._history.undo(state => this._filterHistory(state, name));
    if (!undone)
      return false;

    let replacements = [];
    for (let state of undone) {
      for (let i = state.replacements.length - 1; i >= 0; i--) {
        let {from, to, inserted} = state.replacements[i];
        replacements.push({from, to: from + inserted, inserted: to - from});
      }
    }

    let current = this._history.current();
    this._text = current.text;
    for (let plugin of this._plugins) {
      if (plugin.onRestore) {
        let data = current.data.get(plugin);
        plugin.onRestore(replacements, data);
      }
    }
    this.invalidate();
    return true;
  }

  /**
   * @param {string=} name
   * @return {boolean}
   */
  redo(name) {
    if (this._operations.length)
      throw 'Cannot redo during operation';

    let redone = this._history.redo(state => this._filterHistory(state, name));
    if (!redone)
      return false;

    let replacements = [];
    for (let state of redone)
      replacements.push(...state.replacements);

    let current = this._history.current();
    this._text = current.text;
    for (let plugin of this._plugins) {
      if (plugin.onRestore) {
        let data = current.data.get(plugin);
        plugin.onRestore(replacements, data);
      }
    }
    this.invalidate();
    return true;
  }

  /**
   * @param {*} state
   * @param {string|undefined} name
   */
  _filterHistory(state, name) {
    if (!name)
      return true;
    if (name[0] === '!')
      return state.operation !== name.substring(1);
    return state.operation === name;
  }

  /**
   * @param {!Plugin} plugin
   */
  addPlugin(plugin) {
    if (this._plugins.indexOf(plugin) !== -1)
      throw 'Duplicate plugin';
    this._plugins.push(plugin);
    if (plugin.onFrame)
      this.invalidate();
  }

  /**
   * @param {!Plugin} plugin
   */
  removePlugin(plugin) {
    let index = this._plugins.indexOf(plugin);
    if (index === -1)
      throw 'No such plugin';
    this._plugins.splice(index, 1);
    if (plugin.onFrame)
      this.invalidate();
  }

  /**
   * @param {string} command
   * @param {*} data
   * @return {*}
   */
  perform(command, data) {
    if (command === 'history.undo')
      return this.undo(data);
    if (command === 'history.redo')
      return this.redo(data);
    for (let plugin of this._plugins) {
      if (plugin.onCommand) {
        let result = plugin.onCommand(command, data);
        if (result !== undefined)
          return result;
      }
    }
  }

  /**
   * @param {number=} from
   * @param {number=} to
   * @return {string}
   */
  content(from, to) {
    return this._text.content(from, to);
  }

  /**
   * @param {number} offset
   * @param {number=} from
   * @param {number=} to
   * @return {!Text.Iterator}
   */
  iterator(offset, from, to) {
    return this._text.iterator(offset, from, to);
  }

  /**
   * @return {number}
   */
  lineCount() {
    return this._text.lineCount();
  }

  /**
   * @return {number}
   */
  longestLineLength() {
    return this._text.longestLineLength();
  }

  /**
   * @return {number}
   */
  length() {
    return this._text.length();
  }

  /**
   * @param {number} offset
   * @return {?Position}
   */
  offsetToPosition(offset) {
    return this._text.offsetToLocation(offset);
  }

  /**
   * @param {!Position} position
   * @param {boolean=} strict
   * @return {number}
   */
  positionToOffset(position, strict) {
    return this._text.positionToLocation(position, strict).offset;
  }

  /**
   * @param {!Point} point
   * @param {boolean=} strict
   * @return {!Position}
   */
  pointToPosition(point, strict) {
    return this._text.pointToLocation(point, strict);
  }

  beforeFrame() {
    for (let plugin of this._plugins) {
      if (plugin.onBeforeFrame)
        plugin.onBeforeFrame();
    }
  }

  /**
   * @package
   * @param {!Frame} frame
   * @return {{text: !Array<!TextDecorator>, scrollbar: !Array<ScrollbarDecorator>}}
   */
  decorateFrame(frame) {
    this._frozen = true;
    let text = [];
    let scrollbar = [];
    for (let plugin of this._plugins) {
      if (plugin.onFrame) {
        let result = plugin.onFrame(frame);
        text.push(...(result.text || []));
        scrollbar.push(...(result.scrollbar || []));
      }
    }
    this._frozen = false;
    return {text, scrollbar};
  }
};

Document.Commands = new Set(['history.undo', 'history.redo']);
