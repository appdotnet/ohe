
var auth = require('../ohe/auth');

exports.index = function (req, res) {
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
    res.redirect('/');
};
