import { Decorator } from "../core/Decorator.mjs";
import { TextUtils } from "../utils/TextUtils.mjs";
import { Segments } from "../core/Segments.mjs";

/**
 * @typedef {{
 *   anchor: number,
 *   focus: number,
 *   id: number,
 *   upDownColumn: number
 * }} SelectionRange;
 */

/**
 * @implements {Plugin}
 */
export class Selection {
  /**
   * @param {!Document} document
   */
  constructor(document) {
    this._document = document;
    this._decorator = new Decorator();
    this._ranges = [];
    this._muted = 0;
    this._lastId = 0;
  }

  // -------- Public API --------

  /**
   * @return {!Array<!OffsetRange>}
   */
  ranges() {
    return this._ranges.map(range => ({from: range.from, to: range.to}));
  }

  /**
   * @return {?number}
   */
  focus() {
    let max = null;
    for (let range of this._ranges) {
      if (max === null || max.id < range.id)
        max = range;
    }
    return max ? max.focus : null;
  }

  /**
   * @param {!Array<!OffsetRange>} ranges
   */
  setRanges(ranges) {
    this._document.begin('selection');
    this._ranges = this._rebuild(ranges.map(range => ({
      id: ++this._lastId,
      upDownColumn: -1,
      anchor: range.from,
      focus: range.to
    })));
    this._document.end('selection');
  }

  /**
   * @param {!Array<!OffsetRange>} ranges
   */
  updateRanges(ranges) {
    if (ranges.length !== this._ranges.length)
      throw 'Wrong number of ranges to update';
    this._document.begin('selection');
    let newRanges = [];
    for (let i = 0; i < ranges.length; i++)
      newRanges.push({id: this._ranges[i].id, upDownColumn: -1, anchor: ranges[i].from, focus: ranges[i].to});
    this._ranges = this._rebuild(newRanges);
    this._document.end('selection');
  }

  mute() {
    this._muted++;
  }

  unmute() {
    this._muted--;
  }

  // -------- Plugin --------

  /**
   * @override
   * @param {!Document} document
   */
  onAdded(document) {
    document.addDecorator(this._decorator);
  }

  /**
   * @override
   * @param {!Document} document
   */
  onRemoved(document) {
    document.removeDecorator(this._decorator);
  }

  /**
   * @override
   * @param {!Viewport} viewport
   */
  onViewport(viewport) {
    this._decorator.clear();
    for (let range of this._ranges) {
      this._decorator.add(range.focus, range.focus, 'selection.focus');
      if (range.focus !== range.anchor)
        this._decorator.add(Math.min(range.focus, range.anchor), Math.max(range.focus, range.anchor), 'selection.range');
    }
  }

  /**
   * @override
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   */
  onReplace(from, to, inserted) {
    if (this._muted)
      return;

    let ranges = [];
    for (let range of this._ranges) {
      let start = Math.min(range.anchor, range.focus);
      let end = Math.max(range.anchor, range.focus);
      if (from < start && to > start)
        continue;

      if (from <= start)
        start = to >= start ? from : start - (to - from);
      if (from <= end)
        end = to >= end ? from : end - (to - from);

      if (from <= start)
        start += inserted;
      if (from <= end)
        end += inserted;

      if (range.anchor > range.focus)
        ranges.push({id: range.id, upDownColumn: -1, anchor: end, focus: start});
      else
        ranges.push({id: range.id, upDownColumn: -1, anchor: start, focus: end});
    }
    this._ranges = this._rebuild(ranges);
  }

  /**
   * @override
   * @return {*}
   */
  onSave() {
    return this._ranges;
  }

  /**
   * @override
   * @param {!Array<{from: number, to: number, inserted: number}>} replacements
   * @param {*|undefined} data
   */
  onRestore(replacements, data) {
    this._ranges = data || [];
  }

  /**
   * @override
   * @param {string} command
   * @param {*} data
   * @return {*}
   */
  onCommand(command, data) {
    if (!Selection.Commands.has(command))
      return;

    if (this._muted)
      throw 'Cannot perform selection command while muted';

    if (command === 'selection.collapse')
      return this._collapse();

    if (command ===  'selection.copy') {
      let lines = [];
      for (let range of this._ranges.all())
        lines.push(this._document.content(Math.min(range.anchor, range.focus), Math.max(range.anchor, range.focus)));
      return lines.join('\n');
    }

    this._document.begin('selection');
    switch (command) {
      case 'selection.select.all': {
        this._ranges = [{anchor: 0, focus: this._document.length(), upDownColumn: -1, id: ++this._lastId}];
        break;
      }
      case 'selection.move.left': {
        let ranges = [];
        for (let range of this._ranges) {
          let offset = Math.min(range.anchor, range.focus);
          if (range.anchor === range.focus)
            offset = TextUtils.previousOffset(this._document, range.focus);
          ranges.push({id: range.id, upDownColumn: -1, anchor: offset, focus: offset});
        }
        this._ranges = this._join(ranges);
        break;
      }
      case 'selection.select.left': {
        let ranges = [];
        for (let range of this._ranges)
          ranges.push({id: range.id, upDownColumn: -1, anchor: range.anchor, focus: TextUtils.previousOffset(this._document, range.focus)});
        this._ranges = this._join(ranges);
        break;
      }
      case 'selection.move.right': {
        let ranges = [];
        for (let range of this._ranges) {
          let offset = Math.max(range.anchor, range.focus);
          if (range.anchor === range.focus)
            offset = TextUtils.nextOffset(this._document, range.focus);
          ranges.push({id: range.id, upDownColumn: -1, anchor: offset, focus: offset});
        }
        this._ranges = this._join(ranges);
        break;
      }
      case 'selection.select.right': {
        this._upDownCleared = true;
        let ranges = [];
        for (let range of this._ranges)
          ranges.push({id: range.id, upDownColumn: -1, anchor: range.anchor, focus: TextUtils.nextOffset(this._document, range.focus)});
        this._ranges = this._join(ranges);
        break;
      }
      case 'selection.move.up': {
        let ranges = [];
        for (let range of this._ranges) {
          let offset = Math.min(range.anchor, range.focus);
          let upDownColumn = range.upDownColumn;
          if (range.anchor === range.focus) {
            let {line, column} = this._document.offsetToPosition(range.focus);
            upDownColumn = range.upDownColumn === -1 ? column : range.upDownColumn;
            if (line)
              line--;
            offset = this._document.positionToOffset({line, column: upDownColumn}, true /* clamp */);
          }
          ranges.push({id: range.id, upDownColumn, anchor: offset, focus: offset});
        }
        this._ranges = this._join(ranges);
        break;
      }
      case 'selection.select.up': {
        let ranges = [];
        for (let range of this._ranges) {
          let {line, column} = this._document.offsetToPosition(range.focus);
          let upDownColumn = range.upDownColumn === -1 ? column : range.upDownColumn;
          if (line)
            line--;
          let focus = this._document.positionToOffset({line, column: upDownColumn}, true /* clamp */);
          ranges.push({id: range.id, upDownColumn, anchor: range.anchor, focus});
        }
        this._ranges = this._join(ranges);
        break;
      }
      case 'selection.move.down': {
        let ranges = [];
        for (let range of this._ranges) {
          let offset = Math.max(range.anchor, range.focus);
          let upDownColumn = range.upDownColumn;
          if (range.anchor === range.focus) {
            let {line, column} = this._document.offsetToPosition(range.focus);
            upDownColumn = range.upDownColumn === -1 ? column : range.upDownColumn;
            if (line < this._document.lineCount() - 1)
              line++;
            offset = this._document.positionToOffset({line, column: upDownColumn}, true /* clamp */);
          }
          ranges.push({id: range.id, upDownColumn, anchor: offset, focus: offset});
        }
        this._ranges = this._join(ranges);
        break;
      }
      case 'selection.select.down': {
        let ranges = [];
        for (let range of this._ranges) {
          let {line, column} = this._document.offsetToPosition(range.focus);
          let upDownColumn = range.upDownColumn === -1 ? column : range.upDownColumn;
          if (line < this._document.lineCount() - 1)
            line++;
          let focus = this._document.positionToOffset({line, column: upDownColumn}, true /* clamp */);
          ranges.push({id: range.id, upDownColumn, anchor: range.anchor, focus});
        }
        this._ranges = this._join(ranges);
        break;
      }
      case 'selection.move.linestart': {
        let ranges = [];
        for (let range of this._ranges) {
          let offset = TextUtils.lineStartOffset(this._document, range.focus);
          ranges.push({id: range.id, upDownColumn: -1, anchor: offset, focus: offset});
        }
        this._ranges = this._join(ranges);
        break;
      }
      case 'selection.select.linestart': {
        let ranges = [];
        for (let range of this._ranges) {
          let focus = TextUtils.lineStartOffset(this._document, range.focus);
          ranges.push({id: range.id, upDownColumn: -1, anchor: range.anchor, focus});
        }
        this._ranges = this._join(ranges);
        break;
      }
      case 'selection.move.lineend': {
        let ranges = [];
        for (let range of this._ranges) {
          let offset = TextUtils.lineEndOffset(this._document, range.focus);
          ranges.push({id: range.id, upDownColumn: -1, anchor: offset, focus: offset});
        }
        this._ranges = this._join(ranges);
        break;
      }
      case 'selection.select.lineend': {
        let ranges = [];
        for (let range of this._ranges) {
          let focus = TextUtils.lineEndOffset(this._document, range.focus);
          ranges.push({id: range.id, upDownColumn: -1, anchor: range.anchor, focus});
        }
        this._ranges = this._join(ranges);
        break;
      }
    }
    this._document.end('selection');
    return true;
  }

  // -------- Internal --------

  /**
   * @return {boolean|undefined}
   */
  _collapse() {
    let collapsed = false;
    let ranges = [];
    for (let range of this._ranges) {
      if (range.anchor !== range.focus)
        collapsed = true;
      ranges.push({id: range.id, upDownColumn: -1, anchor: range.anchor, focus: range.anchor});
    }
    if (!collapsed)
      return false;
    this._document.begin('selection');
    this._ranges = ranges;
    this._document.end('selection');
    return true;
  }

  /**
   * @param {!Array<!SelectionRange>} ranges
   * @return {!Array<!SelectionRange>}
   */
  _join(ranges) {
    if (!ranges.length)
      return ranges;
    let length = 1;
    for (let i = 1; i < ranges.length; i++) {
      let last = ranges[length - 1];
      let lastTo = Math.max(last.anchor, last.focus);
      let next = ranges[i];
      let nextFrom = Math.min(next.anchor, next.focus);
      let nextTo = Math.max(next.anchor, next.focus);
      if (nextFrom <= lastTo && nextTo > lastTo) {
        if (last.anchor > last.focus)
          last.anchor = nextTo;
        else
          last.focus = nextTo;
      } else {
        ranges[length++] = next;
      }
    }
    if (length !== ranges.length)
      ranges.splice(length, ranges.length - length);
    return ranges;
  }

  /**
   * @param {!Array<!SelectionRange>} ranges
   * @return {!Array<!SelectionRange>}
   */
  _rebuild(ranges) {
    let length = this._document.length();
    for (let range of ranges) {
      range.anchor = Math.max(0, Math.min(range.anchor, length));
      range.focus = Math.max(0, Math.min(range.focus, length));
    }
    ranges.sort((a, b) => {
      let aFrom = Math.min(a.focus, a.anchor);
      let aTo = Math.max(a.focus, a.anchor);
      let bFrom = Math.min(b.focus, b.anchor);
      let bTo = Math.max(b.focus, b.anchor);
      return (aFrom - bFrom) || (aTo - bTo);
    });
    return this._join(ranges);
  }
};

Selection.Commands = new Set([
  'selection.copy',
  'selection.collapse',
  'selection.select.all',
  'selection.select.left',
  'selection.select.right',
  'selection.select.up',
  'selection.select.down',
  'selection.select.lineend',
  'selection.select.linestart',
  'selection.move.left',
  'selection.move.right',
  'selection.move.up',
  'selection.move.down',
  'selection.move.lineend',
  'selection.move.linestart',
]);

Selection.Decorations = new Set(['selection.range', 'selection.focus']);
