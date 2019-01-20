import {keywords} from "./identifier.js";
import {types as tt, serializeTokenType, deserializeTokenType} from "./tokentype.js";
import {types, serializeTokenContext, deserializeTokenContext} from './tokencontext.js';

function keywordRegexp(words) {
  return new RegExp("^(?:" + words.replace(/ /g, "|") + ")$")
}

const keywordRegexp5 = keywordRegexp(keywords[5]);
const keywordRegexp6 = keywordRegexp(keywords[6]);

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
    state.context = [types.b_stat];
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
    this.keywords = this.options.ecmaVersion >= 6 ? keywordRegexp6 : keywordRegexp5;
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

Parser.prototype.braceIsBlock = function(prevType) {
  let parent = this.curContext()
  if (parent === types.f_expr || parent === types.f_stat)
    return true
  if (prevType === tt.colon && (parent === types.b_stat || parent === types.b_expr))
    return !parent.isExpr

  // The check for `tt.name && exprAllowed` detects whether we are
  // after a `yield` or `of` construct. See the `updateContext` for
  // `tt.name`.
  if (prevType === tt._return || prevType == tt.name && this.exprAllowed)
    return this.lineBreakSinceLastTokEnd;
  if (prevType === tt._else || prevType === tt.semi || prevType === tt.eof || prevType === tt.parenR || prevType == tt.arrow)
    return true
  if (prevType == tt.braceL)
    return parent === types.b_stat
  if (prevType == tt._var || prevType == tt.name)
    return false
  return !this.exprAllowed
}

Parser.prototype.inGeneratorContext = function() {
  for (let i = this.context.length - 1; i >= 1; i--) {
    let context = this.context[i]
    if (context.token === "function")
      return context.generator
  }
  return false
}

Parser.prototype.updateContext = function(prevType) {
  let update, type = this.type
  if (type.keyword && prevType == tt.dot)
    this.exprAllowed = false
  else if (update = type.updateContext)
    update.call(this, prevType)
  else
    this.exprAllowed = type.beforeExpr
}

export function serializeState(state) {
  return Object.assign({}, state, {
    context: state.context.map(serializeTokenContext),
    type: serializeTokenType(state.type),
    recoveryType: serializeTokenType(state.recoveryType),
  });
}

export function deserializeState(state) {
  return Object.assign({}, state, {
    context: state.context.map(deserializeTokenContext),
    type: deserializeTokenType(state.type),
    recoveryType: deserializeTokenType(state.recoveryType),
  });
}
export function isEqualState(a, b) {
  const fastPath = a.options.ecmaVersion === b.options.ecmaVersion &&
    a.options.sourceType === b.options.sourceType &&
    a.options.allowHashBang === b.options.allowHashBang &&
    // We should compare everything BUT offsets: they are stale
    // and will be restored with 'setIterator' call.
    // a.offset === b.offset &&
    // a.startOffset === b.startOffset &&
    // a.endOffset === b.endOffset &&
    // a.lastTokEndOffset === b.lastTokEndOffset &&
    // a.recoveryOffset === b.recoveryOffset &&
    a.containsEsc === b.containsEsc &&
    a.type === b.type &&
    a.value === b.value &&
    a.lineBreakSinceLastTokEnd === b.lineBreakSinceLastTokEnd &&
    a.recoveryNeeded === b.recoveryNeeded &&
    a.recoveryType === b.recoveryType &&
    a.recoveryQuote === b.recoveryQuote &&
    a.exprAllowed === b.exprAllowed &&
    a.context.length === b.context.length;
  if (!fastPath)
    return false;
  for (let i = 0; i < a.context.length; ++i) {
    if (a.context[i] !== b.context[i])
      return false;
  }
  return true;
}

