import {isIdentifierStart, isIdentifierChar} from "./identifier.mjs"
import {types as tt, keywords as keywordTypes} from "./tokentype.mjs"
import {Parser} from "./state.mjs"
import {lineBreak, lineBreakG, isNewLine, nonASCIIwhitespace} from "./whitespace.mjs"

// Object type used to represent tokens. Note that normally, tokens
// simply exist as properties on the parser object. This is only
// used for the onToken callback and the external tokenizer.

export class Token {
  constructor(p) {
    this.type = p.type
    this.value = p.value
    this.start = p.start
    this.end = p.end
  }
}

// ## Tokenizer

const pp = Parser.prototype

// Move to the next token

pp.next = function() {
  this.lastTokEnd = this.end
  this.lastTokStart = this.start
  this.nextToken()
}

pp.getToken = function() {
  this.next()
  return new Token(this)
}

// If we're in an ES6 environment, make parsers iterable
if (typeof Symbol !== "undefined")
  pp[Symbol.iterator] = function() {
    return {
      next: () => {
        let token = this.getToken()
        return {
          done: token.type === tt.eof,
          value: token
        }
      }
    }
  }

// Toggle strict mode. Re-reads the next number or string to please
// pedantic tests (`"use strict"; 010;` should fail).

pp.curContext = function() {
  return this.context[this.context.length - 1]
}

// Read a single token, updating the parser object's token-related
// properties.

pp.nextToken = function() {
  let curContext = this.curContext()
  if (!curContext || !curContext.preserveSpace) this.skipSpace()

  this.start = this.pos
  if (this.pos >= this.input.length) return this.finishToken(tt.eof)

  if (curContext.override) return curContext.override(this)
  else this.readToken(this.fullCharCodeAtPos())
}

pp.readToken = function(code) {
  // If enabled, skip leading hashbang line.
  if (this.pos === 0 && this.input.length > 2 && this.options.allowHashBang && this.input.slice(0, 2) === "#!")
    return this.readLineComment(2)
  // Identifier or keyword. '\uXXXX' sequences are allowed in
  // identifiers, so '\' also dispatches to that.
  if (isIdentifierStart(code, this.options.ecmaVersion >= 6) || code === 92 /* '\' */)
    return this.readWord()

  return this.getTokenFromCode(code)
}

pp.fullCharCodeAtPos = function() {
  let code = this.input.charCodeAt(this.pos)
  if (code <= 0xd7ff || code >= 0xe000) return code
  let next = this.input.charCodeAt(this.pos + 1)
  return (code << 10) + next - 0x35fdc00
}

pp.readBlockComment = function() {
  let start = this.pos, end = this.input.indexOf("*/", this.pos += 2)
  if (end === -1)
    this.pos = this.input.length;
  else
    this.pos = end + 2;
  return this.finishToken(tt.blockComment);
}

pp.readLineComment = function(startSkip) {
  let ch = this.input.charCodeAt(this.pos += startSkip)
  while (this.pos < this.input.length && !isNewLine(ch)) {
    ch = this.input.charCodeAt(++this.pos)
  }
  return this.finishToken(tt.lineComment);
}

// Called at the start of the parse and after every token. Skips
// whitespace and comments, and.

pp.skipSpace = function() {
  loop: while (this.pos < this.input.length) {
    let ch = this.input.charCodeAt(this.pos)
    switch (ch) {
    case 32: case 160: // ' '
      ++this.pos
      break
    case 13:
      if (this.input.charCodeAt(this.pos + 1) === 10) {
        ++this.pos
      }
    case 10: case 8232: case 8233:
      ++this.pos
      break
    default:
      if (ch > 8 && ch < 14 || ch >= 5760 && nonASCIIwhitespace.test(String.fromCharCode(ch))) {
        ++this.pos
      } else {
        break loop
      }
    }
  }
}

// Called at the end of every token. Sets `end`, `val`, and
// maintains `context` and `exprAllowed`, and skips the space after
// the token, so that the next one's `start` will point at the
// right position.

pp.finishToken = function(type, val) {
  this.end = this.pos
  let prevType = this.type
  this.type = type
  this.value = val

  this.updateContext(prevType)
}

// ### Token reading

// This is the function that is called to fetch the next token. It
// is somewhat obscure, because it works in character codes rather
// than characters, and because operator parsing has been inlined
// into it.
//
// All in the name of speed.
//
pp.readToken_dot = function() {
  let next = this.input.charCodeAt(this.pos + 1)
  if (next >= 48 && next <= 57) return this.readNumber(true)
  let next2 = this.input.charCodeAt(this.pos + 2)
  if (this.options.ecmaVersion >= 6 && next === 46 && next2 === 46) { // 46 = dot '.'
    this.pos += 3
    return this.finishToken(tt.ellipsis)
  } else {
    ++this.pos
    return this.finishToken(tt.dot)
  }
}

pp.readToken_slash = function() { // '/'
  let next = this.input.charCodeAt(this.pos + 1)
  if (this.exprAllowed) { ++this.pos; return this.readRegexp() }
  if (next === 61) return this.finishOp(tt.assign, 2)
  return this.finishOp(tt.slash, 1)
}

pp.readToken_mult_modulo_exp = function(code) { // '%*'
  let next = this.input.charCodeAt(this.pos + 1)
  let size = 1
  let tokentype = code === 42 ? tt.star : tt.modulo

  // exponentiation operator ** and **=
  if (this.options.ecmaVersion >= 7 && code == 42 && next === 42) {
    ++size
    tokentype = tt.starstar
    next = this.input.charCodeAt(this.pos + 2)
  }

  if (next === 61) return this.finishOp(tt.assign, size + 1)
  return this.finishOp(tokentype, size)
}

pp.readToken_pipe_amp = function(code) { // '|&'
  let next = this.input.charCodeAt(this.pos + 1)
  if (next === code) return this.finishOp(code === 124 ? tt.logicalOR : tt.logicalAND, 2)
  if (next === 61) return this.finishOp(tt.assign, 2)
  return this.finishOp(code === 124 ? tt.bitwiseOR : tt.bitwiseAND, 1)
}

pp.readToken_caret = function() { // '^'
  let next = this.input.charCodeAt(this.pos + 1)
  if (next === 61) return this.finishOp(tt.assign, 2)
  return this.finishOp(tt.bitwiseXOR, 1)
}

pp.readToken_plus_min = function(code) { // '+-'
  let next = this.input.charCodeAt(this.pos + 1)
  if (next === code) {
    if (next == 45 && !this.inModule && this.input.charCodeAt(this.pos + 2) == 62 &&
        (this.lastTokEnd === 0 || lineBreak.test(this.input.slice(this.lastTokEnd, this.pos)))) {
      // A `-->` line comment
      return this.readLineComment(3)
    }
    return this.finishOp(tt.incDec, 2)
  }
  if (next === 61) return this.finishOp(tt.assign, 2)
  return this.finishOp(tt.plusMin, 1)
}

pp.readToken_lt_gt = function(code) { // '<>'
  let next = this.input.charCodeAt(this.pos + 1)
  let size = 1
  if (next === code) {
    size = code === 62 && this.input.charCodeAt(this.pos + 2) === 62 ? 3 : 2
    if (this.input.charCodeAt(this.pos + size) === 61) return this.finishOp(tt.assign, size + 1)
    return this.finishOp(tt.bitShift, size)
  }
  if (next == 33 && code == 60 && !this.inModule && this.input.charCodeAt(this.pos + 2) == 45 &&
      this.input.charCodeAt(this.pos + 3) == 45) {
    // `<!--`, an XML-style comment that should be interpreted as a line comment
    return this.readLineComment(4)
  }
  if (next === 61) size = 2
  return this.finishOp(tt.relational, size)
}

pp.readToken_eq_excl = function(code) { // '=!'
  let next = this.input.charCodeAt(this.pos + 1)
  if (next === 61) return this.finishOp(tt.equality, this.input.charCodeAt(this.pos + 2) === 61 ? 3 : 2)
  if (code === 61 && next === 62 && this.options.ecmaVersion >= 6) { // '=>'
    this.pos += 2
    return this.finishToken(tt.arrow)
  }
  return this.finishOp(code === 61 ? tt.eq : tt.prefix, 1)
}

pp.getTokenFromCode = function(code) {
  switch (code) {
  // The interpretation of a dot depends on whether it is followed
  // by a digit or another two dots.
  case 46: // '.'
    return this.readToken_dot()

  // Punctuation tokens.
  case 40: ++this.pos; return this.finishToken(tt.parenL)
  case 41: ++this.pos; return this.finishToken(tt.parenR)
  case 59: ++this.pos; return this.finishToken(tt.semi)
  case 44: ++this.pos; return this.finishToken(tt.comma)
  case 91: ++this.pos; return this.finishToken(tt.bracketL)
  case 93: ++this.pos; return this.finishToken(tt.bracketR)
  case 123: ++this.pos; return this.finishToken(tt.braceL)
  case 125: ++this.pos; return this.finishToken(tt.braceR)
  case 58: ++this.pos; return this.finishToken(tt.colon)
  case 63: ++this.pos; return this.finishToken(tt.question)

  case 96: // '`'
    if (this.options.ecmaVersion < 6) break
    ++this.pos
    return this.finishToken(tt.backQuote)

  case 48: // '0'
    let next = this.input.charCodeAt(this.pos + 1)
    if (next === 120 || next === 88) return this.readRadixNumber(16) // '0x', '0X' - hex number
    if (this.options.ecmaVersion >= 6) {
      if (next === 111 || next === 79) return this.readRadixNumber(8) // '0o', '0O' - octal number
      if (next === 98 || next === 66) return this.readRadixNumber(2) // '0b', '0B' - binary number
    }

  // Anything else beginning with a digit is an integer, octal
  // number, or float.
  case 49: case 50: case 51: case 52: case 53: case 54: case 55: case 56: case 57: // 1-9
    return this.readNumber(false)

  // Quotes produce strings.
  case 34: case 39: // '"', "'"
    return this.readString(code)

  // Operators are parsed inline in tiny state machines. '=' (61) is
  // often referred to. `finishOp` simply skips the amount of
  // characters it is given as second argument, and returns a token
  // of the type given by its first argument.

  case 47: // '/'
    switch (this.input.charCodeAt(this.pos + 1)) {
    case 42: // '*'
      return this.readBlockComment()
    case 47:
      return this.readLineComment(2)
    }
    return this.readToken_slash()

  case 37: case 42: // '%*'
    return this.readToken_mult_modulo_exp(code)

  case 124: case 38: // '|&'
    return this.readToken_pipe_amp(code)

  case 94: // '^'
    return this.readToken_caret()

  case 43: case 45: // '+-'
    return this.readToken_plus_min(code)

  case 60: case 62: // '<>'
    return this.readToken_lt_gt(code)

  case 61: case 33: // '=!'
    return this.readToken_eq_excl(code)

  case 126: // '~'
    return this.finishOp(tt.prefix, 1)
  }

  ++this.pos;
  return this.finishToken(tt.invalid);
}

pp.finishOp = function(type, size) {
  this.pos += size
  return this.finishToken(type)
}

pp.readRegexp = function() {
  let escaped, inClass, start = this.pos
  for (;;) {
    if (this.pos >= this.input.length) {
      this.pos = this.input.length;
      return this.finishToken(tt.regexp);
    }
    let ch = this.input.charAt(this.pos)
    if (lineBreak.test(ch))
      return this.finishToken(tt.regexp);
    if (!escaped) {
      if (ch === "[") inClass = true
      else if (ch === "]" && inClass) inClass = false
      else if (ch === "/" && !inClass) break
      escaped = ch === "\\"
    } else escaped = false
    ++this.pos
  }
  ++this.pos
  // Need to use `readWord1` because '\uXXXX' sequences are allowed
  // here (don't ask).
  this.readWord1()
  return this.finishToken(tt.regexp)
}

// Read an integer in the given radix. Return null if zero digits
// were read, the integer value otherwise. When `len` is given, this
// will return `null` unless the integer has exactly `len` digits.

pp.readInt = function(radix, len) {
  let start = this.pos, total = 0
  for (let i = 0, e = len == null ? Infinity : len; i < e; ++i) {
    let code = this.input.charCodeAt(this.pos), val
    if (code >= 97) val = code - 97 + 10 // a
    else if (code >= 65) val = code - 65 + 10 // A
    else if (code >= 48 && code <= 57) val = code - 48 // 0-9
    else val = Infinity
    if (val >= radix) break
    ++this.pos
    total = total * radix + val
  }
  if (this.pos === start || len != null && this.pos - start !== len) return null

  return total
}

pp.readRadixNumber = function(radix) {
  this.pos += 2 // 0x
  let val = this.readInt(radix)
  if (val == null)
    return this.finishToken(tt.invalid);
  if (isIdentifierStart(this.fullCharCodeAtPos()))
    return this.finishToken(tt.invalid);
  return this.finishToken(tt.num, val)
}

// Read an integer, octal integer, or floating-point number.

pp.readNumber = function(startsWithDot) {
  let start = this.pos
  if (!startsWithDot && this.readInt(10) === null)
    return this.finishToken(tt.invalid);
  let octal = this.pos - start >= 2 && this.input.charCodeAt(start) === 48
  if (octal && this.strict)
    return this.finishToken(tt.invalid);
  if (octal && /[89]/.test(this.input.slice(start, this.pos))) octal = false
  let next = this.input.charCodeAt(this.pos)
  if (next === 46 && !octal) { // '.'
    ++this.pos
    this.readInt(10)
    next = this.input.charCodeAt(this.pos)
  }
  if ((next === 69 || next === 101) && !octal) { // 'eE'
    next = this.input.charCodeAt(++this.pos)
    if (next === 43 || next === 45) ++this.pos // '+-'
    if (this.readInt(10) === null)
      return this.finishToken(tt.invalid);
  }
  if (isIdentifierStart(this.fullCharCodeAtPos()))
    return this.finishToken(tt.invalid);

  return this.finishToken(tt.num)
}

// Read a string value, interpreting backslash-escapes.

pp.readCodePoint = function() {
  let ch = this.input.charCodeAt(this.pos), code

  if (ch === 123) { // '{'
    let codePos = ++this.pos
    code = this.readHexChar(this.input.indexOf("}", this.pos) - this.pos)
    if (code !== null)
      ++this.pos
  } else {
    code = this.readHexChar(4)
  }
  return code
}

function codePointToString(code) {
  // UTF-16 Decoding
  if (code <= 0xFFFF) return String.fromCharCode(code)
  code -= 0x10000
  return String.fromCharCode((code >> 10) + 0xD800, (code & 1023) + 0xDC00)
}

pp.readString = function(quote) {
  ++this.pos
  for (;;) {
    if (this.pos >= this.input.length) {
      this.pos = this.input.length;
      return this.finishToken(tt.string);
    }
    let ch = this.input.charCodeAt(this.pos)
    if (ch === quote) break
    if (ch === 92) { // '\'
      this.readEscapedChar()
    } else {
      if (isNewLine(ch))
        return this.finishToken(tt.string);
      ++this.pos
    }
  }
  ++this.pos;
  return this.finishToken(tt.string)
}

// Reads template string tokens.

const INVALID_TEMPLATE_ESCAPE_ERROR = {}

pp.tryReadTemplateToken = function() {
  this.inTemplateElement = true
  try {
    this.readTmplToken()
  } catch (err) {
    if (err === INVALID_TEMPLATE_ESCAPE_ERROR) {
      this.readInvalidTemplateToken()
    } else {
      throw err
    }
  }

  this.inTemplateElement = false
}

pp.readTmplToken = function() {
  for (;;) {
    if (this.pos >= this.input.length) {
      this.pos = this.input.length;
      return this.finishToken(tt.template);
    }

    let ch = this.input.charCodeAt(this.pos)
    if (ch === 96 || ch === 36 && this.input.charCodeAt(this.pos + 1) === 123) { // '`', '${'
      if (this.pos === this.start && (this.type === tt.template || this.type === tt.invalidTemplate)) {
        if (ch === 36) {
          this.pos += 2
          return this.finishToken(tt.dollarBraceL)
        } else {
          ++this.pos
          return this.finishToken(tt.backQuote)
        }
      }
      return this.finishToken(tt.template)
    }
    if (ch === 92) { // '\'
      this.readEscapedChar()
    } else if (isNewLine(ch)) {
      ++this.pos
      switch (ch) {
      case 13:
        if (this.input.charCodeAt(this.pos) === 10) ++this.pos
      case 10:
        break
      default:
        break
      }
    } else {
      ++this.pos
    }
  }
}

// Reads a template token to search for the end, without validating any escape sequences
pp.readInvalidTemplateToken = function() {
  for (; this.pos < this.input.length; this.pos++) {
    switch (this.input[this.pos]) {
    case "\\":
      ++this.pos
      break

    case "$":
      if (this.input[this.pos + 1] !== "{") {
        break
      }
    // falls through

    case "`":
      return this.finishToken(tt.invalidTemplate)

    // no default
    }
  }
  return this.finishToken(tt.invalid);
}

// Used to read escaped characters

pp.readEscapedChar = function() {
  let ch = this.input.charCodeAt(++this.pos)
  ++this.pos
  switch (ch) {
  case 110: return "\n" // 'n' -> '\n'
  case 114: return "\r" // 'r' -> '\r'
  case 120: {
    this.readHexChar(2) // 'x'
    return;
  }
  case 117: {
    this.readCodePoint(); // 'u'
    return;
  }
  case 116: return "\t" // 't' -> '\t'
  case 98: return "\b" // 'b' -> '\b'
  case 118: return "\u000b" // 'v' -> '\u000b'
  case 102: return "\f" // 'f' -> '\f'
  case 13: if (this.input.charCodeAt(this.pos) === 10) ++this.pos // '\r\n'
  case 10: // ' \n'
    return;
  default:
    if (ch >= 48 && ch <= 55) {
      let octalStr = this.input.substr(this.pos - 1, 3).match(/^[0-7]+/)[0]
      this.pos += octalStr.length - 1
    }
  }
}

// Used to read character escape sequences ('\x', '\u', '\U').

pp.readHexChar = function(len) {
  return this.readInt(16, len);
}

// Read an identifier, and return it as a string. Sets `this.containsEsc`
// to whether the word contained a '\u' escape.
//
// Incrementally adds only escaped chars, adding other chunks as-is
// as a micro-optimization.

pp.readWord1 = function() {
  this.containsEsc = false
  let word = "", first = true, chunkStart = this.pos
  let astral = this.options.ecmaVersion >= 6
  while (this.pos < this.input.length) {
    let ch = this.fullCharCodeAtPos()
    if (isIdentifierChar(ch, astral)) {
      this.pos += ch <= 0xffff ? 1 : 2
    } else if (ch === 92) { // "\"
      this.containsEsc = true
      word += this.input.slice(chunkStart, this.pos)
      let escStart = this.pos
      if (this.input.charCodeAt(++this.pos) != 117) // "u"
        return "";
      ++this.pos
      let esc = this.readCodePoint()
      if (esc === null)
        return "";
      if (!(first ? isIdentifierStart : isIdentifierChar)(esc, astral))
        return "";
      word += codePointToString(esc)
      chunkStart = this.pos
    } else {
      break
    }
    first = false
  }
  return word + this.input.slice(chunkStart, this.pos)
}

// Read an identifier or keyword token. Will check for reserved
// words when necessary.

pp.readWord = function() {
  let word = this.readWord1()
  let type = tt.name
  if (this.keywords.test(word)) {
    if (this.containsEsc)
      return this.finishToken(tt.invalid);
    type = keywordTypes[word]
  }
  return this.finishToken(type, word)
}
