/**
 * @interface
 */
class Scheduler {
  /**
   * |doSomeWork| returns true iff there is still more work to do.
   *
   * It is good idea to chunk the work into smaller manageable pieces,
   * running ~1-3ms each. Not too small (for efficiency), but not
   * too large (for workload balancing).
   *
   * |doneSomeWork| is called after no more work will be done
   * synchornously, with maybe some more work later.
   *
   * @param {function():boolean} doSomeWork
   * @param {function()=} doneSomeWork
   */
  init(doSomeWork, doneSomeWork) {
  }

  /**
   * There is more work to do - schedule it!
   */
  schedule() {
  }

  /**
   * The work is not really needed anymore, plz no schedule.
   */
  cancel() {
  }
};
