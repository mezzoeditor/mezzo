/**
 * This is an iterator over text. See Text for more info.
 * It operates on immutable Text, and therefore is never invalidated.
 * Most of the semantics of this iterator are equivalent
 * to the semantics of a string |text.substring(from, to)|.
 */
export class TextIterator {
  /**
   * @param {OrderedMonoidTreeIterator<TextMetrics, TextLookupKey>} iterator
   * @param {number} offset
   * @param {number} from
   * @param {number} to
   * @param {number} length
   */
  constructor(iterator, offset, from, to, length) {
    this._iterator = iterator;
    this._from = from;
    this._to = to;
    this._length = length;
    this._chunk = this._iterator.data || '';
    this._pos = offset - (this._iterator.before ? this._iterator.before.length : 0);

    /**
     * Current iterator position in the text.
     * The following is always true: from - 1 <= offset <= to.
     */
    this.offset = offset;

    /**
     * Current iterator character.
     * This will be |undefined| when either of bounds.
     */
    this.current = this.outOfBounds() ? undefined : this._chunk[this._pos];
  }

  /**
   * Returns a substring starting at current position. Does not advance.
   * @param {number} length
   * @return {string}
   */
  substr(length) {
    length = Math.min(length, this._to - this.offset);
    if (length <= 0)
      return '';

    if (this._pos + length <= this._chunk.length)
      return this._chunk.substr(this._pos, length);

    let result = '';
    const iterator = length <= this._chunk.length * 2 ? this._iterator : this._iterator.clone();
    let pos = this._pos;
    let moves = -1;
    do {
      ++moves;
      const chunk = iterator.data || '';
      const word = chunk.substr(pos, length);
      pos = 0;
      result += word;
      length -= word.length;
    } while (length && iterator.next());
    while (iterator === this._iterator && moves--)
      iterator.prev();
    return result;
  }

  /**
   * Returns a substring ending at current position. Does not advance.
   * @param {number} length
   * @return {string}
   */
  rsubstr(length) {
    length = Math.min(length, this.offset - this._from);
    if (length <= 0)
      return '';

    if (this._pos >= length)
      return this._chunk.substr(this._pos - length, length);

    let result = '';
    let pos = this._pos;
    const iterator = length <= this._chunk.length * 2 ? this._iterator : this._iterator.clone();
    let moves = -1;
    do {
      moves++;
      const chunk = iterator.data || '';
      const word = pos === -1 ? chunk.substr(-length) : chunk.substr(0, pos).substr(-length);
      pos = -1;
      result = word + result;
      length -= word.length;
    } while (length && iterator.prev());
    while (iterator === this._iterator && moves--)
      iterator.next();
    return result;
  }

  /**
   * Returns a substring starting at current position. Advances to the end of this substring.
   * @param {number} length
   * @return {string}
   */
  read(length) {
    length = Math.min(length, this._to - this.offset);
    if (length <= 0)
      return '';

    let result = this._chunk.substr(this._pos, length);
    this.offset += length;
    this._pos += length;
    while (this._pos >= this._chunk.length && this._iterator.next()) {
      this._pos -= this._chunk.length;
      this._chunk = this._iterator.data;
      result += this._chunk.substr(0, length - result.length);
    }
    this.current = this.outOfBounds() ? undefined : this._chunk[this._pos];
    return result;
  }

  /**
   * Returns a substring ending at current position. Advances to the start of this substring.
   * @param {number} length
   * @return {string}
   */
  rread(length) {
    length = Math.min(length, this.offset - this._from);
    if (length <= 0)
      return '';

    let result = this._chunk.substring(Math.max(0, this._pos - length), this._pos);
    this.offset -= length;
    this._pos -= length;
    while (this._pos < 0 && this._iterator.prev()) {
      this._chunk = this._iterator.data;
      this._pos += this._chunk.length;
      result = this._chunk.substr(result.length - length) + result;
    }
    this.current = this.outOfBounds() ? undefined : this._chunk[this._pos];
    return result;
  }

  /**
   * Searches for a |query| starting at current position. Advances
   * to the start of the first occurance of |query|. If the |query|
   * cannot be found, advances to the end and returns false.
   * @param {string} query
   * @param {{caseInsensetive: boolean}} options
   * @return {boolean}
   */
  find(query, options = {}) {
    if (this.outOfBounds())
      return false;

    const caseInsensetive = !!options.caseInsensetive;

    if (caseInsensetive)
      query = query.toLowerCase();

    // fast-path: search in current chunk.
    let index = caseInsensetive ? this._chunk.toLowerCase().indexOf(query, this._pos) :  this._chunk.indexOf(query, this._pos);
    if (index !== -1) {
      index -= this._pos;
      if (this.offset + index + query.length > this._to)
        this.advance(this._to - this.offset);
      else
        this.advance(index);
      return !this.outOfBounds();
    }

    let searchWindow = this._chunk.substring(this._pos);
    if (caseInsensetive)
      searchWindow = searchWindow.toLowerCase();
    const endIterator = this._iterator.clone();

    while (true) {
      let skip = this._chunk.length - this._pos;

      while (searchWindow.length - skip < query.length - 1) {
        if (!endIterator.next())
          break;
        if (caseInsensetive)
          searchWindow += endIterator.data.toLowerCase();
        else
          searchWindow += endIterator.data;
      }

      const index = searchWindow.indexOf(query);
      if (index !== -1) {
        if (this.offset + index + query.length > this._to)
          this.advance(this._to - this.offset);
        else
          this.advance(index);
        return !this.outOfBounds();
      }

      searchWindow = searchWindow.substring(skip);
      this.offset += skip;
      // Check that we don't go past the iterator boundary.
      if (this.offset >= this._to || !this._iterator.next()) {
        this.current = undefined;
        this.offset = this._to;
        this._pos = this._to - (this._iterator.before ? this._iterator.before.length : 0);
        return false;
      }
      this._chunk = this._iterator.data;
      this._pos = 0;
      this.current = this._chunk[this._pos];
    }
  }

  /**
   * Returns an identical copy.
   * @return {TextIterator}
   */
  clone() {
    let it = this._iterator.clone();
    return new TextIterator(it, this.offset, this._from, this._to, this._length);
  }

  /**
   * Shortcut to advance by one forward.
   */
  next() {
    return this.advance(1);
  }

  /**
   * Shortcut to advance by one backward.
   */
  prev() {
    return this.advance(-1);
  }

  /**
   * Moves current position by |x|, forward or backward depending
   * on it's sign. When advancing by |x| goes out of bounds, advances
   * to the respective bound instead and returns the actual offset
   * advanced by.
   * @param {number} x
   * @return {number}
   */
  advance(x) {
    if (x === 0)
      return 0;
    if (this.offset + x > this._to)
      x = this._to - this.offset;
    else if (this.offset + x < this._from)
      x = this._from - this.offset - 1;

    this.offset += x;
    this._pos += x;
    if (x > 0) {
      while (this._pos >= this._chunk.length && this._iterator.next()) {
        this._pos -= this._chunk.length;
        this._chunk = this._iterator.data;
      }
    } else {
      while (this._pos < 0 && this._iterator.prev()) {
        this._chunk = this._iterator.data;
        this._pos += this._chunk.length;
      }
    }
    this.current = this.outOfBounds() ? undefined : this._chunk[this._pos];
    return x;
  }

  /**
   * Sets current position to |offset|.
   * @param {number} offset
   */
  reset(offset) {
    this.advance(offset - this.offset);
  }

  /**
   * Returns char code at position |current + offset|.
   * @param {number} offset
   * @return {number}
   */
  charCodeAt(offset) {
    if (this._pos + offset >= 0 && this._pos + offset < this._chunk.length &&
        this.offset + offset >= this._from && this.offset + offset < this._to) {
      return this._chunk.charCodeAt(this._pos + offset);
    }
    let char = this.charAt(offset);
    return char ? char.charCodeAt(0) : NaN;
  }

  /**
   * Returns char at position |current + offset|.
   * @param {number} offset
   * @return {number}
   */
  charAt(offset) {
    if (!offset)
      return this.current;

    if (offset >= -this._chunk.length * 2 && offset <= this._chunk.length * 2) {
      offset = this.advance(offset);
      const result = this.current;
      this.advance(-offset);
      return result;
    }

    const it = this.clone();
    it.advance(offset);
    return it.current;
  }

  /**
   * The total length of iterable text.
   * @return {number}
   */
  length() {
    return this._to - this._from;
  }

  /**
   * Returns whether the iterator has reached it's start or end.
   * Note that iterator can still be used by advancing in the opposite
   * direction.
   * @return {boolean}
   */
  outOfBounds() {
    return this.offset < this._from || this.offset >= this._to;
  }
};
