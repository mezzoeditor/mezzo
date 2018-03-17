import { Metrics } from '../core/Metrics.mjs';

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
    return Metrics.whitespaceRegex.test(char);
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
