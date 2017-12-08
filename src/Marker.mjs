import { Random } from "./Types.mjs";

let random = Random(17);
let randomChar = (from, to) => String.fromCharCode(from + random() % (to - from + 1));
let B = 'B'.charCodeAt(0);
let Z = 'Z'.charCodeAt(0);

export class Marker {
  /**
   * Id never ends with A, which guarantees it's possible
   * to generate a new one in between any two.
   * @param {string|undefined} previous
   * @param {string|undefined} next
   */
  static generateId(previous, next) {
    previous = previous || '';
    next = next || '';

    if (previous === next) {
      if (previous)
        throw 'Ids must be different';
      return randomChar(B, Z);
    }

    if (next.startsWith(previous)) {
      let i = previous.length;
      while (next[i] === 'A')
        i++;
      if (next[i] === 'B')
        return next.substring(0, i) + 'A' + randomChar(B, Z);
      return next.substring(0, i) + randomChar(B, next.charCodeAt(i) - 1);
    }

    let i = 0;
    while (previous[i] === next[i])
      i++;
    let prevChar = previous.charCodeAt(i);
    let nextChar = next.charCodeAt(i);
    if (nextChar === prevChar + 1)
      return previous.substring(0, i + 1) + randomChar(B, Z);
    return previous.substring(0, i) + randomChar(prevChar + 1, nextChar - 1);
  }

  /**
   * @param {number} linesTaken
   * @param {?Element} element
   */
  static createLineWidget(linesTaken, element) {
    let marker = new Marker();
    marker.size = linesTaken;
    marker.id = '';
    marker.element = element;
    marker.lineWidget = true;
    return marker;
  }
}
