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

export class DefaultTokenizer {
  /**
   * @param {!Text.Iterator} it
   * @return {boolean}
   * Return weather the char belongs to the word
   */
  isWordChar(it) {
    return !this.isSpaceChar(it) && !this.isPunctuationChar(it);
  }

  /**
   * @param {!Text.Iterator} it
   * @return {boolean}
   * Return weather the char belongs to the word
   */
  isSpaceChar(it) {
    return /\s/.test(it.current);
  }

  /**
   * @param {!Text.Iterator} it
   * @return {boolean}
   * Return weather the char belongs to the word
   */
  isPunctuationChar(it) {
    let char = it.current;
    return (char > ' ' && char < '0') || (char > '9' && char < 'A') || (char > 'Z' && char < '_') ||
        (char > '_' && char < 'a') || (char > 'z' && char <= '~');
  }
}
