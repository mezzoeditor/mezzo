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
  allowHashBang: false,
}

export class Parser {
  constructor(options, iterator) {
    this.options = Object.assign({}, defaultOptions, options);
    this.keywords = keywordRegexp(keywords[this.options.ecmaVersion >= 6 ? 6 : 5])

    this.it = iterator;

    // Used to signal to callers of `readWord1` whether the word
    // contained any escape sequences. This is needed because words with
    // escape sequences must not be interpreted as keywords.
    this.containsEsc = false

    // Set up token state

    // Properties of the current token:
    // Its type
    this.type = tt.eof
    // For tokens that include more information than their type, the value
    this.value = null
    // Its start and end offset
    this.startOffset = this.it.offset;
    this.endOffset = this.it.offset;

    // Position information for the previous token
    this.lastTokEnd = this.it.offset;
    this.lineBreakSinceLastTokEnd = false;

    // The context stack is used to superficially track syntactic
    // context to predict whether a regular expression is allowed in a
    // given position.
    this.context = [this.initialContext()];
    this.exprAllowed = true

    // Figure out if it's a module code.
    this.inModule = this.options.sourceType === "module"
    this.strict = this.inModule
  }
}

