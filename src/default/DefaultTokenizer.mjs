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
    return `\`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?`.indexOf(it.current) !== -1;
  }
}
