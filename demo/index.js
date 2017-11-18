import { Editor } from "../src/Editor.mjs";

const editor = new Editor(document);
document.body.appendChild(editor.element());
console.log('created!');
