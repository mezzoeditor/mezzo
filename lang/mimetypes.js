const mimeTypeToHighlighterURL = {
  'text/javascript': './javascript/JSHighlighter.js',
  'text/css': './css/CSSHighlighter.js',
  'text/html': './html/HTMLHighlighter.js',
  'text/markdown': './markdown/MDHighlighter.js',
};

export async function createHighlighterForMimeType(editor, mimeType) {
  const moduleURL = mimeTypeToHighlighterURL[mimeType.toLowerCase()];
  if (!moduleURL)
    return null;
  const {createHighlighter} = await import(moduleURL);
  return await createHighlighter(editor);
}
