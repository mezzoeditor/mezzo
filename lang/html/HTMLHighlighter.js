import {CMHighlighter} from '../codemirror/CMHighlighter.js';
import {} from '../codemirror/modes/css.js';
import {} from '../codemirror/modes/xml.js';
import {} from '../codemirror/modes/javascript.js';
import {} from '../codemirror/modes/htmlmixed.js';

export async function createHighlighter(editor) {
  return new CMHighlighter(editor, 'text/html', new Map(Object.entries({
    'css-property': 'syntax.string',
    'css-meta': 'syntax.string',
    'css-atom': 'syntax.keyword',
    'css-number': 'syntax.number',
    'css-comment': 'syntax.comment',
    'css-variable-2': 'syntax.variable',
    'css-string': 'syntax.string',
    'xml-tag': 'syntax.keyword',
    'xml-string': 'syntax.string',
    'xml-comment': 'syntax.comment',
    'js-keyword': 'syntax.keyword',
    'js-string': 'syntax.string',
    'js-number': 'syntax.number',
    'js-comment': 'syntax.comment',
  })));
}

