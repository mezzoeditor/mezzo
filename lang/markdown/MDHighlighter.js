import {CMHighlighter} from '../codemirror/CMHighlighter.js';
import {} from '../codemirror/modes/overlay.js';
import {} from '../codemirror/modes/xml.js';
import {} from '../codemirror/modes/css.js';
import {} from '../codemirror/modes/javascript.js';
import {} from '../codemirror/modes/meta.js';
import {} from '../codemirror/modes/markdown.js';
import {} from '../codemirror/modes/gfm.js';

export async function createHighlighter(editor) {
  return new CMHighlighter(editor, 'text/x-gfm', new Map(Object.entries({
    'property': 'syntax.string',
    'atom': 'syntax.keyword',
    'number': 'syntax.number',
    'comment': 'syntax.comment',
    'variable-2': 'syntax.variable',
    'css-property': 'syntax.string',
    'css-meta': 'syntax.string',
    'css-atom': 'syntax.keyword',
    'css-number': 'syntax.number',
    'css-comment': 'syntax.comment',
    'css-variable-2': 'syntax.variable',
    'css-string': 'syntax.string',
    'js-keyword': 'syntax.keyword',
    'js-string': 'syntax.string',
    'js-number': 'syntax.number',
    'js-comment': 'syntax.comment',
  })));
}

