var nconf = require('nconf');
var request = require('request');
var _ = require('underscore');
var Q = require('q');
var ADNStream = require('./adnstream').ADNStream;

var api_url_base = nconf.get('adn:api_url_base') || 'https://alpha-api.app.net';
// There are some comments in auth.js which explain this mess
var api_host_override = nconf.get('adn:api_host_override');

var key = nconf.get('adn:stream_key') || 'pm_stream';
var filter_id = nconf.get('adn:stream_filter_id') || 545;

function StreamRouter(app, lightpoll) {
    this.app = app;
    this.lightpoll = lightpoll;
}

StreamRouter.prototype.get_or_create_stream = function (app_access_token, cb) {
    var stream_url = api_url_base + '/stream/0/streams';

    var headers = {
        authorization: 'Bearer ' + app_access_token,
        host: api_host_override
    };

    var stream_template = {
        object_types: ["message", "channel", "stream_marker", "channel_subscription"],
        type: "long_poll",
        key: key,
        filter: filter_id
    };

    var create_stream = function () {
        request.post({
            url: stream_url,
            headers: headers,
            json: stream_template
        }, function (e, r, body) {
            if (!e && r.statusCode === 200) {
                console.log('created stream id ' +  body.data.id);
                cb(body.data.endpoint);
            } else {
                console.log('Error getting creating stream', e, 'status', r.statusCode, 'body', body);
                cb();
            }
        });
    };

    request.get({
        url: stream_url,
        qs: {
            key: key
        },
        headers: headers
    }, function (e, r, body) {
        if (!e && r.statusCode === 200) {
            var obj = JSON.parse(body);
            if (obj.data.length) {
                var stream = obj.data[0];
                console.log('found stream id ' +  stream.id);
                var found_stream = _.pick(stream, _.keys(stream_template));

                if (_.isEqual(found_stream, stream_template)) {
                    cb(stream.endpoint);
                } else {
                    // delete stream so we can recreate it with correct template
                    request.del({
                        url: stream_url + '/' + stream.id,
                        headers: headers
                    }, function (e, r, body) {
                        if (!e && r.statusCode === 200){
                            create_stream();
                        } else {
                            console.log('Error deleting stream ' + stream.id);
                            cb();
                        }
                    });
                }
            } else {
                create_stream();
            }
        } else {
            console.log('Error getting stream', e, 'status', r.statusCode, 'body', body);
            cb();
        }
    });
};

StreamRouter.prototype.stream = function (token) {
    var self = this;

    var listen_to_endpoint = function (app_token, endpoint) {
        var stream = new ADNStream(endpoint);

        var channel_subs_cache = {};
        var in_flight_request_promises = {};

        stream.on('channel_subscription', function (msg) {
            channel_id = msg.data.channel.id;

            // only accept incremental updates for channels
            // we have seen and received a server response for
            if (channel_subs_cache[channel_id]) {
                if (msg.meta.deleted) {
                    channel_subs_cache[channel_id] = _.without(channel_subs_cache[channel_id], msg.meta.user_id);
                } else {
                    channel_subs_cache[channel_id].push(msg.meta.user_id);
                }
            }
        });

        var get_users_for_channel = function (channel_id) {
            if (!channel_subs_cache[channel_id]) {
                var deferred = Q.defer();
                in_flight_request_promises[channel_id] = deferred.promise;
                channel_subs_cache[channel_id] = [];

                var headers = {
                    authorization: 'Bearer ' + app_token,
                    host: api_host_override
                };

                request.get({
                    url: api_url_base + '/stream/0/channels/' + channel_id + '/subscribers/ids',
                    headers: headers
                }, function (e, r, body) {
                    if (!e && r.statusCode === 200) {
                        var ids = JSON.parse(body).data || [];
                        channel_subs_cache[channel_id] = _.uniq(channel_subs_cache[channel_id].concat(ids));
                        delete in_flight_request_promises[channel_id];
                        deferred.resolve(ids);
                    } else {
                        if (!e) {
                            console.dir(r);
                            e = 'Unexpected response code: ' + r.statusCode + ' ' + r.request.url;
                        }

                        // If there was an error, dump the cache so we go back
                        // and refresh the full list again.
                        delete channel_subs_cache[channel_id];
                        delete in_flight_request_promises[channel_id];
                        deferred.reject(new Error (e));
                    }
                });


                return deferred.promise;
            }

            return channel_subs_cache[channel_id];
        };

        var send_message_to_channel = function (msg, channel_id) {
            Q.when(get_users_for_channel(channel_id), function (user_ids) {
                _.each(user_ids, function (user_id) {
                    self.lightpoll.dispatch(user_id, msg);
                });
            }, function (error) {
                console.log('error here', error);
            });
        };

        stream.on('channel', function (msg) {
            send_message_to_channel(msg, msg.meta.id);
        });

        stream.on('stream_marker', function (msg) {
            // currently we get *all* stream markers
            if (msg.meta.channel_id) {
                send_message_to_channel(msg, msg.meta.channel_id);
            }
        });

        stream.on('message', function (msg) {
            send_message_to_channel(msg, msg.data.channel_id);
        });

        stream.on('error', function (error) {
            console.error('Stream error, reconnecting:', error);
            setTimeout(function () {
                stream.process(true);
            }, 2000);
        });

        stream.on('end', function () {
            console.error('Stream ended, reconnecting.');
            setTimeout(function () {
                stream.process(true);
            }, 2000);
        });

        stream.process(true);
    };

    self.get_or_create_stream(token, function (endpoint) {
        listen_to_endpoint(token, endpoint);
    });
};

module.exports.create_router = function (app, lightpoll) {
    return new StreamRouter(app, lightpoll);
};
