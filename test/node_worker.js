class Port {
  constructor() {
    this.onmessage = null;

    process.on('message', data => {
      if (this.onmessage)
        this.onmessage.call(null, {data});
    });
  }

  postMessage(msg) {
    process.send(msg);
  }
}

(async () => {
  const [platformSupportModule, workerModule] = await Promise.all([
    import(process.argv[2]),
    import(process.argv[3]),
  ]);
  const mainFunction = workerModule[process.argv[4]];
  const platformSupport = new platformSupportModule.TestPlatformSupport(false /* supportWorkers */);
  global.self = global;
  mainFunction.call(null, new Port(), platformSupport);
})();

