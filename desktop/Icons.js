const filetypeClasses = {
  'text/javascript': 'mime-js',
  'text/css': 'mime-css',
  'text/html': 'mime-html',
  'text/plain': 'mime-plain',
};

export class Icons {
  static mimeTypeIcon(mimeType) {
    const iconType = filetypeClasses[mimeType] || 'mime-plain';
    const icon = document.createElement('filetype-icon');
    icon.classList.add(iconType);
    return icon;
  }

  static expandIcon() {
    return document.createElement('expand-icon');
  }
}
