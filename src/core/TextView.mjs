import { EventEmitter } from './EventEmitter.mjs';
import { Metrics } from './Metrics.mjs';
import { Tree } from './Tree.mjs';

export class TextView extends EventEmitter {
  /**
   * @param {!Metrics} metrics
   * @param {!Text} text
   */
  constructor(metrics, text) {
    super();
    this._metrics = metrics;
    this._text = text;
    // this._inlineWidgets = new Decorator(true /* createHandles */);
    let nodes = this._createNodes(text, 0, text.length(), kDefaultChunkSize);
    this._setTree(Tree.build(nodes));
  }

  iterator() {
    // TODO: remove this one.
    return this._tree.iterator();
  }

  /**
   * @param {!Replacement} replacement
   */
  replace(replacement) {
    let from = replacement.offset;
    let to = from + replacement.removed.length();
    let inserted = replacement.inserted.length();

    // for (let inlineWidget of this._inlineWidgets.replace(from, to, inserted)) {
    //   delete inlineWidget[kWidgetSymbol];
    //   this.emit(Viewport.Events.InlineWidgetRemoved, inlineWidget);
    // }

    this._rechunk(replacement.after, from, to, inserted);
    this._text = replacement.after;
  }

  /**
   * @param {!Anchor} from
   * @param {!Anchor} to
   * @param {!Mark} mark
   */
  markRange(from, to, mark) {
    if (mark[kMarkSymbol])
      throw new Error('This mark is already used');
  }

  // /**
  //  * @param {!Viewport.InlineWidget} inlineWidget
  //  * @param {!Anchor} anchor
  //  */
  // addInlineWidget(inlineWidget, anchor) {
  //   if (inlineWidget[kWidgetSymbol])
  //     throw new Error('Widget was already added before');
  //   inlineWidget[kWidgetSymbol] = this._inlineWidgets.add(anchor, anchor, inlineWidget);
  //   this._rechunk(this._document.text(), anchor.offset, anchor.offset, 0);
  // }

  /**
   * @param {!Mark} mark
   */
  clearMark(mark) {
    if (!mark[kMarkSymbol])
      throw new Error('The mark is not set');
  }

  // /**
  //  * @param {!Viewport.InlineWidget} inlineWidget
  //  */
  // removeWidget(inlineWidget) {
  //   if (!inlineWidget[kWidgetSymbol])
  //     throw new Error('Widget was not added before');
  //   let anchor = this._inlineWidgets.resolve(inlineWidget[kWidgetSymbol]).from;
  //   this._inlineWidgets.remove(inlineWidget[kWidgetSymbol]);
  //   delete inlineWidget[kWidgetSymbol];

  //   let split = this._tree.split(anchor.offset, anchor.offset);
  //   let nodes = split.middle.collect();
  //   if (nodes.some(node => !node.data.inlineWidget || !node.data.inlineWidget[kWidgetSymbol]))
  //     throw new Error('Inconsistent');
  //   let index = nodes.findIndex(node => node.data.inlineWidget === inlineWidget);
  //   if (index === -1)
  //     throw new Error('Inconsistent');
  //   nodes.splice(index, 1);

  //   this._setTree(Tree.merge(split.left, Tree.merge(Tree.build(nodes), split.right)));
  // }

  /**
   * @return {!TextMetrics}
   */
  metrics() {
    return this._tree.metrics();
  }

  /**
   * @param {!Point} point
   * @param {RoundMode} roundMode
   * @param {boolean} strict
   * @return {number}
   */
  pointToOffset(point, roundMode = RoundMode.Floor, strict = false) {
    let iterator = this._tree.iterator();
    let clamped = iterator.locateByPoint(point, strict);
    if (clamped === null)
      throw 'Point does not belong to the TextView';
    if (iterator.data === undefined)
      return iterator.before ? iterator.before.offset : 0;
    let from = iterator.before.offset;
    let textChunk = this._text.content(from, from + iterator.metrics.length);
    return this._metrics.locateByPoint(textChunk, iterator.before, clamped, roundMode, strict).offset;
  }

  /**
   * @param {number} offset
   * @return {?Point}
   */
  offsetToPoint(offset) {
    let iterator = this._tree.iterator();
    if (iterator.locateByOffset(offset, true /* strict */) === null)
      return null;
    if (iterator.data === undefined)
      return iterator.before || {x: 0, y: 0};
    let from = iterator.before.offset;
    let textChunk = this._text.content(from, from + iterator.metrics.length);
    return this._metrics.locateByOffset(textChunk, iterator.before, offset);
  }

  /**
   * @param {!Tree<!Chunk>} tree
   */
  _setTree(tree) {
    this._tree = tree;
    this.emit(TextView.Events.Changed);
  }

  /**
   * @param {!Text} text
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   */
  _rechunk(text, from, to, inserted) {
    let split = this._tree.split(from, to);
    let newFrom = split.left.metrics().length;
    let newTo = text.length() - split.right.metrics().length;

    let tmp = split.left.split(split.left.metrics().length, split.left.metrics().length);
    if (!tmp.right.empty())
      throw new Error('Inconsistent');
    split.left = tmp.left;

    tmp = split.right.split(0, 0);
    if (!tmp.left.empty())
      throw new Error('Inconsistent');
    split.right = tmp.right;

    let nodes;
    if (newFrom - from + inserted + to - newTo > kDefaultChunkSize &&
        newFrom - from + inserted <= kDefaultChunkSize) {
      // For typical editing scenarios, we are most likely to replace at the
      // end of insertion next time.
      nodes = this._createNodes(text, newFrom, newTo, kDefaultChunkSize, newFrom - from + inserted);
    } else {
      nodes = this._createNodes(text, newFrom, newTo, kDefaultChunkSize);
    }

    // TODO: remove widgets at split.left.last and split.right.first.
    this._setTree(Tree.merge(split.left, Tree.merge(Tree.build(nodes), split.right)));
  }

  /**
   * @param {!Text} text
   * @param {number} from
   * @param {number} to
   * @param {number} chunkSize
   * @param {number=} firstChunkSize
   * @return {!Array<!{metrics: !TextMetrics, data: !Chunk}>}
   */
  _createNodes(text, from, to, chunkSize, firstChunkSize) {
    let iterator = text.iterator(from, 0, text.length());
    let nodes = [];

    let addNodes = upTo => {
      while (iterator.offset < upTo) {
        let offset = iterator.offset;
        let size = chunkSize;
        if (offset === from && firstChunkSize != undefined)
          size = firstChunkSize;
        size = Math.min(upTo - iterator.offset, size);
        let chunk = iterator.read(size);
        if (Metrics.isSurrogate(chunk.charCodeAt(chunk.length - 1))) {
          chunk += iterator.current;
          iterator.next();
        }
        nodes.push({metrics: this._metrics.forString(chunk), data: {}});
      }
    };

    // this._inlineWidgets.visitTouching(End(from - 1), Start(to + 1), decoration => {
    //   if (decoration.from.offset < from || decoration.to.offset > to)
    //     return;
    //   addNodes(decoration.from.offset);
    //   let inlineWidget = decoration.data;
    //   let width = inlineWidget.width / this._defaultWidth;
    //   let metrics = {length: 0, firstWidth: width, lastWidth: width, longestWidth: width};
    //   nodes.push({metrics, data: {inlineWidget, end: decoration.from.end}});
    // });
    addNodes(to);
    return nodes;
  }
};

TextView.Events = {
  Changed: 'changed'
};

/**
 * @typedef {{
 *   inlineWidget: !Viewport.InlineWidget|undefined,
 *   end: boolean|undefined,
 * }} Chunk
 */

const kMarkSymbol = Symbol('mark');
const kDefaultChunkSize = 1000;

TextView.test = {};

/**
 * @param {!TextView} textView
 * @param {number} chunkSize
 */
TextView.test.rechunk = function(textView, chunkSize) {
  let nodes = textView._createNodes(textView._text, 0, textView._text.length(), chunkSize);
  textView._setTree(Tree.build(nodes));
};
