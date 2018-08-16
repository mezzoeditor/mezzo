import {Editor} from '../src/editor/Editor.mjs';
import {DefaultTheme} from '../src/default/DefaultTheme.mjs';

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
    this._editor = new Editor(SVGRenderer.measurer(), platformSupport);
    this._width = width;
    this._height = height;
    this._theme = DefaultTheme;
  }

  /**
   * @return {!Editor}
   */
  editor() {
    return this._editor;
  }

  /**
   * @return {string}
   */
  render() {
    const viewport = this._editor.viewport();
    const document = viewport.document();

    const gutterLength = (Math.max(document.text().lineCount(), 100) + '').length + GUTTER_PADDING_RIGHT + GUTTER_PADDING_LEFT;
    viewport.setMeasurer(SVGRenderer.measurer());
    viewport.setSize(this._width - gutterLength - SCROLLBAR_WIDTH, this._height);
    viewport.setPadding({
      left: EDITOR_PADDING,
      right: EDITOR_PADDING,
      top: EDITOR_PADDING,
      bottom: this._height - LINE_HEIGHT - EDITOR_PADDING,
    });

    const {text, background, inlineWidgets, scrollbar, lines, paddingLeft, paddingRight} = viewport.decorate();

    const root = SVGNode.createRoot({
      width: this._width,
      height: this._height,
      style: 'font-family: monospace; font-size: 14px;',
    });

    const gutterElement = root.add('g', {id: 'gutter'});
    this._drawGutter(gutterElement, gutterLength, lines);

    const coords = root.add('g', {id: 'viewport'}).pushCoordinateSystem(gutterLength, 0);
    this._drawTextAndBackground(coords, gutterLength, text, background, lines, paddingLeft, paddingRight);

    const scrollbarsElement = root.add('g', {id: 'scrollbars'});
    this._drawVScrollbar(scrollbarsElement);
    this._drawHScrollbar(scrollbarsElement, gutterLength);
    this._drawScrollbarMarkers(scrollbarsElement, scrollbar);

    return root.serialize();
  }

  _drawGutter(svg, gutterLength, lines) {
    svg.add('line', {
      x1: gutterLength, y1: 0, x2: gutterLength, y2: this._height,
      stroke: 'rgb(187, 187, 187)',
    });
    for (let {first, y} of lines) {
      svg.add('text', {x: gutterLength - GUTTER_PADDING_RIGHT, y,
        'text-anchor': 'end',
        'alignment-baseline': 'hanging',
        fill: 'rgb(128, 128, 128)',
      }, (first + 1) + '');
    }
  }

  _drawTextAndBackground(svg, gutterLength, text, background, lines, paddingLeft, paddingRight) {
    const width = this._width - gutterLength - SCROLLBAR_WIDTH;
    const lineDecorations = svg.add('g', {id: 'line-decorations'});
    for (const {y, styles} of lines) {
      for (const style of styles) {
        const theme = this._theme[style];
        if (!theme || !theme.line)
          continue;
        if (theme.line.background && theme.line.background.color) {
          lineDecorations.add('rect', {
            x: paddingLeft, y, width: width - paddingRight, height: LINE_HEIGHT,
            fill: theme.line.background.color,
          });
        }
        if (theme.line.border && theme.line.border.color) {
          lineDecorations.add('rect', {
            x: paddingLeft, y, width: width - paddingRight, height: LINE_HEIGHT,
            fill: transparent,
            stroke: theme.line.border.color,
          });
        }
      }
    }

    const backgroundElement = svg.add('g', {id: 'background'});
    for (let {x, y, width, style} of background) {
      const theme = this._theme[style];
      if (!theme)
        continue;
      if (theme.background && theme.background.color && width) {
        backgroundElement.add('rect', {
          x, y, width, height: LINE_HEIGHT,
          fill: theme.background.color,
        });
      }

      if (theme.border) {
        if (!width && theme.border.color) {
          backgroundElement.add('line', {
            x1: x, y1: y, x2: x, y2: y + LINE_HEIGHT,
            stroke: theme.border.color,
          });
        } else if (width) {
          const radius = theme.border.radius || 0;
          backgroundElement.add('rect', {
            x, y, width, height: LINE_HEIGHT,
            rx: radius,
            ry: radius,
            stroke: theme.border.color,
            fill: transparent,
          });
        }
      }
    }

    const textElement = svg.add('g', {id: 'text'});
    for (let {x, y, content, style} of text) {
      const theme = this._theme[style];
      if (theme && theme.text) {
        textElement.add('text', {
          x, y,
          'alignment-baseline': 'hanging',
          fill: theme.text.color || 'rgb(33, 33, 33)',
        }, content);
      }
    }
  }

  _drawVScrollbar(svg) {
    const viewport = this._editor.viewport();
    const ratio = viewport.height() / (viewport.maxScrollTop() + viewport.height());
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
      y: viewport.scrollTop() * ratio,
      width: 1,
      height: viewport.height() * ratio,
      fill: 'rgba(100, 100, 100, 0.4)'
    });
  }

  _drawHScrollbar(svg, gutterLength) {
    const viewport = this._editor.viewport();
    if (!viewport.maxScrollLeft())
      return;
    const ratio = viewport.width() / (viewport.maxScrollLeft() + viewport.width());
    svg.add('rect', {
      x: gutterLength,
      y: this._height - 1,
      width: this._width - gutterLength - 1,
      height: 1,
      fill: 'transparent',
      stroke: 'rgba(100, 100, 100, 0.2)',
    });
    svg.add('rect', {
      x: gutterLength + viewport.scrollLeft() * ratio,
      y: this._height - 1,
      width: viewport.width() * ratio,
      height: 1,
      fill: 'rgba(100, 100, 100, 0.4)'
    });
  }

  _drawScrollbarMarkers(svg, scrollbar) {
    for (let {y, height, style} of scrollbar) {
      const theme = this._theme[style];
      if (!theme || !theme.line.scrollbar || !theme.line.scrollbar || !theme.line.scrollbar.color)
        continue;
      const left = ((theme.line.scrollbar.left || 0) / 100);
      const right = ((theme.line.scrollbar.right || 100) / 100);
      svg.add('rect', {
        x: this._width - 1 + left,
        y: 0,
        width: right - left,
        height: height,
        fill: theme.line.scrollbar.color,
        class: 'scrollbar-marker'
      });
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
      tag.push(...Object.entries(u.attrs).map(([key, value]) => {
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
