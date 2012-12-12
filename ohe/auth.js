
var nconf = require('nconf');
var request = require('request');
var _ = require('underscore');
var querystring = require('querystring');

var oauth_url_base = nconf.get('adn:oauth_url_base') || 'https://account.app.net';
var token_url_base = nconf.get('adn:token_url_base') || oauth_url_base;
var api_url_base = nconf.get('adn:api_url_base') || 'https://alpha-api.app.net';

// Congratulations! You've found one of the warty parts of the ADN infrastructure.
// We have to be able to rewrite internal URLs so they get routed
// to the correct services. Good times.
var api_host_override = nconf.get('adn:api_host_override');
var token_host_override = nconf.get('adn:token_host_override');

var client_id = nconf.get('adn:client_id');
var client_secret = nconf.get('adn:client_secret');
var scope = nconf.get('adn:scope');

var AnonymousUser = function () {
};

AnonymousUser.prototype.is_authenticated = function () {
    return false;
};

var AuthenticatedUser = function (user_obj) {
    var self = this;

    // copy properties from json
    _.extend(self, user_obj);
};

AuthenticatedUser.prototype.is_authenticated = function () {
    return true;
};

exports.ssl_middleware = function () {
    return function (req, res, next) {
        if (req.headers['x-forwarded-proto'] === 'https') {
            req.ssl = true;
        } else {
            req.ssl = false;
        }

        next();
    };
};

exports.ssl_redirect_middleware = function () {
    return function(req, res, next) {
        if (!req.ssl) {
            res.redirect('https://' + req.headers.host + req.url);
        } else {
            next();
        }
    };
};

exports.auth_middleware = function () {
    return function (req, res, next) {
        if (req.adn_user) { return next(); }

        req.adn_user = function () {
            if (!req._cached_adn_user) {
                var user;
                if (!req.session.user) {
                    user = new AnonymousUser();
                } else {
                    user = new AuthenticatedUser(req.session.user);
                }

                req._cached_adn_user = user;
            }

            return req._cached_adn_user;
        };

        return next();
    };
};

function get_redirect_url(req) {
    var scheme = 'http';
    if (req.headers['x-forwarded-proto'] === 'https') {
        scheme = 'https';
    }

    return scheme + '://' + req.headers.host + '/return';
}

exports.get_authenticate_url = function (req) {
    var redirect_uri = get_redirect_url(req);

    return oauth_url_base + '/oauth/authenticate?' + querystring.stringify({
        response_type: 'code',
        redirect_uri: redirect_uri,
        scope: scope,
        client_id: client_id
    });
};

exports.login_from_code = function (req, code, cb) {
    var token_url = token_url_base + '/oauth/access_token';
    var redirect_uri = get_redirect_url(req);

    var params = {
        grant_type: "authorization_code",
        client_id: client_id,
        client_secret: client_secret,
        redirect_uri: redirect_uri,
        code: code
    };

    request.post({
        url: token_url,
        headers: {
            host: token_host_override
        },
        form: params
    }, function (e, r, body) {
        if (!e && r.statusCode === 200) {
            var obj = JSON.parse(body);
            var access_token = obj.access_token;

            var me_url = api_url_base + '/stream/0/users/me?access_token=' + access_token;

            request.get({
                url: me_url,
                headers: {
                    host: api_host_override
                }
            }, function (e, r, body) {
                var obj = JSON.parse(body);
                var user = obj.data;
                user.access_token = access_token;
                req.session.user = user;
                // Force reauth
                req._cached_omo_user = undefined;

                cb();
            });
        } else {
            console.log('Error:', e, 'status', r && r.statusCode);
            cb();
        }
    });
};

exports.get_app_token = function (cb) {
    var token_url = token_url_base + '/oauth/access_token';

    var params = {
        grant_type: "client_credentials",
        client_id: client_id,
        client_secret: client_secret
    };

    request.post({
        url: token_url,
        headers: {
            host: token_host_override
        },
        form: params
    }, function (e, r, body) {
        if (!e && r.statusCode === 200) {
            var obj = JSON.parse(body);
            var access_token = obj.access_token;
            cb(access_token);
        } else {
            console.log('Error getting app access token', e, 'status', r.statusCode, 'body', body);
            cb();
        }
    });
};

exports.logout = function (req) {
    req.session.user = undefined;
    req._cached_omo_user = undefined;
};
