import {CMHighlighter} from '../codemirror/CMHighlighter.mjs';
import {} from '../codemirror/modes/css.js';

export async function createHighlighter(editor) {
  return new CMHighlighter(editor, 'text/css', new Map(Object.entries({
    'css-property': 'syntax.string',
    'css-meta': 'syntax.string',
    'css-atom': 'syntax.keyword',
    'css-number': 'syntax.number',
    'css-comment': 'syntax.comment',
    'css-variable-2': 'syntax.variable',
    'css-string': 'syntax.string',
  })));
}

