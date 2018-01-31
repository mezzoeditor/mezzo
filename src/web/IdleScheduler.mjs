/**
 * @implements Scheduler
 */
export class IdleScheduler {
  constructor() {
    this._scheduledId = null;
    this._work = null;
    this._done = null;
    this._onIdleBound = this._onIdle.bind(this);
  }

  /**
   * @override
   * @param {function():boolean} work
   * @param {function()=} done
   */
  init(work, done) {
    this._work = work.bind(null);
    this._done = (done || function() {}).bind(null);
  }

  /**
   * @override
   */
  schedule() {
    if (!this._work)
      throw 'init scheduler first';
    if (!this._scheduledId)
      this._scheduledId = self.requestIdleCallback(this._onIdleBound, {timeout: 1000});
  }

  /**
   * @override
   */
  cancel() {
    if (!this._work)
      throw 'init scheduler first';
    if (this._scheduledId) {
      self.cancelIdleCallback(this._scheduledId);
      this._scheduledId = null;
    }
  }

  /**
   * @param {!IdleDeadline} deadline
   */
  _onIdle(deadline) {
    this._scheduledId = null;
    let hasMoreWork = true;
    if (deadline.didTimeout) {
      hasMoreWork = this._work();
    } else {
      while (deadline.timeRemaining() > 0) {
        hasMoreWork = this._work();
        if (!hasMoreWork)
          break;
      }
    }
    this._done();
    if (hasMoreWork)
      this.schedule();
  }
};
