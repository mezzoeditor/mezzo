import {Editor} from '../src/editor/Editor.mjs';
import ClassicTheme from '../themes/Classic.mjs';
import {SelectionDecorator} from '../plugins/SelectionDecorator.mjs';
import {Frame} from '../src/markup/Frame.mjs';

// All sizes are in CH (if horizontal) and EM (if vertical).
const GUTTER_PADDING_LEFT = 0.5;
const GUTTER_PADDING_RIGHT = 0.5;
const EDITOR_PADDING = 0.5;
const SCROLLBAR_WIDTH = 1;
const LINE_HEIGHT = 1;

// SVGRenderer produces SVG images of editor on-demand.
// Internally, SVGRenderer uses CH units for horizontal axis
// and EM units for vertical axis. This makes it trivial to
// define font metrics.
export class SVGRenderer {
  /**
   * @param {!PlatformSupport} platformSupport
   * @param {number=} width
   * @param {number=} height
   */
  constructor(platformSupport, width = 50, height = 20) {
    // TODO: implement reveal when needed.
    this._editor = Editor.create(SVGRenderer.measurer(), platformSupport);
    this._selectionDecorator = new SelectionDecorator(this._editor);
    this._width = width;
    this._height = height;
    this._theme = ClassicTheme;
  }

  /**
   * @return {!Editor}
   */
  editor() {
    return this._editor;
  }

  /**
   * @param {number} scrollLeft
   * @param {number} scrollTop
   * @return {string}
   */
  render(scrollLeft, scrollTop) {
    const document = this._editor.document();

    const gutterLength = (Math.max(document.text().lineCount(), 100) + '').length + GUTTER_PADDING_RIGHT + GUTTER_PADDING_LEFT;
    this._editor.markup().setMeasurer(SVGRenderer.measurer());

    const width = this._width - gutterLength - SCROLLBAR_WIDTH;
    const height = this._height;
    const padding = {
      left: EDITOR_PADDING,
      right: EDITOR_PADDING,
      top: EDITOR_PADDING,
      bottom: this._height - LINE_HEIGHT - EDITOR_PADDING,
    };

    const maxScrollTop = Math.max(0, this._editor.markup().contentHeight() - height + padding.top + padding.bottom);
    const maxScrollLeft = Math.max(0, this._editor.markup().contentWidth() - width + padding.left + padding.right);
    scrollLeft = Math.min(Math.max(scrollLeft, 0), maxScrollLeft);
    scrollTop = Math.min(Math.max(scrollTop, 0), maxScrollTop);

    const frame = new Frame();
    const translateLeft = -scrollLeft + padding.left;
    const translateTop = -scrollTop + padding.top;

    frame.lineLeft = scrollLeft - Math.min(scrollLeft, padding.left);
    frame.lineRight = scrollLeft - padding.left + width
        + Math.min(maxScrollLeft - scrollLeft - padding.right, 0);

    const contentRect = {
      left: scrollLeft - padding.left,
      top: scrollTop - padding.top,
      width: width,
      height: height
    };
    const scrollbar = {
      ratio: height / (maxScrollTop + height),
      minDecorationHeight: 0.001
    }
    this._editor.markup().buildFrame(frame, contentRect, scrollbar, this._editor.decorationCallbacks());

    const root = SVGNode.createRoot({
      width: this._width,
      height: this._height,
      style: 'font-family: monospace; font-size: 14px;',
    });

    root.add('line', {
      x1: gutterLength, y1: 0, x2: gutterLength, y2: this._height,
      stroke: 'rgb(187, 187, 187)',
      id: 'gutter-border',
    });
    const gutter = root.add('g', {id: 'gutter'}).pushCoordinateSystem(0, translateTop);
    this._drawGutter(gutter, gutterLength, frame);

    root.add('clipPath', {id: 'viewport-clip'}).add('rect', {
      x: gutterLength, y: 0,
      width: this._width - gutterLength - SCROLLBAR_WIDTH,
      height: this._height
    });
    const coords = root.add('g', {id: 'viewport', 'clip-path': 'url(#viewport-clip)'})
        .pushCoordinateSystem(gutterLength + translateLeft, translateTop);
    this._drawTextAndBackground(coords, frame);

    const scrollbarsElement = root.add('g', {id: 'scrollbars'});
    this._drawVScrollbar(scrollbarsElement, height, scrollTop, maxScrollTop);
    this._drawHScrollbar(scrollbarsElement, gutterLength, width, scrollLeft, maxScrollLeft);
    this._drawScrollbarMarkers(scrollbarsElement, frame);

    return root.serialize();
  }

  _drawGutter(svg, gutterLength, frame) {
    for (let {y, styles} of frame.lines) {
      for (let style of styles) {
        const theme = this._theme.textDecorations[style];
        if (theme)
          drawRect(svg, 0, y, gutterLength, frame.lineHeight, theme.gutter);
      }
    }
    for (let {first, y} of frame.lines) {
      svg.add('text', {x: gutterLength - GUTTER_PADDING_RIGHT, y,
        'text-anchor': 'end',
        'alignment-baseline': 'hanging',
        fill: 'rgb(128, 128, 128)',
      }, (first + 1) + '');
    }
  }

  _drawTextAndBackground(svg, frame) {
    const lines = svg.add('g', {id: 'lines'});
    for (const {y, styles} of frame.lines) {
      for (const style of styles) {
        const theme = this._theme.textDecorations[style];
        if (theme)
          drawRect(lines, frame.lineLeft, y, frame.lineRight - frame.lineLeft, frame.lineHeight, theme.tokenLine);
      }
    }

    const background = svg.add('g', {id: 'background'});
    for (let {x, y, width, style} of frame.background) {
      const theme = this._theme.textDecorations[style];
      if (theme)
        drawRect(background, x, y, width, LINE_HEIGHT, theme.token);
    }

    const text = svg.add('g', {id: 'text'});
    for (let {x, y, content, style} of frame.text) {
      const theme = this._theme.textDecorations[style];
      if (theme && theme.token) {
        text.add('text', {
          x, y,
          'alignment-baseline': 'hanging',
          'style': 'white-space: pre;',
          fill: theme.token.color || 'rgb(33, 33, 33)',
        }, content);
      }
    }
  }

  _drawVScrollbar(svg, height, scrollTop, maxScrollTop) {
    const ratio = height / (maxScrollTop + height);
    svg.add('rect', {
      x: this._width - 1,
      y: 0,
      width: 1,
      height: this._height,
      fill: 'white',
      stroke: 'rgba(100, 100, 100, 0.2)',
    });
    svg.add('rect', {
      x: this._width - 1,
      y: scrollTop * ratio,
      width: 1,
      height: height * ratio,
      fill: 'rgba(100, 100, 100, 0.4)'
    });
  }

  _drawHScrollbar(svg, gutterLength, width, scrollLeft, maxScrollLeft) {
    if (!maxScrollLeft)
      return;
    const ratio = width / (maxScrollLeft + width);
    svg.add('rect', {
      x: gutterLength,
      y: this._height - 1,
      width: this._width - gutterLength - 1,
      height: 1,
      fill: 'transparent',
      stroke: 'rgba(100, 100, 100, 0.2)',
    });
    svg.add('rect', {
      x: gutterLength + scrollLeft * ratio,
      y: this._height - 1,
      width: width * ratio,
      height: 1,
      fill: 'rgba(100, 100, 100, 0.4)'
    });
  }

  _drawScrollbarMarkers(svg, frame) {
    for (let {y, height, style} of frame.scrollbar) {
      const theme = this._theme.textDecorations[style];
      if (!theme)
        continue;
      const left = ((theme.scrollbarMarker.left || 0) / 100);
      const right = ((theme.scrollbarMarker.right || 100) / 100);
      drawRect(svg, this._width - 1 + left, y, right - left, height, theme.scrollbarMarker);
    }
  }

  static measurer() {
    return {
      defaultWidth: () => 1, // in CHs
      lineHeight: () => 1, // in EMs
      defaultWidthRegex: () => null,
      measureString: s => s.length
    };
  }
}

function drawRect(svg, x, y, width, height, theme) {
  if (!theme)
    return;
  if (!theme['background-color'] && !theme['border-color']) {
    return;
  }
  if (width && height) {
    svg.add('rect', {
      x, y, width, height,
      fill: theme['background-color'] || 'transparent',
      stroke: theme['border-color'],
    });
  } else if (theme['border-color']) {
    svg.add('line', {
      x1: x, y1: y, x2: x + width, y2: y + height,
      fill: theme['background-color'],
      stroke: theme['border-color'],
    });
  }
}

class SVGNode {
  static createRoot(attrs = {}) {
    return new SVGNode('svg', Object.assign({
      'version': '1.1',
      'xmlns': 'http://www.w3.org/2000/svg',
      'baseProfile': 'full'
    }, attrs));
  }

  constructor(name, attrs = {}, text = '') {
    this.name = name;
    this.attrs = attrs;
    this.text = text;
    this.children = [];
  }

  pushCoordinateSystem(x, y) {
    const node = new SVGNode('@@ COORDS @@', {x, y});
    this.children.push(node);
    return node;
  }

  add(name, attrs = {}, text = '') {
    const node = new SVGNode(name, attrs, text);
    this.children.push(node);
    return node;
  }

  serialize() {
    let result = '';
    let translateX = 0;
    let translateY = 0;
    dfs(this, '');
    return result.trim();

    function dfs(u, indent) {
      if (u.name === '@@ COORDS @@') {
        translateX += u.attrs.x;
        translateY += u.attrs.y;
        for (const child of u.children)
          dfs(child, indent);
        translateX -= u.attrs.x;
        translateY -= u.attrs.y;
        return;
      }
      const tag = [];
      tag.push(u.name);
      tag.push(...Object.entries(u.attrs).filter(([key, value]) => value !== undefined).map(([key, value]) => {
        if (typeof value === 'number') {
          if (key === 'x' || key === 'x1' || key === 'x2')
            value = round(value + translateX) + 'ch';
          else if (key === 'width')
            value = round(value) + 'ch';
          else if (key === 'y' || key === 'y1' || key === 'y2')
            value = round(value + translateY) + 'em';
          else if (key === 'height')
            value = round(value) + 'em';
        }
        return `${key}="${value}"`;
      }));
      result += '\n' + indent + '<' + tag.join(' ') + '>';
      if (u.text)
        result += u.text;

      if (u.children.length) {
        for (const child of u.children)
          dfs(child, indent + '  ');
        result += '\n' + indent;
      }
      result += `</${u.name}>`;
    }
  }
}

function round(x) {
  return Math.round(x * 1000) / 1000;
}
