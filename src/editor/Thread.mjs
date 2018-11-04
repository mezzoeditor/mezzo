import { EventEmitter } from '../core/EventEmitter.mjs';

class Handle {
  constructor(thread, objectId) {
    this._thread = thread;
    this._objectId = objectId;
    this.expose = {};
    this.remote = new Proxy({}, {
      get(target, propKey, receiver) {
        return async (...args) => await thread._send({
          type: 'proxymethodcall',
          objectId,
          method: propKey,
          args: args.map(serializeArg),
        }).then(result => result.value);
      }
    });
  }

  thread() {
    return this._thread;
  }

  async dispose() {
    await this._thread._send({
      type: 'dispose',
      objectId: this._objectId,
    });
  }
}

export class Thread {
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
    return new Thread(worker);
  }

  constructor(worker) {
    this._worker = worker;
    this._worker.onmessage = this._onMessage.bind(this);
    this._lastRequestId = 0;
    this._disposed = false;
    this._handles = new Map();
    this._pendingMessages = new Map();
  }

  async evaluate(fun, ...args) {
    let result = await this._send({
      type: 'evaluate',
      fun: fun.toString(),
      args: args.map(serializeArg),
    });
    if (!result.objectId)
      return result.value;
    let handle = new Handle(this, result.objectId);
    this._handles.set(result.objectId, handle);
    return handle;
  }

  async createRPC() {
    let result = await this._send({ type: 'createrpc' });
    let handle = new Handle(this, result.objectId);
    this._handles.set(result.objectId, handle);
    return handle;
  }

  dispose() {
    if (this._disposed)
      return;
    this._disposed = true;
    this._worker.terminate();
    this._worker = null;
  }

  /**
   * @param {*} message
   * @return {!Promise<*>}
   */
  _send(message) {
    message.requestId = ++this._lastRequestId;
    this._worker.postMessage(message);
    return new Promise((fulfill, reject) => {
      this._pendingMessages.set(message.requestId, {fulfill, reject});
    });
  }

  /**
   * @param {*} event
   */
  async _onMessage({data}) {
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
    } else if (data.requestId) {
      const response = {responseId: data.requestId};
      try {
        if (data.type === 'proxymethodcall') {
          const rpc = this._handles.get(data.objectId);
          if (!rpc)
            throw new Error('Cannot find remote proxy!');
          if (!(rpc instanceof Handle))
            throw new Error(`Object with id = "${data.objectId}" is not an RPCHandle!`);
          const result = await rpc.expose[data.method].apply(null, data.args);
          response.result = serializeArg(result);
        }
      } catch (e) {
        response.error = {
          message: e.message,
          stack: e.stack,
        };
      }
      this._worker.postMessage(response);
    }
  }
}

function serializeArg(arg) {
  if (arg instanceof Handle)
    return {objectId: arg._objectId};
  if (arg && (typeof arg.importable === 'function'))
    return {importable: arg.importable()};
  return {value: arg};
}

export async function workerFunction(port, platformSupport) {
  self.platformSupport = platformSupport;
  let lastObjectId = 0;
  let lastRequestId = 0;
  const objects = new Map();

  const pendingMessages = new Map();

  port.onmessage = ({data}) => {
    if (data.requestId)
      handleRequest(data);
    else if (data.responseId)
      handleResponse(data);
    else
      console.warn('BAD MESSAGE RECEIVED', data);
  };
  port.postMessage('workerready');


  async function handleRequest(data) {
    const response = {responseId: data.requestId};
    try {
      if (data.type === 'createrpc') {
        const objectId = ++lastObjectId;
        const rpc = new RPCObject(objectId);
        objects.set(objectId, rpc);
        response.result = {objectId};
      } else if (data.type === 'evaluate') {
        const fun = eval(data.fun);
        const args = await Promise.all(data.args.map(deserializeArg));
        const result = await fun.apply(null, args);
        if (result && typeof result === 'object') {
          const objectId = ++lastObjectId;
          objects.set(objectId, result);
          response.result = {objectId};
        } else {
          response.result = {value: result};
        }
      } else if (data.type === 'proxymethodcall') {
        const args = await Promise.all(data.args.map(deserializeArg));
        const rpc = objects.get(data.objectId);
        if (!rpc)
          throw new Error(`Failed to find rpc for objectId "${data.objectId}"`);
        if (!(rpc instanceof RPCObject))
          throw new Error(`Object with id "${data.objectId}" is not an RPCObject!`);
        const result = await rpc.expose[data.method](...args);
        response.result = {value: result};
      } else if (data.type === 'dispose') {
        objects.delete(data.objectId);
      }
    } catch (e) {
      response.error = {
        message: e.message,
        stack: e.stack
      };
    }
    port.postMessage(response);
  }

  async function handleResponse(data) {
    const {fulfill, reject} = pendingMessages.get(data.responseId);
    pendingMessages.delete(data.id);
    if (data.error) {
      const error = new Error();
      error.message = data.error.message;
      error.stack = data.error.stack;
      reject.call(null, error);
    } else {
      fulfill.call(null, data.result);
    }
  }

  /**
   * @param {*} message
   * @return {!Promise<*>}
   */
  function send(message) {
    message.requestId = ++lastRequestId;
    port.postMessage(message);
    return new Promise((fulfill, reject) => {
      pendingMessages.set(message.requestId, {fulfill, reject});
    });
  }

  async function deserializeArg(arg) {
    if (arg.objectId) {
      if (!objects.has(arg.objectId))
        throw new Error(`Cannot find object with id "${arg.objectId}"`);
      return objects.get(arg.objectId);
    }
    if (arg.importable) {
      const module = await import(arg.importable.url);
      return module[arg.importable.name];
    }
    return arg.value;
  }

  class RPCObject {
    constructor(objectId) {
      this.remote = new Proxy({}, {
        get(target, propKey, receiver) {
          return async (...args) => await send({
            type: 'proxymethodcall',
            objectId,
            method: propKey,
            args,
          }).then(deserializeArg);
        }
      });
      this.expose = {};
    }
  }
}

