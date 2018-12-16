import {CMHighlighter} from './CMHighlighter.mjs';
import {} from './modes/css.js';

export async function createHighlighter(editor) {
  return new CMHighlighter(editor, 'text/css', new Map(Object.entries({
    'property': 'syntax.string',
    'atom': 'syntax.keyword',
    'number': 'syntax.number',
    'comment': 'syntax.comment',
    'variable-2': 'syntax.variable',
  })));
}

