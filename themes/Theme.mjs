export class Theme {
  constructor(descriptor) {
    this.decorations = {};
    for (const [name, payload] of Object.entries(descriptor.decorations)) {
      this.decorations[name] = {
        self: styleFromPayload(payload.self),
        line: styleFromPayload(payload.line),
        gutter: styleFromPayload(payload.gutter),
        scrollbar: styleFromPayload(payload.scrollbar),
      };
    }
  }
}

function styleFromPayload(payload) {
  if (!payload)
    return null;
  const style = {};
  style.borderColor = payload['border-color'];
  style.borderRadius = payload['border-radius'];
  style.borderWidth = payload['border-width'];
  style.backgroundColor = payload['background-color'];
  style.color = payload['color'];
  style.left = payload['left'] || 0;
  style.right = payload['right'] || 100;
  return style;
}

