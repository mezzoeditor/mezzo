import {reservedWords, keywords} from "./identifier.mjs"
import {types as tt} from "./tokentype.mjs"
import {lineBreak} from "./whitespace.mjs"
import {getOptions} from "./options.mjs"

function keywordRegexp(words) {
  return new RegExp("^(?:" + words.replace(/ /g, "|") + ")$")
}

export class Parser {
  constructor(options, iterator) {
    this.options = options = getOptions(options)
    this.keywords = keywordRegexp(keywords[options.ecmaVersion >= 6 ? 6 : 5])
    let reserved = ""
    if (!options.allowReserved) {
      for (let v = options.ecmaVersion;; v--)
        if (reserved = reservedWords[v]) break
      if (options.sourceType == "module") reserved += " await"
    }
    this.reservedWords = keywordRegexp(reserved)
    let reservedStrict = (reserved ? reserved + " " : "") + reservedWords.strict
    this.reservedWordsStrict = keywordRegexp(reservedStrict)
    this.reservedWordsStrictBind = keywordRegexp(reservedStrict + " " + reservedWords.strictBind)

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
    this.start = this.it.clone();
    this.end = this.it.clone();

    // Position information for the previous token
    this.lastTokStart = this.it.clone();
    this.lastTokEnd = this.it.clone();

    // The context stack is used to superficially track syntactic
    // context to predict whether a regular expression is allowed in a
    // given position.
    this.context = this.initialContext()
    this.exprAllowed = true

    // Figure out if it's a module code.
    this.inModule = options.sourceType === "module"
    this.strict = this.inModule

    // Flags to track whether we are in a function, a generator, an async function.
    this.inFunction = this.inGenerator = this.inAsync = false
    // Positions to delayed-check that yield/await does not exist in default parameters.
    this.yieldPos = this.awaitPos = 0
    // Labels in scope.
    this.labels = []
  }
}
