import { RangeTree } from "../core/utils/RangeTree.mjs";
import { WrappingMode } from "../core/markup/Markup.mjs";
import { Trace } from "../core/utils/Trace.mjs";

import { Mezzo } from "../mezzo/index.mjs";



import ClassicTheme from "../themes/Classic.mjs";
import DarkTheme from "../themes/Dark.mjs";

const mixinTheme = {
  "text": {
    "red": {
      "token": {
        "color": "red",
        "background-color": "rgba(255, 0, 0, 0.2)",
        "border-color": "black",
        "border-width": 1,
        "border-radius": 4
      }
    },
    "green": {
      "token": {
        "color": "green",
        "background-color": "rgba(0, 255, 0, 0.2)"
      }
    },
    "blue": {
      "token": {
        "color": "blue",
        "background-color": "rgba(0, 0, 255, 0.2)",
        "border-color": "rgb(0, 0, 50)",
        "border-width": 1,
        "border-radius": 2
      }
    },
    "the-range": {
      "token": {
        "background-color": "rgba(0, 0, 0, 0.4)"
      }
    },
    "hiddenrange": {
      "token": {
        "background-color": "rgba(0, 128, 0, 0.2)"
      }
    }
  }
};

Trace.setup();

const examples = [
  'index.js',
  'index.html',
  'css.css',
  'nocomments.js',
  'jquery.min.js',
  'shakespeare.txt',
  'megaline.txt',
  'megacolumn.txt',
  'unicode.txt',
  'unicode.js',
  'unicodeperf.txt',
];

let rafid = 0;
function updateTotalSize(mezzo) {
  if (rafid)
    return;
  rafid = requestAnimationFrame(() => {
    rafid = 0;
    let size = mezzo.document().text().length();
    const suffixes = ['B', 'KB', 'MB'];
    let suffixIndex = 0;
    for (suffixIndex = 0; suffixIndex < suffixes.length && size > 1024; ++suffixIndex)
      size /= 1024;
    document.querySelector('.text-size').textContent = Math.round(size) + suffixes[suffixIndex];
    const element = document.querySelector('.hldebugger');
    const selection = mezzo.document().selection();
    if (selection.length > 1) {
      element.textContent = '<multiple selections>';
    } else {
      const from = Math.min(selection[0].anchor, selection[0].focus);
      const to = Math.max(selection[0].anchor, selection[0].focus);
      const decoration = mezzo.editor().highlighter().highlight({
        from: from,
        to: to + 100,
      }).lastTouching(selection[0].focus, selection[0].focus + 0.5);
      if (!decoration) {
        element.textContent = '<none>';
      } else {
        element.textContent = decoration.data;
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  let workerThreadStatus = document.querySelector('#thread-status');
  let mezzo = null;
  try {
    mezzo = await Mezzo.createWithWorker(document);
    workerThreadStatus.classList.add('thread-good');
  } catch (e) {
    mezzo = Mezzo.create(document);
    workerThreadStatus.classList.add('thread-bad');
  }
  mezzo.renderer().setTheme(ClassicTheme.compose(mixinTheme));
  mezzo.document().on('changed', updateTotalSize.bind(null, mezzo));
  window.editor = mezzo;

  const monospaceFontFamily = mezzo.renderer().fontConfig().family;
  document.querySelector('.ismonospace').addEventListener('change', event => {
    const config = mezzo.renderer().fontConfig();
    const monospace = event.target.checked;
    const update = {
      monospace,
      family: monospace ? monospaceFontFamily : 'system-ui',
    };
    mezzo.renderer().setFontConfig({...config, ...update});
  }, false);

  document.querySelector('.wrapping').addEventListener('input', event => {
    let map = new Map([['none', WrappingMode.None], ['line', WrappingMode.Line], ['word', WrappingMode.Word]]);
    mezzo.setWrappingMode(map.get(event.target.value));
  }, false);

  document.querySelector('.fontsize').addEventListener('input', event => {
    const size = parseInt(event.target.value);
    mezzo.renderer().setFontConfig({
      ...mezzo.renderer().fontConfig(),
      size
    });
  }, false);

  document.querySelector('.themes').addEventListener('input', event => {
    if (event.target.value === 'dark')
      mezzo.renderer().setTheme(DarkTheme.compose(mixinTheme));
    else
      mezzo.renderer().setTheme(ClassicTheme.compose(mixinTheme));
  }, false);

  document.body.appendChild(mezzo.element());
  mezzo.element().classList.add('editor');

  window.onresize = () => mezzo.resize();
  mezzo.resize();

  addExamples(mezzo);
  addHighlights(mezzo);
});


function addExamples(mezzo) {
  const select = document.querySelector('.examples');
  for (const example of examples) {
    const option = document.createElement('option');
    option.textContent = example;
    select.appendChild(option);
  }
  select.addEventListener('input', () => setupExample(mezzo, select.value), false);
  setupExample(mezzo, examples[0]);

  async function setupExample(mezzo, exampleName) {
    const text = await fetch(exampleName).then(response => response.text());

    if (exampleName.endsWith('.js'))
      await mezzo.setMimeType('text/javascript');
    else if (exampleName.endsWith('.css'))
      await mezzo.setMimeType('text/css');
    else if (exampleName.endsWith('.html'))
      await mezzo.setMimeType('text/html');
    else
      await mezzo.setMimeType('text/plain');

    if (exampleName.indexOf('jquery') !== -1)
      mezzo.setText(new Array(1000).fill(text).join(''));
    else if (exampleName.indexOf('nocomments') !== -1)
      mezzo.setText(new Array(10000).fill(text).join(''));
    else if (exampleName.indexOf('megacolumn') !== -1)
      mezzo.setText(new Array(10000).fill(text).join(''));
    else if (exampleName.indexOf('unicodeperf') !== -1)
      mezzo.setText(new Array(100).fill(text).join(''));
    else
      mezzo.setText(text);
    // mezzo.setText('abcdefg abcdefg abcdefg abcdefg abcdefg \nabcdefg\n abcdefg abcdefg abcdefg abcdefg\n abcdefg abcdefg abcdefg abcdefg abcdefg abcdefg\n abcdefg');
    mezzo.focus();


    const selection = [];
    for (let i = 0; i < 20; i++) {
      const offset = mezzo.document().text().positionToOffset({line: 4 * i, column: 3});
      selection.push({anchor: offset, focus: offset});
    }
    //let ranges = [{from: 0, to: 0}, {from: 9, to: 9}];
    mezzo.document().setSelection(selection);
  }
}

function addHighlights(mezzo) {
  const tokenHighlighter = new TokenHighlighter(mezzo);

  const select = document.querySelector('.highlights');
  const highlights = ['', 'e', 'the', 'The', '('];
  for (const highlight of highlights) {
    const option = document.createElement('option');
    option.textContent = highlight;
    select.appendChild(option);
  }
  tokenHighlighter.setToken(highlights[0]);
  select.addEventListener('input', () => tokenHighlighter.setToken(select.value), false);
}

//TODO(lushnikov): make this a proper plugin
class TokenHighlighter {
  constructor(mezzo) {
    this._editor = mezzo.editor();
    this._token = '';
    this._editor.addDecorationCallback(this._onDecorate.bind(this));
  }

  setToken(token) {
    if (this._token === token)
      return;
    this._token = token;
    this._editor.raf();
  }

  _onDecorate(frameContent) {
    if (!this._token)
      return [];
    const decorations = new RangeTree();
    for (const range of frameContent.ranges) {
      const text = range.content(this._token.length, this._token.length);
      const offset = Math.max(0, range.from - this._token.length);
      let index = text.indexOf(this._token);
      while (index !== -1) {
        decorations.add(
          offset + index,
          offset + index + this._token.length,
          ['red', 'green', 'blue'][(offset + index) % 3]
        );
        index = text.indexOf(this._token, index + this._token.length);
      }
    }
    frameContent.backgroundDecorations.push(decorations);
  }
}

