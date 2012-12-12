var url = require('url');
var redis = require('redis');

module.exports.connect = function(redis_url) {
  var parsed_url  = url.parse(redis_url);
  var rcon = redis.createClient(parsed_url.port, parsed_url.hostname);

  if (parsed_url.auth) {
    var parsed_auth = (parsed_url.auth || '').split(':');

    if (parsed_auth[1]) {
      rcon.auth(parsed_auth[1], function(err) {
        if (err) throw err;
      });
    }

    if (parsed_auth[0]) {
      rcon.select(parsed_auth[0]);
    }
  } else if (parsed_url.path && parsed_url.path.length > 1) {
    rcon.select(parsed_url.path.substring(1));
  }

  return rcon;
};
