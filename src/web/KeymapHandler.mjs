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
    let obj = {keymap, handler};
    this._keymaps.push(obj);
    return () => {
      this._keymaps = this._keymaps.filter(e => e !== obj);
    };
  }

  handleKeyDown(event) {
    const eventHash = eventToHash(event);

    if (event.repeat && this._shortcutBeingHeld && eventHash == this._shortcutBeingHeld.eventHash) {
      event.stopPropagation();
      event.preventDefault();
      ++this._shortcutBeingHeld.repeatCount;

      // First time repeat event is generated, capture time.
      if (!this._shortcutBeingHeld.repeatStart) {
        this._shortcutBeingHeld.repeatStart = performance.now();
        this._shortcutBeingHeld.handle();
        return;
      }

      // Second time repeat event is generated, capture repeat cadence.
      if (!this._shortcutBeingHeld.repeatCadence) {
        this._shortcutBeingHeld.repeatCadence = performance.now() - this._shortcutBeingHeld.repeatStart;
        this._shortcutBeingHeld.handle();
        return;
      }

      // First 5 repeats - standard repeat cadence.
      if (this._shortcutBeingHeld.repeatCount < 5) {
        this._shortcutBeingHeld.handle();
        return;
      }

      // Latter repeats - turborepeat using raf.
      const deadline = performance.now() + 1.5 * this._shortcutBeingHeld.repeatCadence;
      const rafLoop = () => {
        if (performance.now() >= deadline) {
          this._shortcutBeingHeld = null;
          return;
        }
        this._shortcutBeingHeld.handle();
        this._shortcutBeingHeld.rafLoop = requestAnimationFrame(rafLoop);
      };
      // Restart loop for every event.repeat.
      cancelAnimationFrame(this._shortcutBeingHeld.rafLoop);
      rafLoop();
      return;

    }

    let handled = false;
    for (let i = this._keymaps.length - 1; i >= 0 && !handled; i--) {
      const {keymap, handler} = this._keymaps[i];
      let command = keymap.get(eventHash);
      if (command)
        handled = handler.call(null, command);
      if (handled) {
        event.stopPropagation();
        event.preventDefault();
        this._shortcutBeingHeld = { eventHash, command, handle: handler.bind(null, command), repeatCount: 0 };
        break;
      }
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

