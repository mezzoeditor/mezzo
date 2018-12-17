const filetypeClasses = {
  'text/javascript': 'mime-js',
  'text/css': 'mime-css',
  'text/html': 'mime-html',
  'text/plain': 'mime-plain',
};

export class Icons {
  static mimeTypeIcon(mimeType) {
    if (!filetypeClasses[mimeType])
      return null;
    const icon = document.createElement('filetype-icon');
    icon.classList.add(filetypeClasses[mimeType]);
    return icon;
  }

  static expandIcon() {
    return document.createElement('expand-icon');
  }
}
