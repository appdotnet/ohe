
var auth = require('../ohe/auth');
var nconf = require('nconf');
var crypto = require('crypto');
var request = require('request');
var _ = require('underscore');

var oauth_url_base = nconf.get('adn:oauth_url_base') || 'https://account.app.net';

exports.index = function (req, res) {
    if (nconf.get('adn:autologin') && !req.adn_user().is_authenticated()) {
        res.redirect(auth.get_authenticate_url(req));
    }

    res.render('index', {
        '_csrf': req.session._csrf,
        'is_authenticated': req.adn_user().is_authenticated(),
        'user': req.adn_user(),
        'auth_url': auth.get_authenticate_url(req),
        'alpha_url_base': nconf.get('adn:alpha_url_base'),
        'nconf': nconf,
        'env': req.app.settings.env
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

exports.logout_and_login = function (req, res) {
    auth.logout(req, function () {
        res.redirect(auth.get_authenticate_url(req));
    });
}

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

exports.file_url = function (req, res) {
    var channel_id = req.query.channel_id;
    var message_id = req.query.message_id;
    var file_id = req.query.file_id;
    var annotation_index = req.query.annotation_index;
    var api_base_url = nconf.get('adn:api_url_base') || 'https://alpha-api.app.net';

    var endpoint_url = api_base_url + '/stream/0/channels/' + channel_id + '/messages/' + message_id;


    var get_auth_headers = function(req) {
        var user = req.adn_user();
        if (!user.is_authenticated()) {
            return 403;
        }

        var headers = {};
        headers['X-ADN-Proxied'] = '1';
        headers.host = nconf.get('adn:api_host_override') || api_base_url.hostname;
        headers.authorization = 'Bearer ' + user.access_token;
        return headers;
    };

    var headers = get_auth_headers(req);
    if (headers === 403) {
        return;
    }
    request.get({
        url: endpoint_url,
        qs: {
            include_annotations: 1
        },
        headers: headers
    }, function (e, r, body) {
        if (!e && r.statusCode === 200) {
            var obj = JSON.parse(body);
            if (obj.data) {
                if (file_id) {
                    _.each(obj.data.annotations, function (annotation) {
                        if (annotation.type === 'net.app.core.attachments') {
                            var file_list = annotation.value['net.app.core.file_list'];
                            _.each(file_list, function (file) {
                                if (file.file_id === file_id) {
                                    return res.redirect(file.url);
                                }
                            });
                        }
                    });
                } else if (annotation_index) {
                    return res.redirect(obj.data.annotations[annotation_index].value.url);
                }
            }
            return res.send('File not found.');
        } else {
            console.log('Error in file-url getting /message', e, 'status', r.statusCode, 'body', body);
        }
    });
};