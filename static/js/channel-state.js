/*globals angular */

(function () {
    angular.module('channelState', ['channels', 'messages', 'users', 'socket', 'utils'])
    .factory('channelState', function ($http, $rootScope, $q, Socket, User, Channel, Message, utils) {
        var channel_cache = {};
        var channel_list = [];
        var channels_queried = false;
        var channel_min_id;

        var query_subscribers = function (channel) {
            if (channel._subscribers_loaded) {
                var result = $q.defer();
                result.resolve(channel.subscribers);
                return result.promise;
            }

            return $http.get('/adn-proxy/stream/0/channels/' + channel.id + '/subscribers').then(function (response) {
                var subscribers = [];

                _.map(response.data.data, function (user) {
                    if ($rootScope.user_id !== user.id || response.data.data.length === 1) {
                        subscribers.push(new User(user));
                    }
                });

                channel.subscribers = subscribers;
                channel._subscribers_loaded = true;

                return channel.subscribers;
            });
        };

        var query_messages = function (channel, recent_only) {
            var params = {
                count: recent_only ? 1 : 200
            };

            return $http({
                method: 'GET',
                url: '/adn-proxy/stream/0/channels/' + channel.id + '/messages',
                params: params
            }).then(function (response) {
                if (response.data.meta.marker) {
                    channel.marker = response.data.meta.marker;
                }

                var messages = [];

                angular.forEach(response.data.data, function (d) {
                    messages.unshift(new Message(d));
                });

                channel.recent_message = _.last(messages);
                channel._recent_message_loaded = true;

                if (!recent_only) {
                    channel.messages = messages;
                }
            });
        };

        var get_recent_message = function (channel) {
            if (channel._recent_message_loaded) {
                var result = $q.defer();
                result.resolve(channel.recent_message);
                return result.promise;
            } else {
                return query_messages(channel, true);
            }
        };

        var get_channel = function (channel_id) {
            var promise;

            if (channel_cache[channel_id]) {
                var defer = $q.defer();
                defer.resolve(channel_cache[channel_id]);
                promise = defer.promise;
            } else {
                promise = $http.get('/adn-proxy/stream/0/channels/' + channel_id).then(function (response) {
                    var channel = new Channel(response.data.data);
                    channel_cache[channel.id] = channel;
                    channel_list = _.values(channel_cache);

                    return channel;
                });
            }

            return promise.then(function (channel) {
                var defer = $q.defer();

                var deferreds = [query_subscribers(channel), query_messages(channel)];

                $q.all(deferreds).then(function () {
                    defer.resolve(channel);
                });

                return defer.promise;
            });
        };

        var query_channels = function (num_to_fetch, fetch_older) {
            num_to_fetch = num_to_fetch || 0;
            if (channels_queried && !fetch_older) {
                var defer = $q.defer();
                defer.resolve(channel_list);
                return defer.promise;
            }

            var params = {
                count: num_to_fetch
            };
            if (channel_min_id) {
                params.before_id = channel_min_id;
            }
            var fetched_channels = [];
            return $http({
                method: 'GET',
                url: '/adn-proxy/stream/0/channels',
                params: params
            }).then(function (response) {
                channel_min_id = response.data.meta.min_id;
                var deferreds = [];

                angular.forEach(response.data.data, function (value) {
                    var channel = new Channel(value);
                    if (channel.type === 'net.app.core.pm') {
                        channel_cache[channel.id] = channel;
                        fetched_channels.push(channel);
                        deferreds.push(query_subscribers(channel));
                        deferreds.push(get_recent_message(channel));
                    }
                });

                var defer = $q.defer();

                channels_queried = true;
                channel_list = _.values(channel_cache);

                $q.all(deferreds).then(function () {
                    if (fetch_older) {
                        defer.resolve(fetched_channels);
                    } else {
                        defer.resolve(channel_list);
                    }
                });

                return defer.promise;
            });
        };

        var update_marker = function (channel, message) {
            // don't push the marker backwards
            var message_id = utils.comparable_id(message);
            var channel_marker_id = channel.marker && utils.comparable_id(channel.marker);
            var should_update = channel_marker_id &&  message_id > channel_marker_id ||
                !channel_marker_id && message_id;
            if (should_update) {
                $http({
                    method: 'POST',
                    url: '/adn-proxy/stream/0/posts/marker',
                    data: {
                        'name': channel.marker.name,
                        'id': message.id
                    }
                }).then(function (response) {
                    channel.marker = response.data.data;
                });
            }
        };


        var display_notification = function (msg) {
            if ($rootScope.user_id !== msg.user.id) {
                if (window.webkitNotifications && window.webkitNotifications.checkPermission() === 0) {
                    var n = window.webkitNotifications.createNotification(msg.user.avatar_image.url, msg.user.username, msg.text);
                    n.ondisplay = function () {
                        setTimeout(function () {
                            n.cancel();
                        }, 4000);
                    };
                    n.onclick = function () {
                        n.close();
                    };
                    n.show();
                }
            }
        };

        $rootScope.$on('stream_push', function (event, obj) {
            var channel;
            if (obj.meta.type === 'channel') {
                channel = channel_cache[obj.meta.id];
                if (channel) {
                    angular.extend(channel, obj.data);
                }
            }

            if (obj.meta.type === 'message') {
                channel = channel_cache[obj.data.channel_id];
                if (channel) {
                    var msg = new Message(obj.data);
                    if (!channel.recent_message) {
                        channel.recent_message = msg;
                        channel._recent_message_loaded = true;
                    } else if (utils.comparable_id(channel.recent_message) < utils.comparable_id(msg)) {
                        channel.recent_message = msg;
                    }

                    if (channel.marker) {
                        channel.has_unread = utils.comparable_id(channel.recent_message) > utils.comparable_id(channel.marker);
                    } else {
                        channel.has_unread = true;
                    }

                    if (!channel.messages || utils.comparable_id(_.last(channel.messages)) < utils.comparable_id(msg)) {
                        channel.messages.push(msg);
                        display_notification(msg);
                    }
                }
            }

            // only update our own markers
            if (obj.meta.type === 'stream_marker' && obj.meta.user_id === $rootScope.user_id) {
                channel = channel_cache[obj.meta.channel_id];

                if (channel) {
                    channel.marker = obj.data.marker;

                    if (channel.recent_message) {
                        channel.has_unread = utils.comparable_id(channel.recent_message) > utils.comparable_id(channel.marker);
                    } // what if we don't have a recent message?
                }
            }
        });


        return {
            'get_channel': get_channel,
            'query_channels': query_channels,
            'update_marker': update_marker
        };
    });
})();
