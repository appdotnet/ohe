
var auth = require('../ohe/auth');
var nconf = require('nconf');
var crypto = require('crypto');

var oauth_url_base = nconf.get('adn:oauth_url_base') || 'https://account.app.net';

exports.index = function (req, res) {
    if (nconf.get('adn:autologin') && !req.adn_user().is_authenticated()) {
        res.redirect(auth.get_authenticate_url(req));
    }

    res.render('index', {
        '_csrf': req.session._csrf,
        'is_authenticated': req.adn_user().is_authenticated(),
        'user': req.adn_user(),
        'auth_url': auth.get_authenticate_url(req)
    });
};

exports.oauth_return = function (req, res) {
    auth.login_from_code(req, req.query.code, function () {
        res.redirect('/');
    });
};

exports.logout = function (req, res) {
    auth.logout(req, function () {
        if (nconf.get('adn:autologin')) {
            res.redirect(oauth_url_base + '/logout');
        } else {
            res.redirect('/');
        }
    });
};

exports.healthcheck = function (req, res) {
    res.send('healthcheck=OK');
};

exports.camofy_url = function (req, res) {
    // see https://github.com/atmos/camo
    var camo_config = nconf.get('camo');
    var camo_host = camo_config.host;
    var camo_key = camo_config.key;
    var url = req.query.url;

    if (!(camo_host && camo_key) || url.indexOf('https:') === 0) {
        return res.send(url);
    }

    var hash = crypto.createHmac('sha1', camo_key).update(url).digest('hex');
    var url_hex = new Buffer(url).toString('hex');
    var secure_url = 'https://' + camo_host + '/' + hash + '/' + url_hex;

    return res.send(secure_url);
};