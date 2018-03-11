/**
 * @interface
 */
export class Tokenizer {
  /**
   * @param {!Text.Iterator} it
   * @return {boolean}
   * Return weather the char belongs to the word
   */
  isWordChar(it) {
  }

  /**
   * @param {!Text.Iterator} it
   * @return {boolean}
   * Return weather the char belongs to the word
   */
  isSpaceChar(it) {
  }

  /**
   * @param {!Text.Iterator} it
   * @return {boolean}
   * Return weather the char belongs to the word
   */
  isPunctuationChar(it) {
  }
};

/**
 * @param {!Document} document
 * @param {number} offset
 * @return {number}
 */
Tokenizer.leftBoundary = function(document, offset) {
  // TODO: this is not aware of code points.
  let tokenizer = document.tokenizer();
  if (!tokenizer)
    return offset;
  let it = document.iterator(offset);
  if (it.current === '\n')
    return offset;
  while (it.offset && tokenizer.isSpaceChar(it) && it.current !== '\n')
    it.prev();
  if (!it.offset)
    return 0;
  if (it.current === '\n')
    return it.offset + 1;
  if (tokenizer.isPunctuationChar(it)) {
    while (it.offset && tokenizer.isPunctuationChar(it))
      it.prev();
  } else {
    while (it.offset && tokenizer.isWordChar(it))
      it.prev();
  }
  return it.offset + 1;
};

/**
 * @param {!Document} document
 * @param {number} offset
 * @return {number}
 */
Tokenizer.rightBoundary = function(document, offset) {
  // TODO: this is not aware of code points.
  let tokenizer = document.tokenizer();
  if (!tokenizer)
    return offset;
  let it = document.iterator(offset);
  if (it.current === '\n')
    return offset + 1;
  while (!it.outOfBounds() && it.curreent !== '\n' && tokenizer.isSpaceChar(it))
    it.next();
  if (it.outOfBounds())
    return it.offset;
  if (it.current === '\n')
    return it.offset + 1;
  if (tokenizer.isPunctuationChar(it)) {
    while (!it.outOfBounds() && tokenizer.isPunctuationChar(it))
      it.next();
  } else {
    while (!it.outOfBounds() && tokenizer.isWordChar(it))
      it.next();
  }
  return it.offset;
};

/**
 * @param {!Document} document
 * @param {number} offset
 * @return {!Range}
 */
Tokenizer.characterGroupRange = function(document, offset) {
  let tokenizer = document.tokenizer();
  if (!tokenizer)
    return offset;
  let from = document.iterator(offset);
  if (from.current === '\n')
    from.prev();
  let to = from.clone();
  let groupFn = null;
  if (tokenizer.isPunctuationChar(from))
    groupFn = tokenizer.isPunctuationChar;
  else if (tokenizer.isWordChar(from))
    groupFn = tokenizer.isWordChar;
  else
    groupFn = tokenizer.isSpaceChar;

  while (from.current !== '\n' && !from.outOfBounds() && groupFn.call(tokenizer, from))
    from.prev();
  while (to.current !== '\n' && !to.outOfBounds() && groupFn.call(tokenizer, to))
    to.next();
  return {from: from.offset + 1, to: to.offset};
}