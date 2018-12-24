import {CMHighlighter} from '../codemirror/CMHighlighter.mjs';
import {} from '../codemirror/modes/css.js';
import {} from '../codemirror/modes/xml.js';
import {} from '../codemirror/modes/javascript.js';
import {} from '../codemirror/modes/htmlmixed.js';

export async function createHighlighter(editor) {
  return new CMHighlighter(editor, 'text/html', new Map(Object.entries({
    'string': 'syntax.string',
    'tag': 'syntax.keyword',
    'number': 'syntax.number',
    'comment': 'syntax.comment',
  })));
}

