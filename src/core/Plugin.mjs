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
   * Called on every frame creation. Returns decorators which should be
   * used to decorate the frame.
   * Mutating the state which can affect viewport is prohibited,
   * e.g. editing the document or revealing.
   * @param {!Frame} frame
   * @return {!PluginFrameResult}
   */
  onFrame(frame) {
  }
};
