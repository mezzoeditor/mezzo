import { Unicode } from '../core/Unicode.mjs';

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
    return Unicode.whitespaceRegex.test(char);
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
