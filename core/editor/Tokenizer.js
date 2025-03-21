import { TextUtils } from '../text/TextUtils.js';

/**
 * @interface
 */
export class Tokenizer {
  /**
   * @param {string} char
   * @return {boolean}
   * Return weather the char belongs to the word
   */
  isWordChar(char) {
    return false;
  }

  /**
   * @param {string} char
   * @return {boolean}
   * Return weather the char belongs to the word
   */
  isSpaceChar(char) {
    return false;
  }

  /**
   * @param {string} char
   * @return {boolean}
   * Return weather the char belongs to the word
   */
  isPunctuationChar(char) {
    return false;
  }
};

export class DefaultTokenizer {
  /**
   * @param {string} char
   * @return {boolean}
   * Return weather the char belongs to the word
   */
  isWordChar(char) {
    return !this.isSpaceChar(char) && !this.isPunctuationChar(char);
  }

  /**
   * @param {string} char
   * @return {boolean}
   * Return weather the char belongs to the word
   */
  isSpaceChar(char) {
    return TextUtils.whitespaceRegex.test(char);
  }

  /**
   * @param {string} char
   * @return {boolean}
   * Return weather the char belongs to the word
   */
  isPunctuationChar(char) {
    return `\`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?`.indexOf(char) !== -1;
  }
}

/**
 * @param {!Mezzo.Document} document
 * @param {!Tokenizer} tokenizer
 * @param {number} offset
 * @return {number}
 */
Tokenizer.leftBoundary = function(document, tokenizer, offset) {
  // TODO: this is not aware of code points.
  let it = document.text().iterator(offset);
  if (it.current === '\n')
    return offset;
  while (it.offset && tokenizer.isSpaceChar(it.current) && it.current !== '\n')
    it.prev();
  if (!it.offset)
    return 0;
  if (it.current === '\n')
    return it.offset + 1;
  if (tokenizer.isPunctuationChar(it.current)) {
    while (!it.outOfBounds() && tokenizer.isPunctuationChar(it.current))
      it.prev();
  } else {
    while (!it.outOfBounds() && tokenizer.isWordChar(it.current))
      it.prev();
  }
  return it.offset + 1;
};

/**
 * @param {!Mezzo.Document} document
 * @param {!Tokenizer} tokenizer
 * @param {number} offset
 * @return {number}
 */
Tokenizer.rightBoundary = function(document, tokenizer, offset) {
  // TODO: this is not aware of code points.
  let it = document.text().iterator(offset);
  if (it.current === '\n')
    return offset + 1;
  while (!it.outOfBounds() && it.current !== '\n' && tokenizer.isSpaceChar(it.current))
    it.next();
  if (it.outOfBounds())
    return it.offset;
  if (it.current === '\n')
    return it.offset + 1;
  if (tokenizer.isPunctuationChar(it.current)) {
    while (!it.outOfBounds() && tokenizer.isPunctuationChar(it.current))
      it.next();
  } else {
    while (!it.outOfBounds() && tokenizer.isWordChar(it.current))
      it.next();
  }
  return it.offset;
};

/**
 * @param {!Mezzo.Document} document
 * @param {!Tokenizer} tokenizer
 * @param {number} offset
 * @return {!Mezzo.Range}
 */
Tokenizer.characterGroupRange = function(document, tokenizer, offset) {
  let from = document.text().iterator(offset);
  if (from.current === '\n')
    from.prev();
  let to = from.clone();
  let groupFn = null;
  if (tokenizer.isPunctuationChar(from.current))
    groupFn = tokenizer.isPunctuationChar;
  else if (tokenizer.isWordChar(from.current))
    groupFn = tokenizer.isWordChar;
  else
    groupFn = tokenizer.isSpaceChar;

  while (from.current !== '\n' && !from.outOfBounds() && groupFn.call(tokenizer, from.current))
    from.prev();
  while (to.current !== '\n' && !to.outOfBounds() && groupFn.call(tokenizer, to.current))
    to.next();
  return {from: from.offset + 1, to: to.offset};
}

/**
 * @param {!Mezzo.Document} document
 * @param {!Tokenizer} tokenizer
 * @param {!Mezzo.Range} range
 * @return {boolean}
 */
Tokenizer.isWord = function(document, tokenizer, range) {
  if (range.from >= range.to)
    return false;
  if (Tokenizer.leftBoundary(document, tokenizer, range.from) !== range.from)
    return false;
  if (Tokenizer.rightBoundary(document, tokenizer, range.to - 1) !== range.to)
    return false;
  let it = document.text().iterator(range.from, range.from, range.to);
  for (it; !it.outOfBounds(); it.next()) {
    if (!tokenizer.isWordChar(it.current))
      return false;
  }
  return true;
}
