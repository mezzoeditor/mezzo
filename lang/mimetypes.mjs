const mimeTypeToHighlighterURL = {
  'text/javascript': './javascript/JSHighlighter.mjs',
  'text/css': './css/CSSHighlighter.mjs',
  'text/html': './html/HTMLHighlighter.mjs',
  'text/markdown': './markdown/MDHighlighter.mjs',
};

export async function createHighlighterForMimeType(editor, mimeType) {
  const moduleURL = mimeTypeToHighlighterURL[mimeType.toLowerCase()];
  if (!moduleURL)
    return null;
  const {createHighlighter} = await import(moduleURL);
  return await createHighlighter(editor);
}
