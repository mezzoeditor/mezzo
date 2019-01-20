import {Store as IDBStore, get as idbGet, set as idbSet} from './third_party/idb-keyval.js';

// Key-value store with predefined set of keys.
// Each key has a version and defaultValue.
// - If key data changes, the version should be bumped.
// - defaultValue is returned if there's no previously stored value,
//   or if the stored value version is different from the current one.
// - all writes are seriaized
// - reads go parallel, but serialized after pending writes.
//
// NOTE: all instances of Preferences class **must** have unique names.
export class Preferences {
  constructor(prefName, versions) {
    this._versions = new Map(Object.entries(versions));
    this._prefName = prefName;
    this._store = new IDBStore('mezzo-db', prefName);
    this._writePromise = Promise.resolve();
    this._allReadsPromise = Promise.resolve();
  }

  async get(name) {
    if (!this._versions.has(name))
      throw new Error(`Preferences "${this._prefName}" do not have entry named "${name}"`);
    const result = await this._read(name);
    const {version, defaultValue} = this._versions.get(name);
    return result && result.version === version ? result.data : defaultValue;
  }

  async set(name, data) {
    if (!this._versions.has(name))
      throw new Error(`Preferences "${this._prefName}" do not have entry named "${name}"`);
    this._write(name, {
      version: this._versions.get(name).version,
      data,
    });
  }

  async _read(key) {
    // We mighgt have many parallel reads
    const readPromise = this._writePromise.then(() => idbGet(key, this._store));
    this._allReadsPromise = Promise.all([
      this._allReadsPromise,
      readPromise
    ]);
    return await readPromise;
  }

  async _write(key, data) {
    // Write should happen after all reads/writes happened.
    this._writePromise = Promise.all([this._writePromise, this._allReadsPromise]).then(() => idbSet(key, data, this._store));
    await this._writePromise;
  }
}

