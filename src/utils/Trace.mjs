export let Trace = {};
Trace.beginGroup = () => {};
Trace.begin = () => {};
Trace.end = () => {};
Trace.count = () => {};
Trace.print = () => {};
Trace.reset = () => {};
Trace.endGroup = () => {};

Trace.setup = function(maxDepth) {
  let stack = [];
  let current;
  let depth = maxDepth === undefined ? Number.NEGATIVE_INFINITY : -maxDepth;

  let timings = {};
  let startTimes = {};
  let counters = {};
  let groupCounters = {};
  let reports = {};

  let _print = prefix => {
    let count = groupCounters[prefix] || 1;

    console.groupCollapsed(`[trace] ${prefix} x${count}: ${timings[prefix] / count} ms`);
    let results = [];
    for (let key in timings) {
      if (key.startsWith(prefix))
        results.push(`[trace] ${key} : ${timings[key] / count} ms`);
    }
    for (let key in counters) {
      if (key.startsWith(prefix))
        results.push(`[trace] ${key} : ${counters[key] / count}`);
    }
    results.sort();
    for (let result of results)
      console.log(result);
    console.groupEnd();
  };

  let _reset = (container, prefix) => {
    for (let key in container) {
      if (key.startsWith(prefix))
        delete container[key];
    }
  };

  Trace.beginGroup = name => {
    if (++depth > 0)
      return;
    if (current)
      stack.push(current);
    current = {
      name: name,
      prefix: (current ? current.prefix : '') + name + '.',
      start: window.performance.now()
    };
  };

  Trace.begin = timing => {
    if (depth < 0 && current)
      startTimes[current.prefix + timing] = window.performance.now();
  };

  Trace.end = timing => {
    if (!(depth < 0) || !current)
      return;
    timing = current.prefix + timing;
    let start = startTimes[timing];
    if (!start)
      return;
    delete startTimes[timing];
    timings[timing] = (timings[timing] || 0) + window.performance.now() - start;
  };

  Trace.count = counter => {
    if (depth < 0 && current) {
      counter = current.prefix + counter;
      counters[counter] = (counters[counter] || 0) + 1;
    }
  };

  Trace.print = () => current && _print(current.prefix);

  Trace.reset = prefix => {
    prefix = prefix || '';
    _reset(timings, prefix);
    _reset(counters, prefix);
    _reset(startTimes, prefix);
    _reset(groupCounters, prefix);
  };

  Trace.endGroup = (name, reportCount) => {
    if (--depth >= 0)
      return;

    if (!current || current.name !== name)
      return;

    let start = current.start;
    current = stack.pop();

    name = (current ? current.prefix : '') + name;
    timings[name] = (timings[name] || 0) + window.performance.now() - start;
    groupCounters[name] = (groupCounters[name] || 0) + 1;

    if (!reportCount)
      return;

    let reported = (reports[name] || 0) + 1;
    if (reported < reportCount) {
      reports[name] = reported;
      return;
    }

    reports[name] = 0;
    _print(name);
    Trace.reset(name);
  };
};
