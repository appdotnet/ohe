
var httpProxy = require('http-proxy');
var url = require('url');
var nconf = require('nconf');

var auth = require('../ohe/auth');

var api_base_url = url.parse(nconf.get('adn:api_url_base') || 'https://alpha-api.app.net');
// allow this to be overridden internally
var api_hostname = nconf.get('adn:api_host_override') || api_base_url.hostname;

var proxy = new httpProxy.RoutingProxy({
    target: {
        https: api_base_url.protocol === 'https:'
    }
});

exports.middleware = function () {
    return function (req, res, next) {
        var m = req.url.match('/adn-proxy(/.*)');
        if (m) {
            var user = req.adn_user();
            if (!user.is_authenticated()) {
                res.send(403, {'error': 'Authentication required'});
                return;
            }

            // fixups
            // turn off JSONP/CORS
            req.headers['X-ADN-Proxied'] = '1';

            req.headers.host = api_hostname;
            req.headers.authorization = 'Bearer ' + user.access_token;
            req.url = m[1];

            proxy.proxyRequest(req, res, {
                'host': api_base_url.hostname,
                'port': api_base_url.port || (proxy.target.https && 443) || 80
            });
        } else {
            next();
        }
    };
};
