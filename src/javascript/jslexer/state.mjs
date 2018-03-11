import {keywords} from "./identifier.mjs"
import {types as tt} from "./tokentype.mjs"

function keywordRegexp(words) {
  return new RegExp("^(?:" + words.replace(/ /g, "|") + ")$")
}

export const defaultOptions = {
  // `ecmaVersion` indicates the ECMAScript version to parse. Must
  // be either 3, 5, 6, 7, or 8. This influences support
  // for strict mode, the set of reserved words, and support for
  // new syntax features. The default is 7.
  ecmaVersion: 7,
  // `sourceType` indicates the mode the code should be parsed in.
  // Can be either `"script"` or `"module"`. This influences global
  // strict mode and parsing of `import` and `export` declarations.
  sourceType: "script",
  // When enabled, hashbang directive in the beginning of file
  // is allowed and treated as a line comment.
  allowHashBang: true,
}

export class Parser {
  static defaultState(options = {}) {
    const state = {};
    state.options = Object.assign({}, defaultOptions, options);
    state.offset = 0;

    // Used to signal to callers of `readWord1` whether the word
    // contained any escape sequences. This is needed because words with
    // escape sequences must not be interpreted as keywords.
    state.containsEsc = false

    // Set up token state

    // Properties of the current token:
    // Its type
    state.type = tt.eof
    // For tokens that include more information than their type, the value
    state.value = null
    // Its start and end offset
    state.startOffset = 0;
    state.endOffset = 0;

    // Position information for the previous token
    state.lastTokEndOffset = 0;
    state.lineBreakSinceLastTokEnd = false;

    state.recoveryNeeded = false;
    state.recoveryOffset = 0;
    state.recoveryType = null;
    state.recoveryQuote = '';

    // The context stack is used to superficially track syntactic
    // context to predict whether a regular expression is allowed in a
    // given position.
    state.context = [Parser.prototype.initialContext()];
    state.exprAllowed = true
    return state;
  }

  constructor(iterator, state) {
    this.options = state.options;

    this.it = iterator;

    // Used to signal to callers of `readWord1` whether the word
    // contained any escape sequences. This is needed because words with
    // escape sequences must not be interpreted as keywords.
    this.containsEsc = state.containsEsc;

    // Set up token state

    // Properties of the current token:
    // Its type
    this.type = state.type;
    // For tokens that include more information than their type, the value
    this.value = state.value;
    // Its start and end offset
    this.startOffset = state.startOffset;
    this.endOffset = state.endOffset;

    // Position information for the previous token
    this.lastTokEndOffset = state.lastTokEndOffset;
    this.lineBreakSinceLastTokEnd = state.lineBreakSinceLastTokEnd;

    this.recoveryNeeded = state.recoveryNeeded;
    this.recoveryOffset = state.recoveryOffset;
    this.recoveryType = state.recoveryType;
    this.recoveryQuote = state.recoveryQuote;

    // The context stack is used to superficially track syntactic
    // context to predict whether a regular expression is allowed in a
    // given position.
    this.context = state.context.slice();
    this.exprAllowed = state.exprAllowed;

    // Infer state parts from options.
    this.keywords = keywordRegexp(keywords[this.options.ecmaVersion >= 6 ? 6 : 5])
    this.inModule = this.options.sourceType === "module"
    this.strict = this.inModule

    // Rebaseline offsets since we might be restored at a different position.
    this._rebaselineOffsets(state.offset, iterator.offset);
  }

  _rebaselineOffsets(oldOffset, newOffset) {
    const offsetDelta = newOffset - oldOffset;
    this.startOffset += offsetDelta;
    this.endOffset += offsetDelta;
    this.lastTokEndOffset += offsetDelta;
    this.recoveryOffset += offsetDelta;
  }

  setIterator(it) {
    this._rebaselineOffsets(this.it.offset, it.offset);
    this.it = it;
  }

  state() {
    return {
      options: this.options,
      offset: this.it.offset,
      containsEsc: this.containsEsc,
      type: this.type,
      value: this.value,
      startOffset: this.startOffset,
      endOffset: this.endOffset,
      lastTokEndOffset: this.lastTokEndOffset,
      lineBreakSinceLastTokEnd: this.lineBreakSinceLastTokEnd,
      recoveryNeeded: this.recoveryNeeded,
      recoveryOffset: this.recoveryOffset,
      recoveryType: this.recoveryType,
      recoveryQuote: this.recoveryQuote,
      context: this.context.slice(),
      exprAllowed: this.exprAllowed,
    };
  }
}

