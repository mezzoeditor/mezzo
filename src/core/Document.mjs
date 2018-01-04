import { Decorator } from "./Decorator.mjs";
import { History } from "./History.mjs";
import { Text } from "./Text.mjs";
import { Viewport } from "./Viewport.mjs";

export class Document {
  /**
   * @param {function()} onInvalidate
   * @param {function(number)} onReveal
   */
  constructor(onInvalidate, onReveal) {
    this._onInvalidate = onInvalidate;
    this._onReveal = onReveal;
    this._plugins = new Map();
    this._decorators = new Set();
    this._history = new History({
      text: Text.withContent(''),
      replacements: [],
      data: new Map(),
      operation: '__initial__'
    });
    this._text = this._history.current().text;
    this._operations = [];
    this._replacements = [];
    this._frozen = false;
  }

  /**
   * @param {string} text
   */
  reset(text) {
    if (this._operations.length)
      throw 'Cannot reset during operation';
    if (this._frozen)
      throw 'Cannot mutate while building viewport';
    let to = this._text.length();
    this._history.reset({
      text: Text.withContent(text),
      replacements: [],
      data: new Map(),
      operation: '__initial__'
    });
    this._text = this._history.current().text;
    for (let plugin of this._plugins.values()) {
      if (plugin.onReplace)
        plugin.onReplace(0, to, text.length);
    }
    this.invalidate();
  }

  invalidate() {
    this._onInvalidate.call(null);
  }

  /**
   * @param {number} offset
   */
  reveal(offset) {
    this._onReveal.call(null, offset);
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
      throw 'Cannot mutate while building viewport';
    this._replacements.push({from, to, inserted: insertion.length});
    let text = this._text.replace(from, to, insertion);
    this._text.resetCache();
    this._text = text;
    for (let plugin of this._plugins.values()) {
      if (plugin.onReplace)
        plugin.onReplace(from, to, insertion.length);
    }
  }

  /**
   * @param {string} name
   */
  begin(name) {
    if (this._frozen)
      throw 'Cannot mutate while building viewport';
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
    for (let name of this._plugins.keys()) {
      let plugin = this._plugins.get(name);
      let data;
      // TODO: investigate not saving state every time if we can collapse states.
      //       Or maybe presistent data structures will save us?
      if (plugin.onSave)
        data = plugin.onSave();
      if (data !== undefined)
        state.data.set(name, data);
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
    if (this._frozen)
      throw 'Cannot mutate while building viewport';

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
    for (let name of this._plugins.keys()) {
      let plugin = this._plugins.get(name);
      let data = current.data.get(name);
      if (plugin.onRestore)
        plugin.onRestore(replacements, data);
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
    if (this._frozen)
      throw 'Cannot mutate while building viewport';

    let redone = this._history.redo(state => this._filterHistory(state, name));
    if (!redone)
      return false;

    let replacements = [];
    for (let state of redone)
      replacements.push(...state.replacements);

    let current = this._history.current();
    this._text = current.text;
    for (let name of this._plugins.keys()) {
      let plugin = this._plugins.get(name);
      let data = current.data.get(name);
      if (plugin.onRestore)
        plugin.onRestore(replacements, data);
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
   * @param {string} name
   * @param {!Plugin} plugin
   */
  addPlugin(name, plugin) {
    if (this._plugins.get(name))
      throw 'Duplicate plugin';
    this._plugins.set(name, plugin);
    if (plugin.onAdded)
      plugin.onAdded(this);
    if (plugin.onViewport)
      this.invalidate();
  }

  /**
   * @param {string} name
   * @param {!Plugin} plugin
   */
  removePlugin(name, plugin) {
    if (this._plugins.get(name) !== plugin)
      throw 'No such plugin';
    this._plugins.delete(name);
    if (plugin.onRemoved)
      plugin.onRemoved(this);
    if (plugin.onViewport)
      this.invalidate();
  }

  /**
   * @param {!Decorator} decorator
   */
  addDecorator(decorator) {
    if (this._frozen)
      throw 'Cannot mutate while building viewport';
    this._decorators.add(decorator);
    this.invalidate();
  }

  /**
   * @param {!Decorator} decorator
   */
  removeDecorator(decorator) {
    if (this._frozen)
      throw 'Cannot mutate while building viewport';
    if (!this._decorators.has(decorator))
      throw 'No such decorator';
    this._decorators.delete(decorator);
    this.invalidate();
  }

  /**
   * @param {string} command
   * @param {*} data
   * @return {*}
   */
  perform(command, data) {
    if (this._frozen)
      throw 'Cannot mutate while building viewport';
    if (command === 'history.undo')
      return this.undo(data);
    if (command === 'history.redo')
      return this.redo(data);
    for (let plugin of this._plugins.values()) {
      if (!plugin.onCommand)
        continue;
      let result = plugin.onCommand(command, data);
      if (result !== undefined)
        return result;
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
   * @return {?{line: number, column: number, offset: number}}
   */
  offsetToPosition(offset) {
    return this._text.offsetToPosition(offset);
  }

  /**
   * @param {!{line: number, column: number}} position
   * @param {boolean=} clamp
   * @return {number}
   */
  positionToOffset(position, clamp) {
    return this._text.positionToOffset(position, clamp);
  }

  /**
   * @package
   * @param {!Viewport} viewport
   * @return {!Set<!Decorator>}
   */
  decorateViewport(viewport) {
    this._frozen = true;
    for (let plugin of this._plugins.values()) {
      if (plugin.onViewport)
        plugin.onViewport(viewport);
    }
    this._frozen = false;
    return this._decorators;
  }
};

Document.Commands = new Set(['history.undo', 'history.redo']);
