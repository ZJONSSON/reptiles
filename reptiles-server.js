var clues = require('clues');

function jsonReplacer(key, value) {
  if (value && typeof value.solve === 'function') {
    var facts = [],d;
    for (d in value.facts) facts.push(d);
    return {'clues':true,logic:Object.keys(value.logic),facts:facts};
  }
  if (typeof value === 'function')
    return '[Function]';
  return value;
}

module.exports = function(api,options) {
  api = api || {};
  options = options || {};
  
  function stringifyError(e) {
    var message = {
      message : (!options.debug && e.stack) ? 'Internal Error' : e.message,
      ref : e.ref,
      fullref : e.fullref,
      error : true
    };

    if (options.debug) {
      message.stack = e.stack;
      message.caller = e.caller;
    }

    return message;
  }

  function noop() {};

  return function(select,options) {
    options = options || {};
    if (typeof(select) === 'string')
      select = select.split(',');

    return function (req,res) {
      var _res = (!options.quiet) ? res : {set: noop, write: noop, flush: noop},
          pretty = req.query.pretty && 2,
          first = '{                                     \t\n\n';
      req.body = req.body || {};
      _res.set('Transfer-Encoding','chunked');
      _res.set('Content-Type', 'application/json; charset=UTF-8');
      _res.set('Cache-Control', 'no-cache, no-store, max-age=0');
      
      if (typeof(res.flush) == 'function') _res.flush();

      Object.keys(req.query || {})
        .forEach(function(key) {
          req.body[key] = req.query[key];
        });

      Object.keys(req.params || {})
        .forEach(function(key) {
          req.body[key] = req.params[key];
        });
      
      if (options.safe) {
        Object.keys(req.body).forEach(function(key) {
          if (api[key]) delete req.body[key];
        });
      }

      var c = clues(api,req.body);

      var data = (select || req.param("fn").split(','))
        .map(function(ref) {
          return c.solve(ref,{res:res,req:req},'__user__')
            .catch(stringifyError)
            .then(function(d) {
              if (d === undefined) d = null;
              var txt = {};
              txt[ref] = d;
              txt = first+JSON.stringify(txt,jsonReplacer,pretty);
              first = '';
              _res.write(txt.slice(1,txt.length-1)+',\t\n');
              if (typeof(res.flush) == 'function') _res.flush();
            });
        });

      req.on('close',function() {
        data.forEach(function(d) {
          d.cancel();
        });
      });

      return clues.prototype.Promise.all(data)
        .then(function() {
          _res.write('"__end__" : true\t\n}');
          res.end();
        });
    };
  };
};