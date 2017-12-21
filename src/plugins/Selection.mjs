import { OffsetRange } from "../utils/Types.mjs";
import { TextUtils } from "../utils/TextUtils.mjs";
import { Segments } from "../core/Segments.mjs";

/**
 * @typedef {{
 *   data: {reversed: boolean|undefined, upDownColumn: number|undefined},
 *   from: number,
 *   to: number
 * }} Segment;
 */

/**
 * @implements {Plugin}
 */
export class Selection {
  constructor(editor) {
    this._editor = editor;
    this._document = editor.document();
    this._segments = Segments.empty();
    this._upDownCleared = true;
    this._drawCursors = true;
    this._mouseRangeStartOffset = null;
    editor.element().addEventListener('mousedown', this._onMouseDown.bind(this));
    editor.element().addEventListener('mousemove', this._onMouseMove.bind(this));
    editor.element().addEventListener('mouseup', this._onMouseUp.bind(this));
    editor.element().addEventListener('copy', event => {
      let text = this._document.perform('selection.copy');
      if (text) {
        event.clipboardData.setData('text/plain', text);
        event.preventDefault();
        event.stopPropagation();
      }
    });
    this._setupCursors();
  }

  _setupCursors() {
    let cursorsVisible = false;
    let cursorsTimeout;
    let toggleCursors = () => {
      cursorsVisible = !cursorsVisible;
      this._setCursorsVisible(cursorsVisible);
    };
    this._editor.element().addEventListener('focusin', event => {
      toggleCursors();
      cursorsTimeout = document.defaultView.setInterval(toggleCursors, 500);
    });
    this._editor.element().addEventListener('focusout', event => {
      if (cursorsVisible)
        toggleCursors();
      if (cursorsTimeout) {
        document.defaultView.clearInterval(cursorsTimeout);
        cursorsTimeout = null;
      }
    });
    this._revealCursors = () => {
      if (!cursorsTimeout)
        return;
      document.defaultView.clearInterval(cursorsTimeout);
      if (!cursorsVisible)
        toggleCursors();
      cursorsTimeout = document.defaultView.setInterval(toggleCursors, 500);
    };
    this._revealCursors();
  }

  _onMouseDown(event) {
    let offset = this._editor.mouseEventToTextOffset(event);
    this.setRanges([{from: offset, to: offset}]);
    this._mouseRangeStartOffset = offset;
    event.stopPropagation();
    event.preventDefault();
  }

  _onMouseMove(event) {
    if (!this._mouseRangeStartOffset)
      return;
    let offset = this._editor.mouseEventToTextOffset(event);
    this.setRanges([{from: this._mouseRangeStartOffset, to: offset}]);
    this._revealCursors();
  }

  _onMouseUp(event) {
    this._mouseRangeStartOffset = null;
  }

  _setCursorsVisible(visible) {
    if (this._drawCursors === visible)
      return;
    this._drawCursors = visible;
    this._editor.invalidate();
  }

  /**
   * @param {!Array<!Segment>} segments
   */
  _setSegments(segments) {
    this._segments = Segments.empty();
    for (let segment of segments)
      this._segments = this._segments.add(segment.from, segment.to, segment.data);
  }

  /**
   * @param {!Segment} segment
   * @return {number}
   */
  _focus(segment) {
    return segment.data.reversed ? segment.from : segment.to;
  }

  /**
   * @param {!Segment} segment
   * @return {number}
   */
  _anchor(segment) {
    return segment.data.reversed ? segment.to : segment.from;
  }

  /**
   * @param {!Segment} segment
   * @param {number} focus
   */
  _moveFocus(segment, focus) {
    let anchor = this._anchor(segment);
    if (anchor > focus) {
      segment.from = focus;
      segment.to = anchor;
      segment.data.reversed = true;
    } else {
      segment.from = anchor;
      segment.to = focus;
      delete segment.data.reversed;
    }
  }

  // -------- Public API --------

  /**
   * @return {!Array<!OffsetRange>}
   */
  ranges() {
    return this._segments.all();
  }

  /**
   * @param {!Array<!OffsetRange>} ranges
   */
  setRanges(ranges) {
    this._document.begin('selection');
    this._upDownCleared = true;
    let segments = ranges.map(range => {
      if (range.from > range.to)
        return {from: range.to, to: range.from, data: {reversed: true}};
      return {from: range.from, to: range.to, data: {}};
    });
    this._setSegments(this._rebuild(segments));
    this._document.end('selection');
  }

  // -------- Plugin --------

  /**
   * @param {!Viewport} viewport
   */
  onViewport(viewport) {
    for (let segment of this._segments.all()) {
      if (this._drawCursors) {
        let focus = this._focus(segment);
        viewport.addDecoration(focus, focus, 'selection.focus');
      }
      if (segment.from !== segment.to)
        viewport.addDecoration(segment.from, segment.to, 'selection.range');
    }
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   */
  onReplace(from, to, inserted) {
    this._revealCursors();
    this._upDownCleared = true;
    this._segments = this._segments.replace(from, to, inserted);
  }

  /**
   * @return {*}
   */
  onSave() {
    return {segments: this._segments, upDownCleared: this._upDownCleared};
  }

  /**
   * @param {!Array<{from: number, to: number, inserted: number}>} replacements
   * @param {*|undefined} data
   */
  onRestore(replacements, data) {
    if (data) {
      this._segments = data.segments;
      this._upDownCleared = data.upDownCleared;
    } else {
      this._segments = Segments.empty();
      this._upDownCleared = true;
    }
  }

  /**
   * @param {string} command
   * @param {*} data
   * @return {*}
   */
  onCommand(command, data) {
    if (!Selection.Commands.has(command))
      return;

    if (command === 'selection.collapse')
      return this._collapse();

    if (command ===  'selection.copy') {
      let lines = [];
      for (let segment of this._segments.all())
        lines.push(this._document.content(segment.from, segment.to));
      return lines.join('\n');
    }

    this._document.begin('selection');
    switch (command) {
      case 'selection.select.all': {
        this._setSegments([{from: 0, to: this._document.length(), data:{}}]);
        break;
      }
      case 'selection.move.left': {
        this._upDownCleared = true;
        let segments = this._segments.all();
        for (let segment of segments) {
          if (segment.from === segment.to)
            segment.from = segment.to = TextUtils.previousOffset(this._document, segment.from);
          else
            segment.to = segment.from;
        }
        this._setSegments(this._join(segments));
        break;
      }
      case 'selection.select.left': {
        this._upDownCleared = true;
        let segments = this._segments.all();
        for (let segment of segments)
          this._moveFocus(segment, TextUtils.previousOffset(this._document, this._focus(segment)));
        this._setSegments(this._join(segments));
        break;
      }
      case 'selection.move.right': {
        this._upDownCleared = true;
        let segments = this._segments.all();
        for (let segment of segments) {
          if (segment.from === segment.to)
            segment.from = segment.to = TextUtils.nextOffset(this._document, segment.from);
          else
            segment.from = segment.to;
        }
        this._setSegments(this._join(segments));
        break;
      }
      case 'selection.select.right': {
        this._upDownCleared = true;
        let segments = this._segments.all();
        for (let segment of segments)
          this._moveFocus(segment, TextUtils.nextOffset(this._document, this._focus(segment)));
        this._setSegments(this._join(segments));
        break;
      }
      case 'selection.move.up': {
        let segments = this._segments.all();
        for (let segment of segments) {
          if (segment.from === segment.to) {
            let {line, column} = this._document.offsetToPosition(segment.from);
            if (!this._upDownCleared && segment.data.upDownColumn !== undefined)
              column = segment.data.upDownColumn;
            segment.data.upDownColumn = column;
            if (line)
              line--;
            segment.from = segment.to = this._document.positionToOffset({line, column}, true /* clamp */);
          } else {
            segment.to = segment.from;
          }
        }
        this._upDownCleared = false;
        this._setSegments(this._join(segments));
        break;
      }
      case 'selection.select.up': {
        let segments = this._segments.all();
        for (let segment of segments) {
          let {line, column} = this._document.offsetToPosition(this._focus(segment));
          if (!this._upDownCleared && segment.data.upDownColumn !== undefined)
            column = segment.data.upDownColumn;
          segment.data.upDownColumn = column;
          if (line)
            line--;
          this._moveFocus(segment, this._document.positionToOffset({line, column}, true /* clamp */));
        }
        this._upDownCleared = false;
        this._setSegments(this._join(segments));
        break;
      }
      case 'selection.move.down': {
        let segments = this._segments.all();
        for (let segment of segments) {
          if (segment.from === segment.to) {
            let {line, column} = this._document.offsetToPosition(segment.from);
            if (!this._upDownCleared && segment.data.upDownColumn !== undefined)
              column = segment.data.upDownColumn;
            segment.data.upDownColumn = column;
            if (line < this._document.lineCount() - 1)
              line++;
            segment.from = segment.to = this._document.positionToOffset({line, column}, true /* clamp */);
          } else {
            segment.from = segment.to;
          }
        }
        this._upDownCleared = false;
        this._setSegments(this._join(segments));
        break;
      }
      case 'selection.select.down': {
        let segments = this._segments.all();
        for (let segment of segments) {
          let {line, column} = this._document.offsetToPosition(this._focus(segment));
          if (!this._upDownCleared && segment.data.upDownColumn !== undefined)
            column = segment.data.upDownColumn;
          segment.data.upDownColumn = column;
          if (line < this._document.lineCount() - 1)
            line++;
          this._moveFocus(segment, this._document.positionToOffset({line, column}, true /* clamp */));
        }
        this._upDownCleared = false;
        this._setSegments(this._join(segments));
        break;
      }
      case 'selection.move.linestart': {
        this._upDownCleared = true;
        let segments = this._segments.all();
        for (let segment of segments)
          segment.from = segment.to = TextUtils.lineStartOffset(this._document, this._focus(segment));
        this._setSegments(this._join(segments));
        break;
      }
      case 'selection.select.linestart': {
        this._upDownCleared = true;
        let segments = this._segments.all();
        for (let segment of segments)
          this._moveFocus(segment, TextUtils.lineStartOffset(this._document, this._focus(segment)));
        this._setSegments(this._join(segments));
        break;
      }
      case 'selection.move.lineend': {
        this._upDownCleared = true;
        let segments = this._segments.all();
        for (let segment of segments)
          segment.from = segment.to = TextUtils.lineEndOffset(this._document, this._focus(segment));
        this._setSegments(this._join(segments));
        break;
      }
      case 'selection.select.lineend': {
        this._upDownCleared = true;
        let segments = this._segments.all();
        for (let segment of segments)
          this._moveFocus(segment, TextUtils.lineEndOffset(this._document, this._focus(segment)));
        this._setSegments(this._join(segments));
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
    let segments = this._segments.all();
    let collapsed = false;
    for (let segment of segments) {
      if (segment.from !== segment.to) {
        collapsed = true;
        segment.from = segment.to = this._anchor(segment);
      }
    }
    if (!collapsed)
      return false;
    this._document.begin('selection');
    this._upDownCleared = true;
    this._setSegments(segments);
    this._document.end('selection');
    return true;
  }

  /**
   * @param {!Array<!Segment>} segments
   * @return {!Array<!Segment>}
   */
  _join(segments) {
    let length = 1;
    for (let i = 1; i < segments.length; i++) {
      let last = segments[length - 1];
      let next = segments[i];
      if (OffsetRange.intersects(last, next)) {
        let {from, to} = OffsetRange.join(last, next);
        last.from = from;
        last.to = to;
      } else {
        segments[length++] = next;
      }
    }
    if (length !== segments.length)
      segments.splice(length, segments.length - length);
    return segments;
  }

  /**
   * @param {!Array<!Segment>} segments
   * @return {!Array<!Segment>}
   */
  _rebuild(segments) {
    for (let segment of segments) {
      let {from, to} = TextUtils.clampRange(this._document, segment);
      segment.from = from;
      segment.to = to;
    }
    segments.sort(OffsetRange.compare);
    return this._join(segments);
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
