const kSyncProcessing = false;

/**
 * This class helps to schedule full document processing by chunking work.
 * It operates on ranges, starting with full document range and reducing
 * it as scheduler allows.
 */
export class RangeScheduler {
  /**
   * @param {!Scheduler} scheduler
   * @param {function(!Range):?Range} visibleRangeToProcessingRange
   *   When we determine that some visible range needs to be (re)processed, this
   *   function converts that range into internal "processing range", which is
   *   later used in chunking and |processRange|.
   * @param {function(!Range):!Range} processRange
   *   Called to processing a passed range. Returns the actually process range,
   *   which may be smaller or larger than passed one. This function operates on
   *   internal "processing range", as opposite to visible range.
   * @param {number} chunkSize
   *   Range length which is processed not too fast (for efficiency), but also
   *   not too slow (for workload balance).
   * @param {function()=} doneProcessing
   *   Called when some synchronous work has been done, and no more synchronous
   *   work is planned.
   */
  constructor(scheduler, visibleRangeToProcessingRange, processRange, chunkSize, doneProcessing) {
    this._scheduler = scheduler;
    this._visibleRangeToProcessingRange = visibleRangeToProcessingRange.bind(null);
    this._processRange = processRange.bind(null);
    this._chunkSize = chunkSize;
    this._doneProcessing = (doneProcessing || function() {}).bind(null);
    this._rangeToProcess = null;  // [from, to] inclusive.
    this._scheduler.init(this._processNextChunk.bind(this), this._doneProcessing);
  }

  onBeforeFrame() {
    if (kSyncProcessing) {
      if (!this._rangeToProcess)
        return;
      while (this._rangeToProcess)
        this._processNextChunk();
      this._doneProcessing();
      return;
    }

    if (!this._rangeToProcess || (this._rangeToProcess.to - this._rangeToProcess.from > this._chunkSize))
      return;
    this._processNextChunk();
    this._doneProcessing();
  }

  /**
   * @param {!Frame} frame
   */
  onFrame(frame) {
    if (!this._rangeToProcess)
      return;

    let frameRange = this._visibleRangeToProcessingRange(frame.range());
    if (!frameRange || this._rangeToProcess.from >= frameRange.to || this._rangeToProcess.to <= frameRange.from)
      return;

    let didProcessSomething = false;
    for (let range of frame.ranges()) {
      let processingRange = this._visibleRangeToProcessingRange({from: range.from, to: range.to});
      if (processingRange) {
        this._processed(this._processRange(processingRange));
        didProcessSomething = true;
      }
    }
    if (didProcessSomething)
      this._doneProcessing();
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {number} inserted
   */
  onReplace(from, to, inserted) {
    let range = this._visibleRangeToProcessingRange({from, to});
    if (range)
      this._processed(range);
    range = this._visibleRangeToProcessingRange({from: from, to: from + inserted});
    if (range)
      this._needsProcessing(range);
  }

  /**
   * @param {!Document} document
   */
  start(document) {
    let range = this._visibleRangeToProcessingRange({from: 0, to: document.length()});
    if (range)
      this._needsProcessing(range);
  }

  stop() {
    this._scheduler.cancel();
    this._rangeToProcess = null;
  }

  /**
   * @return {boolean}
   */
  _processNextChunk() {
    if (!this._rangeToProcess)
      return false;
    let from = this._rangeToProcess.from;
    let to = Math.min(this._rangeToProcess.to, from + this._chunkSize);
    this._processed(this._processRange({from, to}));
    return !!this._rangeToProcess;
  }

  /**
   * @param {!Range} range
   */
  _needsProcessing(range) {
    let {from, to} = range;
    if (this._rangeToProcess) {
      from = Math.min(from, this._rangeToProcess.from);
      to = Math.max(to, this._rangeToProcess.to);
    }
    this._rangeToProcess = {from, to};
    this._scheduler.schedule();
  }

  /**
   * @param {!Range} range
   */
  _processed(range) {
    if (!this._rangeToProcess)
      return;
    let {from, to} = range;
    if (from <= this._rangeToProcess.from && to >= this._rangeToProcess.to) {
      this._rangeToProcess = null;
      this._scheduler.cancel();
      return;
    }
    if (from <= this._rangeToProcess.from && to >= this._rangeToProcess.from)
      this._rangeToProcess.from = to;
    else if (from <= this._rangeToProcess.to && to >= this._rangeToProcess.to)
      this._rangeToProcess.to = from;
  }
};
