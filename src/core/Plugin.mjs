/**
 * @interface
 */
class Plugin {
  /**
   * Called when this plugin is added to the document.
   * Typically plugin adds Decorator(s) to the document here.
   * @param {!Document} document
   */
  onAdded(document) {
  }

  /**
   * Called when this plugin is removed from the document.
   * Typically plugin removes Decorator(s) from the document here.
   * @param {!Document} document
   */
  onRemoved(document) {
  }

  /**
   * Called on every render of viewport. Plugin is expected to manipulate
   * Decorator object(s) to affect the rendering.
   * @param {!Viewport} viewport
   */
  onViewport(viewport) {
  }

  /**
   * Called when range in the text is replaced with something else.
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   */
  onReplace(from, to, inserted) {
  }

  /**
   * Called when command should be executed. Return undefined if command is unhandled.
   * @param {string} command
   * @param {*} data
   * @return {*|undefined}
   */
  onCommand(command, data) {
  }

  /**
   * Called when history is about to save the state.
   * Returned data is stored in the history state.
   * @return {*}
   */
  onSave() {
  }

  /**
   * Called when history state is about to be restored,
   * with the data returned from onSaveState (if any).
   * @param {!Array<{from: number, to: number, inserted: number}>} replacements
   * @param {*|undefined} data
   */
  onRestore(replacements, data) {
  }

  /**
   * On idle for background work. TBD.
   * @param {?} limit
   */
  onIdle(limit) {
  }
};
