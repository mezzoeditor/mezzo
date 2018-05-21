const isMac = navigator.platform.toUpperCase().indexOf('MAC') !== -1;

export class KeymapHandler {
  constructor() {
    this._keymaps = [];
  }

  addKeymap(rawKeymap, handler) {
    const keymap = new Map();
    for (let key in rawKeymap) {
      let value = rawKeymap[key];
      keymap.set(stringToHash(key), value);
    }
    this._keymaps.push({
      keymap, handler
    });
  }

  handleKeyDown(event) {
    const eventHash = eventToHash(event);
    let handled = false;
    for (let i = this._keymaps.length - 1; i >= 0 && !handled; i--) {
      const {keymap, handler} = this._keymaps[i];
      let command = keymap.get(eventHash);
      if (command)
        handled = handler.call(null, command);
    }
    return handled;
  }
}

function eventToHash(event) {
  let hash = [];
  if (event.ctrlKey)
    hash.push('CTRL');
  if (event.metaKey)
    hash.push('CMD');
  if (event.altKey)
    hash.push('ALT');
  if (event.shiftKey)
    hash.push('SHIFT');
  let key = event.key.toUpperCase();
  if (key.startsWith('ARROW'))
    hash.push(key.substring('ARROW'.length));
  else if (key !== 'META' && key !== 'CONTROL' && key !== 'ALT' && key !== 'SHIFT')
    hash.push(key);
  return hash.join('-');
}

function stringToHash(eventString) {
  let tokens = eventString.toUpperCase().split('-');
  let ctrlOrCmd = tokens.includes('CMD/CTRL');
  let ctrl = tokens.includes('CTRL') || (ctrlOrCmd && !isMac);
  let cmd = tokens.includes('CMD') || (ctrlOrCmd && isMac);

  let hash = [];
  if (ctrl)
    hash.push('CTRL');
  if (cmd)
    hash.push('CMD');
  if (tokens.includes('ALT'))
    hash.push('ALT');
  if (tokens.includes('SHIFT'))
    hash.push('SHIFT');
  tokens = tokens.filter(token => token !== 'ALT' && token !== 'CTRL' && token !== 'SHIFT' && token !== 'CMD' && token !== 'CMD/CTRL');
  tokens.sort();
  hash.push(...tokens);
  return hash.join('-');
}

