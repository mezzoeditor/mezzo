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
Tokenizer.leftWordBoundary = function(document, offset) {
  // TODO: this is not aware of code points.
  let tokenizer = document.tokenizer();
  if (!tokenizer)
    return offset;
  let it = document.iterator(offset);
  while (it.offset && tokenizer.isSpaceChar(it))
    it.prev();
  if (!it.offset)
    return 0;
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
Tokenizer.rightWordBoundary = function(document, offset) {
  // TODO: this is not aware of code points.
  let it = document.iterator(offset);
  let tokenizer = document.tokenizer();
  if (!tokenizer)
    return offset;
  while (!it.outOfBounds() && tokenizer.isSpaceChar(it))
    it.next();
  if (it.outOfBounds())
    return it.offset;
  if (tokenizer.isPunctuationChar(it)) {
    while (!it.outOfBounds() && tokenizer.isPunctuationChar(it))
      it.next();
  } else {
    while (!it.outOfBounds() && tokenizer.isWordChar(it))
      it.next();
  }
  return it.offset;
};
