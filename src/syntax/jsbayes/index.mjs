import {Parser, TokenTypes} from '../jslexer/index.mjs';
import frequenciesJSON from './freq.mjs';

function tokenName(token) {
  if (token.type.keyword)
    return 'keyword';
  if (token.type.isAssign)
    return 'assign';
  if (token.type.isLoop)
    return 'loop';
  if (token.type.binop || token.type.prefix || token.type.label === '?')
    return 'operaion';
  if ('()[]{}'.indexOf(token.type.label) !== -1)
    return 'bracket';
  if (':;,.'.indexOf(token.type.label) !== -1)
    return 'punctuation';
  return token.type.label;
}

function ngramName(token1, token2) {
  return tokenName(token1) + ' ' + tokenName(token2);
}

export class Classifier {
  constructor() {
    this._ngrams = new Map();
    this._totalNGrams = 0;;
  }

  static load() {
    let classifier = new Classifier();
    classifier._fromJSON(frequenciesJSON);
    return classifier;
  }

  _fromJSON(json) {
    this._ngrams = new Map(Object.entries(json));
    this._totalNGrams = 0;
    for (let count of this._ngrams.values())
      this._totalNGrams += count;
  }

  train(iterator) {
    let tt = new Parser({allowHashBang: true}, iterator);
    let token = tt.getToken();
    for (const newToken of tt) {
      const ngram = ngramName(token, newToken);
      let value = this._ngrams.get(ngram);
      if (!value)
        value = 1;
      else
        ++value;
      this._ngrams.set(ngram, value);
      ++this._totalNGrams;
      token = newToken;
    }
  }

  classify(iterator) {
    let tt = new Parser({allowHashBang: true}, iterator);
    let token = tt.getToken();
    let value = 0;
    for (const newToken of tt) {
      const ngram = ngramName(token, newToken);
      //console.log(ngram + ': ' + Math.log((this._ngrams.get(ngram) || 0) / this._totalNGrams, 2));
      value += Math.log((this._ngrams.get(ngram) || 0) / this._totalNGrams, 2);
      token = newToken;
    }
    if (value === 0)
      return -Infinity;
    return value;
  }

  json() {
    let json = {};
    for (const entry of this._ngrams.entries())
      json[entry[0]] = entry[1];
    return json;
  }
}
