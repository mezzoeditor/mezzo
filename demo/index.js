import { Editor } from "../src/Editor.mjs";

const editor = new Editor(document);
document.body.appendChild(editor.element());
editor.element().style.width = '500px';
editor.element().style.height = '400px';
editor.resize();
editor.setText('short\nlonggggggggg\nshort\nlonggggggggg');
editor.focus();
