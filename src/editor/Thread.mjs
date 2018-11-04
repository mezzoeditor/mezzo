/**
 * Represents an object in a remote runtime. Remote objects are
 * created
 * Remote methods could be called using RemoteObjec.rpc.* methods.
 *
 * NOTE: RPC invocations DO NOT support RemoteObject passing.
 * This limitation is currently in place to make use of fast
 * structural clone that is available in web browsers.
 *
 * NOTE: *every* RemoteObject should be "disposed" when not needed
 * to avoid memory leaks.
 */
class RemoteObject {
  constructor(runtime, remoteObjectId) {
    this._runtime = runtime;
    this._remoteObjectId = remoteObjectId;
    this.rpc = new Proxy({}, {
      get(target, propKey, receiver) {
        return async (...args) => await runtime._send({
          type: 'rpc',
          remoteObjectId,
          method: propKey,
          args,
        });
      }
    });
  }

  runtime() {
    return this._runtime;
  }

  /**
   * Must be called to free up resources.
   */
  async dispose() {
    await this._runtime._dispose(this);
  }
}

const SPECIAL_OBJECT_KEY = 'hRmU4CzGcj6A46J6dgWf3ek7zneBUjFU';
const localObjectSymbol = Symbol('LocalObject');

/**
 * Runtime encapsulates access to the remote javascript runtime.
 */
class Runtime {
  constructor(name, port, platformSupport) {
    this._name = name;
    this._port = port;
    this._port.onmessage = this._onMessage.bind(this);
    this._platformSupport = platformSupport;
    this._lastRequestId = 0;
    this._lastObjectId = 0;
    this._localObjects = new Map();
    this._remoteObjects = new Map();
    this._pendingMessages = new Map();
    this._debug = platformSupport.debugLogger('thread');
  }

  /**
   * Mark object as exposed. When transfered using either arguments
   * or return value of `runtime.evaluate`, it'll be transformed to
   * RemoteObject on the other end.
   */
  expose(obj) {
    // Mark object as exposed.
    // Do not retain until it is transfered / serialized.
    if (!obj[localObjectSymbol])
      obj[localObjectSymbol] = {localObjectId: ''};
    return obj;
  }

  platformSupport() {
    return this._platformSupport;
  }

  /**
   * Evaluate a piece of code in the runtime.
   * Both arguments and return value are smartly serialized:
   * - RemoteObjects are expanded as local objects and vice versa
   * - Classes that have `importable()` field are imported using ESM
   *
   * NOTE: function |fun| is always called with instance of Runtime as
   * the first argument.
   */
  async evaluate(fun, ...args) {
    let result = await this._send({
      type: 'evaluate',
      fun: fun.toString(),
      args: this._serialize(args),
    });
    return await this._deserialize(result);
  }

  async _dispose(remoteObject) {
    await this._send({
      type: 'dispose',
      remoteObjectId: remoteObject._remoteObjectId,
    });
    this._remoteObjects.delete(remoteObject._remoteObjectId);
  }

  _serialize(obj) {
    if (obj[localObjectSymbol]) {
      const local = obj[localObjectSymbol];
      if (!local.localObjectId) {
        local.localObjectId = ++this._lastObjectId;
        this._localObjects.set(local.localObjectId, obj);
      }
      return {
        [SPECIAL_OBJECT_KEY]: true,
        localObjectId: local.localObjectId,
      };
    }
    if (obj instanceof RemoteObject) {
      return {
        [SPECIAL_OBJECT_KEY]: true,
        remoteObjectId: obj._remoteObjectId,
      };
    }
    if (typeof obj === 'function') {
      if (typeof obj.importable !== 'function')
        throw new Error('cannot serialize functions!');
      return {
        [SPECIAL_OBJECT_KEY]: true,
        importable: obj.importable(),
      };
    }
    if (Array.isArray(obj))
      return obj.map(x => this._serialize(x));
    if (typeof obj === 'object') {
      const result = {};
      for (const key of Object.keys(obj))
        result[key] = this._serialize(obj[key]);
      return result;
    }
    return obj;
  }

  async _deserialize(obj) {
    if (obj[SPECIAL_OBJECT_KEY]) {
      if (obj.importable)
        return (await import(obj.importable.url))[obj.importable.name];
      // Their remote is our local.
      if (obj.remoteObjectId) {
        if (!this._localObjects.has(obj.remoteObjectId))
          throw new Error(`Failed to find object with id "${obj.objectId}"`);
        return this._localObjects.get(obj.remoteObjectId);
      }
      // Their local is our remote.
      if (obj.localObjectId) {
        let remoteObject = this._remoteObjects.get(obj.localObjectId);
        if (!remoteObject) {
          remoteObject = new RemoteObject(this, obj.localObjectId);
          this._remoteObjects.set(obj.localObjectId, remoteObject);
        }
        return remoteObject;
      }
      throw new Error('Unknown SPECIAL_OBJECT_KEY value received!');
    }
    if (Array.isArray(obj))
      return Promise.all(obj.map(x => this._deserialize(x)));
    if (typeof obj === 'object') {
      const result = {};
      const promises = [];
      for (const key of Object.keys(obj))
        promises.push(this._deserialize(obj[key]).then(x => result[key] = x));
      await Promise.all(promises);
      return result;
    }
    return obj;
  }

  /**
   * @param {*} message
   * @return {!Promise<*>}
   */
  _send(message) {
    message.requestId = ++this._lastRequestId;
    this._debug(`► SEND[${this._name}] ► ` + JSON.stringify(message));
    this._port.postMessage(message);
    return new Promise((fulfill, reject) => {
      this._pendingMessages.set(message.requestId, {fulfill, reject});
    });
  }

  /**
   * @param {*} event
   */
  async _onMessage({data}) {
    this._debug(`◀ RECV[${this._name}] ◀ ` + JSON.stringify(data));
    if (data.responseId) {
      const {fulfill, reject} = this._pendingMessages.get(data.responseId);
      this._pendingMessages.delete(data.responseId);
      if (data.error) {
        const error = new Error();
        error.message = data.error.message;
        error.stack = data.error.stack;
        reject.call(null, error);
      } else {
        fulfill.call(null, data.result);
      }
      return;
    }
    if (data.requestId) {
      const response = {responseId: data.requestId};
      try {
        if (data.type === 'rpc') {
          const localObject = this._localObjects.get(data.remoteObjectId);
          if (!localObject)
            throw new Error(`Cannot find object with id "${data.remoteObjectId}"`);
          const result = await localObject[data.method](...data.args);
          response.result = result;
        } else if (data.type === 'evaluate') {
          const fun = eval(data.fun);
          const args = await this._deserialize(data.args);
          const result = await fun.call(null, this, ...args);
          response.result = this._serialize(result);
        } else if (data.type === 'dispose') {
          if (!this._localObjects.has(data.remoteObjectId))
            throw new Error(`Cannot find object with id "${data.remoteObjectId}"`);
          const localObject = this._localObjects.get(data.remoteObjectId);
          this._localObjects.delete(data.remoteObjectId);
          delete localObject[localObjectSymbol];
        }
      } catch (e) {
        response.error = {
          message: e.message,
          stack: e.stack,
        };
      }
      this._debug(`► SEND[${this._name}] ► ` + JSON.stringify(response));
      this._port.postMessage(response);
    }
  }
}

export function workerFunction(port, platformSupport) {
  const runtime = new Runtime('worker', port, platformSupport);
  port.postMessage('workerready');
}

/**
 * Thread is a runtime; could be created and terminated.
 */
export class Thread extends Runtime {
  /**
   * @param {!PlatformSupport} platformSupport
   */
  static async create(platformSupport) {
    const worker = platformSupport.createWorker(import.meta.url, 'workerFunction');
    await new Promise(fulfill => {
      worker.onmessage = (event) => {
        if (event.data !== 'workerready')
          throw new Error('The first message from ThreadBackend must be "workerready"!');
        worker.onmessage = null;
        fulfill();
      }
    });
    return new Thread(worker, platformSupport);
  }

  constructor(worker, platformSupport) {
    super('ui', worker, platformSupport);
    this._worker = worker;
    this._disposed = false;
  }

  dispose() {
    if (this._disposed)
      return;
    this._disposed = true;
    this._worker.terminate();
    this._worker = null;
  }
}

