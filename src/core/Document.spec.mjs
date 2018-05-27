import {Metrics} from './Metrics.mjs';
import {Document} from './Document.mjs';
import {Random} from './Random.mjs';

export function addTests(runner, expect) {
  const {describe, xdescribe, fdescribe} = runner;
  const {it, fit, xit} = runner;
  const {beforeAll, beforeEach, afterAll, afterEach} = runner;

  class ReplaceClient {
    constructor(document) {
      this._document = document;
      this._callback = this._onReplace.bind(this);
      this._document.addReplaceCallback(this._callback);
      this._replacements = [];
    }

    expect(replacements) {
      this._replacements = replacements;
    }

    schedule(callback) {
      this._scheduled = callback;
    }

    checkDone() {
      expect(this._replacements.length).toBe(0);
    }

    remove() {
      this._document.removeReplaceCallback(this._callback);
    }

    _onReplace(replacements) {
      expect(replacements.length).toBe(this._replacements.length);
      let last = null;
      for (let i = 0; i < replacements.length; i++) {
        let a = replacements[i];
        let b = this._replacements[i];
        expect(a.offset).toBe(b.offset);
        expect(a.operation).toBe(b.operation);
        expect(a.before.content(0, a.before.length())).toBe(b.before);
        expect(a.after.content(0, a.after.length())).toBe(b.after);
        expect(a.removed.content(0, a.removed.length())).toBe(b.removed);
        expect(a.inserted.content(0, a.inserted.length())).toBe(b.inserted);
        last = b.after;
      }
      this._replacements = [];
      if (last !== null)
        expect(this._document.content()).toBe(last);
      if (this._scheduled) {
        let callback = this._scheduled;
        this._scheduled = null;
        callback();
      }
    }
  }

  describe('Document text API', () => {
    it('Document text API manual chunks', () => {
      let chunks = ['ab\ncd', 'def', '\n', '', 'a\n\n\nbbbc', 'xy', 'za\nh', 'pp', '\n', ''];
      let content = chunks.join('');
      let document = new Document();
      Document.test.setChunks(document, chunks);
      expect(document.lineCount()).toBe(8);
      expect(document.length()).toBe(content.length);
      for (let from = 0; from <= content.length; from++) {
        for (let to = from; to <= content.length; to++)
          expect(document.content(from, to)).toBe(content.substring(from, to));
      }
    });

    it('Document text API all chunk sizes', () => {
      let random = Random(143);
      let lineCount = 200;
      let chunks = [];
      let locationQueries = [];
      let offset = 0;
      for (let i = 0; i < lineCount; i++) {
        let s = 'abcdefghijklmnopqrstuvwxyz';
        let length = 1 + (random() % (s.length - 1));
        let chunk = s.substring(0, length);
        chunks.push(chunk + '\n');
        locationQueries.push({line: i, column: 0, offset: offset});
        locationQueries.push({line: i, column: 1, offset: offset + 1});
        locationQueries.push({line: i, column: length, offset: offset + length});
        locationQueries.push({line: i, column: length, offset: offset + length, nonStrict: {column: length + 1}});
        locationQueries.push({line: i, column: length, offset: offset + length, nonStrict: {column: length + 100}});
        let column = random() % length;
        locationQueries.push({line: i, column: column, offset: offset + column});
        offset += length + 1;
      }
      let content = chunks.join('');
      locationQueries.push({line: lineCount, column: 0, offset: content.length});
      locationQueries.push({line: lineCount, column: 0, offset: content.length, nonStrict: {column: 3}});

      let contentQueries = [];
      for (let i = 0; i < 1000; i++) {
        let from = random() % content.length;
        let to = from + (random() % (content.length - from));
        contentQueries.push({from, to});
      }

      for (let chunkSize = 1; chunkSize <= 100; chunkSize++) {
        let document = new Document();
        Document.test.setContent(document, content, chunkSize);
        expect(document.lineCount()).toBe(lineCount + 1);
        expect(document.length()).toBe(content.length);
        for (let {from, to} of contentQueries)
          expect(document.content(from, to)).toBe(content.substring(from, to));
        expect(document.offsetToPosition(0)).toEqual({line: 0, column: 0});
        expect(document.offsetToPosition(content.length)).toEqual({line: lineCount, column: 0});
        expect(document.offsetToPosition(content.length + 1)).toBe(null);
        for (let {line, column, offset, nonStrict} of locationQueries) {
          if (nonStrict) {
            expect(document.positionToOffset({line, column: nonStrict.column})).toBe(offset);
          } else {
            expect(document.offsetToPosition(offset)).toEqual({line, column});
            expect(document.positionToOffset({line, column})).toBe(offset);
            expect(document.positionToOffset({line, column}, true)).toBe(offset);
          }
        }
      }
    });

    it('Document.replace all chunk sizes', () => {
      let random = Random(142);
      let lineCount = 10;
      let chunks = [];
      for (let i = 0; i < lineCount; i++) {
        let s = 'abcdefg';
        let length = 1 + (random() % (s.length - 1));
        chunks.push(s.substring(0, length) + '\n');
      }
      let content = chunks.join('');

      let editQueries = [];
      for (let i = 0; i < 20; i++) {
        let from = random() % content.length;
        let to = from + (random() % (content.length - from));
        let s = 'abcdefg\n';
        let length = 1 + (random() % (s.length - 1));
        let insertion = s.substring(0, length);
        editQueries.push({from, to, insertion});
        content = content.substring(0, from) + insertion + content.substring(to, content.length);
      }

      for (let chunkSize = 1; chunkSize <= 100; chunkSize++) {
        content = chunks.join('');
        let document = new Document();
        Document.test.setContent(document, content, chunkSize);
        for (let {from, to, insertion} of editQueries) {
          let removed = document.replace(from, to, insertion);
          expect(removed.length()).toBe(to - from);
          expect(removed.content(0, to - from)).toBe(content.substring(from, to));
          content = content.substring(0, from) + insertion + content.substring(to, content.length);
          expect(document.length()).toBe(content.length);
          for (let from = 0; from <= content.length; from++) {
            for (let to = from; to <= content.length; to++)
              expect(document.content(from, to)).toBe(content.substring(from, to));
          }
        }
      }
    });
  });

  describe('Document callbacks', () => {
    it('simple changes/operations', () => {
      let document = new Document();
      let client1 = new ReplaceClient(document);

      client1.expect([{offset: 0, before: '', after: 'abc', removed: '', inserted: 'abc', operation: 'unknown'}]);
      document.reset('abc');
      client1.checkDone();

      let client2 = new ReplaceClient(document);

      client1.expect([{offset: 1, before: 'abc', after: 'axxc', removed: 'b', inserted: 'xx', operation: 'unknown'}]);
      client2.expect([{offset: 1, before: 'abc', after: 'axxc', removed: 'b', inserted: 'xx', operation: 'unknown'}]);
      document.replace(1, 2, 'xx');
      client1.checkDone();
      client2.checkDone();

      document.beginOperation('foo');
      document.replace(1, 3, 'z');
      client1.checkDone();
      client2.checkDone();
      document.reset('p');
      client1.checkDone();
      client2.checkDone();
      client1.expect([
        {offset: 1, before: 'axxc', after: 'azc', removed: 'xx', inserted: 'z', operation: 'foo'},
        {offset: 0, before: 'azc', after: 'p', removed: 'azc', inserted: 'p', operation: 'foo'},
      ]);
      client2.expect([
        {offset: 1, before: 'axxc', after: 'azc', removed: 'xx', inserted: 'z', operation: 'foo'},
        {offset: 0, before: 'azc', after: 'p', removed: 'azc', inserted: 'p', operation: 'foo'},
      ]);
      document.endOperation('foo');
      client1.checkDone();
      client2.checkDone();

      client1.remove();
      client2.expect([{offset: 0, before: 'p', after: 'q', removed: 'p', inserted: 'q', operation: 'unknown'}]);
      document.reset('q');
      client1.checkDone();
      client2.checkDone();
    });

    it('recursive changes', () => {
      let document = new Document();
      let client1 = new ReplaceClient(document);
      let client2 = new ReplaceClient(document);

      /* 2 */ client1.expect([{offset: 0, before: '', after: 'abc', removed: '', inserted: 'abc', operation: 'unknown'}]);
      client1.schedule(() => {
        /* 3 */ client1.checkDone();
        /* 4 */ client2.checkDone();
        /* 6 */ client1.expect([{offset: 1, before: 'abc', after: 'axxc', removed: 'b', inserted: 'xx', operation: 'unknown'}]);
        /* 7 */ client2.expect([
          {offset: 0, before: '', after: 'abc', removed: '', inserted: 'abc', operation: 'unknown'},
          {offset: 1, before: 'abc', after: 'axxc', removed: 'b', inserted: 'xx', operation: 'unknown'},
        ]);
        /* 5 */ document.replace(1, 2, 'xx');
      });
      /* 1 */ document.reset('abc');
      /* 10 */ client1.checkDone();
      /* 11 */ client2.checkDone();
    });

    it('recursive operations', () => {
      let document = new Document();
      let client1 = new ReplaceClient(document);
      let client2 = new ReplaceClient(document);

      /* 3 */ client1.expect([
        {offset: 0, before: '', after: 'abc', removed: '', inserted: 'abc', operation: 'foo'},
        {offset: 0, before: 'abc', after: 'p', removed: 'abc', inserted: 'p', operation: 'foo'},
      ]);
      client1.schedule(() => {
        /* 4 */ client1.checkDone();
        /* 5 */ client2.checkDone();
        /* 8 */ client2.expect([
          {offset: 0, before: '', after: 'abc', removed: '', inserted: 'abc', operation: 'foo'},
          {offset: 0, before: 'abc', after: 'p', removed: 'abc', inserted: 'p', operation: 'foo'},
          {offset: 0, before: 'p', after: 'q', removed: 'p', inserted: 'q', operation: 'bar'},
          {offset: 0, before: 'q', after: 'r', removed: 'q', inserted: 'r', operation: 'bar'},
        ]);
        client2.schedule(() => {
          /* 9 */ client1.checkDone();
          /* 10 */ client1.expect([
            {offset: 0, before: 'p', after: 'q', removed: 'p', inserted: 'q', operation: 'bar'},
            {offset: 0, before: 'q', after: 'r', removed: 'q', inserted: 'r', operation: 'bar'},
            {offset: 0, before: 'r', after: 's', removed: 'r', inserted: 's', operation: 'unknown'},
          ]);
          /* 11 */ client2.expect([
            {offset: 0, before: 'r', after: 's', removed: 'r', inserted: 's', operation: 'unknown'},
          ]);
          document.reset('s');
        });
        document.beginOperation('bar');
        /* 6 */ document.reset('q');
        /* 7 */ document.reset('r');
        document.endOperation('bar');
      });
      document.beginOperation('foo');
      /* 1 */ document.reset('abc');
      /* 2 */ document.reset('p');
      document.endOperation('foo');
      /* 12 */ client1.checkDone();
      /* 13 */ client2.checkDone();
    });
  });
}
