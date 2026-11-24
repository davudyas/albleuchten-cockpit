/* Ersetzt auf der eigenen Website die KI-Funktion, die das Cockpit in claude.ai nutzt.
   Die Seite ruft window.claude.use('sample') auf; hier geht jede Anfrage an die
   Netlify-Funktion /api/sample, die mit dem Anthropic-API-Schlüssel des Teams antwortet.
   Ist kein Schlüssel hinterlegt, gibt use() null zurück und die Seite blendet
   Assistent und KI-Lagebericht einfach aus. */
(function () {
  if (window.claude) return;
  var EP = '/api/sample';
  var ready = null;

  function fail(code) { var e = new Error(code); e.code = code; return e; }

  function toMessages(input) {
    return typeof input === 'string' ? [{ role: 'user', content: input }] : input;
  }

  async function call(input, json, opts) {
    opts = opts || {};
    var res;
    try {
      res = await fetch(EP, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: toMessages(input), json: !!json }),
        signal: opts.signal
      });
    } catch (e) {
      throw fail(e && e.name === 'AbortError' ? 'cancelled' : 'network_error');
    }
    if (res.status === 429) throw fail('rate_limited');
    if (res.status === 503 || res.status === 404) throw fail('not_granted');
    if (!res.ok || !res.body) throw fail('failed');

    var reader = res.body.getReader(), dec = new TextDecoder(), text = '';
    try {
      for (;;) {
        var r = await reader.read();
        if (r.done) break;
        text += dec.decode(r.value, { stream: true });
        if (!json && opts.onText) { try { opts.onText({ text: text }); } catch (e) {} }
      }
    } catch (e) {
      throw fail(e && e.name === 'AbortError' ? 'cancelled' : 'failed');
    }
    text += dec.decode();
    return text;
  }

  function parseJson(text) {
    var t = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    try { return JSON.parse(t); } catch (e) {}
    var a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
    throw fail('invalid_json');
  }

  var sample = async function (input, opts) {
    return { text: await call(input, false, opts) };
  };
  sample.json = async function (input, opts) {
    return parseJson(await call(input, true, opts));
  };

  window.claude = {
    use: async function (cap) {
      if (cap !== 'sample') throw fail('not_declared');
      if (location.protocol === 'file:') return null;
      if (!ready) {
        ready = fetch(EP, { method: 'GET', cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { return !!(j && j.ok); })
          .catch(function () { return false; });
      }
      return (await ready) ? sample : null;
    }
  };
})();
