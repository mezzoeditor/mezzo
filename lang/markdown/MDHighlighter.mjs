import {CMHighlighter} from '../codemirror/CMHighlighter.mjs';
import {} from '../codemirror/modes/xml.js';
import {} from '../codemirror/modes/markdown.js';

export async function createHighlighter(editor) {
  return new CMHighlighter(editor, 'text/markdown', new Map(Object.entries({
    'property': 'syntax.string',
    'atom': 'syntax.keyword',
    'number': 'syntax.number',
    'comment': 'syntax.comment',
    'variable-2': 'syntax.variable',
  })));
}

