var path = require('path');
var nconf = require('nconf');

var config_path = process.env.OHE_CONFIG_PATH || path.join(__dirname, '/config.json');

nconf.argv().env('__').file({file: config_path});

var express = require('express');
var app = express();
var server = require('http').createServer(app);
var redisurl = require('./ohe/redisurl');
var RedisStore = require('connect-redis')(express);
var LightPoll = require('./ohe/lightpoll').LightPoll;
var adnstream = require('./ohe/adnstream');
var auth = require('./ohe/auth');
var adnproxy = require('./ohe/adnproxy');
var routes = require('./routes');
var _ = require('underscore');

var multiprocess = nconf.get('deploy:multiprocess');
var connect_to_stream = nconf.get('deploy:master') || !multiprocess;
var on_heroku = nconf.get('deploy:heroku');

if (on_heroku) {
    nconf.set('sessions:redis_url', process.env.REDISTOGO_URL);
    nconf.set('deploy:port', process.env.PORT);
}

var session_secret = nconf.get('sessions:secret');

var get_rcon = function () {
    return redisurl.connect(nconf.get('sessions:redis_url'));
}

var session_store = new RedisStore({
    client: get_rcon(),
    ttl: 86400
});

var lightpoll = new LightPoll({
    redis_client: get_rcon(),
    pub_client: get_rcon(),
    sub_client: get_rcon()
});

var stream_router = require('./ohe/streamrouter').create_router(app, lightpoll);

app.configure(function () {
    app.set('views', __dirname + '/views');
    app.set('view engine', 'ejs');
});

var cookieParser = express.cookieParser(session_secret);

var secure = true;

app.configure('development', function () {
    app.use(express.logger('dev'));
    secure = false;
});

app.configure('production', function () {
    app.use(express.logger());
});

app.configure(function () {
    app.use(auth.ssl_middleware());
});

app.configure('production', function () {
    app.use(auth.ssl_redirect_middleware());
});

app.configure(function () {
    app.use(express.favicon());
    app.use(express.methodOverride());
    app.use(express.query());
    app.use(cookieParser);
    app.use(express.session({
        key: nconf.get('sessions:cookie_name') || 'connect.sid',
        store: session_store,
        secret: session_secret,
        proxy: true,
        cookie: {
            path:'/',
            httpOnly: true,
            secure: secure,
            maxAge: 86400000,
            domain: nconf.get('sessions:domain'),
        }
    }));
    app.use(auth.auth_middleware());
    app.use(express.csrf());
    app.use(adnproxy.middleware());
    app.use(express.bodyParser());
    app.use("/static", express.static(__dirname + '/static'));
    app.use(app.router);
    app.use(express.errorHandler());
});

// Only connect to the actual stream if this is the master process
if (connect_to_stream) {
    auth.get_app_token(function (token) {
        stream_router.stream(token);
    });
}

app.get('/', routes.index);
app.get('/channel/:channel_id', routes.index);
app.get('/return', routes.oauth_return);
app.get('/logout', routes.logout);
app.get('/healthcheck', routes.healthcheck);
lightpoll.enable(app);

server.listen(nconf.get('deploy:port') || 8666);

// Stash these for debugging purposes.
exports.app = app;
exports.server = server;
exports.nconf = nconf;
exports.lightpoll = lightpoll;
