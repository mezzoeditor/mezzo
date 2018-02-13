/**
 * @typdef {{
 *   text: !Array<!TextDecorator>|undefined,
 *   scrollbar: !Array<!ScrollbarDecorator>|undefined
 * }} PluginFrameResult
 */

/**
 * @interface
 */
class Plugin {
  /**
   * Called before building a frame. Plugin is expected to do any
   * postponed work which should synchronously affect the frame.
   * This is a last chance to affect viewport somehow before it is rendered.
   * Example: perform search on the small document based on last search parameters.
   */
  onBeforeFrame() {
  }

  /**
   * Called on every frame creation. Returns decorators which should be
   * used to decorate the frame.
   * Mutating the state which can affect viewport is prohibited,
   * e.g. editing the document or revealing.
   * @param {!Frame} frame
   * @return {!PluginFrameResult}
   */
  onFrame(frame) {
  }

  /**
   * Called when range in the text is replaced with something else.
   * It is usually a good idea to call onReplace on plugin's Decorator(s) here.
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
   * Applying |replacements| in the passed order (similarly to |onReplace|)
   * to the Document's content before |onRestore| will produce it's current
   * content.
   * @param {!Array<{from: number, to: number, inserted: number}>} replacements
   * @param {*|undefined} data
   */
  onRestore(replacements, data) {
  }
};
