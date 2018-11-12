const isMac = navigator.platform.toUpperCase().indexOf('MAC') !== -1;

export class DOMUtils {
  static on(element, event, handler, capture) {
    element.addEventListener(event, handler, capture);
    return () => DOMUtils.off(element, event, handler);
  }

  static off(element, event, handler) {
    element.removeEventListener(event, handler);
  }

  static isMac() {
    return isMac;
  }
}


