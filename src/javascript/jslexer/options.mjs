// A second optional argument can be given to further configure
// the parser process. These options are recognized:

export const defaultOptions = {
  // `ecmaVersion` indicates the ECMAScript version to parse. Must
  // be either 3, 5, 6 (2015), 7 (2016), or 8 (2017). This influences support
  // for strict mode, the set of reserved words, and support for
  // new syntax features. The default is 7.
  ecmaVersion: 7,
  // `sourceType` indicates the mode the code should be parsed in.
  // Can be either `"script"` or `"module"`. This influences global
  // strict mode and parsing of `import` and `export` declarations.
  sourceType: "script",
  // When enabled, hashbang directive in the beginning of file
  // is allowed and treated as a line comment.
  allowHashBang: false,
}

// Interpret and default an options object

export function getOptions(opts) {
  let options = {}

  for (let opt in defaultOptions)
    options[opt] = opts && Object.prototype.hasOwnProperty.call(opts, opt) ? opts[opt] : defaultOptions[opt]

  if (options.ecmaVersion >= 2015)
    options.ecmaVersion -= 2009
  return options
}
