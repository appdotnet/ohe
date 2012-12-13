
var auth = require('../ohe/auth');
var nconf = require('nconf');

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
    auth.logout(req);

    if (nconf.get('adn:autologin')) {
        res.redirect(oauth_url_base + '/logout');
    } else {
        res.redirect('/');
    }
};
