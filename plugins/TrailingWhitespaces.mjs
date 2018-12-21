import { RangeTree } from '../core/utils/RangeTree.mjs';
import { EventEmitter } from '../core/utils/EventEmitter.mjs';

const SPACE_REGEX = /\s+/;

export class TrailingWhitespaces {
  /**
   * @param {!Editor} editor
   */
  constructor(editor) {
    this._document = editor.document();
    this._eventListeners = [
      editor.addDecorationCallback(this._onDecorate.bind(this)),
    ];
  }

  dispose() {
    EventEmitter.removeEventListeners(this._eventListeners);
  }

  /**
   * @param {FrameContent} frameContent
   */
  _onDecorate(frameContent) {
    const trailingWhitespaces = new RangeTree();
    const processedLines = new Set();
    // Do not highlight lines with cursors.
    for (const range of this._document.selection())
      processedLines.add(this._document.text().offsetToPosition(range.focus).line);
    for (const range of frameContent.ranges) {
      const fromPosition = this._document.text().offsetToPosition(range.from);
      const toPosition = this._document.text().offsetToPosition(range.to);
      for (let line = fromPosition.line; line <= toPosition.line; ++line) {
        if (processedLines.has(line))
          continue;
        processedLines.add(line);
        const lineStart = this._document.text().positionToOffset({line, column: 0});
        const lineEnd = this._document.text().positionToOffset({line: line + 1, column: 0}) - 1;
        if (lineStart === lineEnd)
          continue;
        const it = this._document.text().iterator(lineEnd - 1, Math.max(range.from, lineStart), range.to);
        let trailingWhitespaceLength = 0;
        while (!it.outOfBounds() && SPACE_REGEX.test(it.current)) {
          it.prev();
          ++trailingWhitespaceLength;
        }
        if (trailingWhitespaceLength)
          trailingWhitespaces.add(lineEnd - trailingWhitespaceLength, lineEnd, 'whitespace.trailing')
      }
    }
    frameContent.backgroundDecorations.push(trailingWhitespaces);
  }
}
