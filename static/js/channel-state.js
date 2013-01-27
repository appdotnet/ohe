/*globals angular */

(function () {
    angular.module('channelState', ['channels', 'messages', 'users', 'socket', 'utils'])
    .factory('channelState', function ($http, $rootScope, $q, Socket, User, Channel, Message, utils) {
        var channel_cache = {};
        var channels_queried = false;
        var channel_min_id;

        var query_messages = function (channel) {
            // TODO: enable this to backfill
            var params = {
                count: $rootScope.message_fetch_size,
                include_deleted: 0
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

                channel.messages = messages;
            });
        };

        var get_channel = function (channel_id, fetch_messages) {
            var promise;

            if (channel_cache[channel_id]) {
                var channel = channel_cache[channel_id];

                if (channel.messages && channel.messages.length) {
                    fetch_messages = false;
                }

                var defer = $q.defer();
                defer.resolve(channel);
                promise = defer.promise;
            } else {
                promise = $http.get('/adn-proxy/stream/0/channels/' + channel_id).then(function (response) {
                    var channel = channel_cache[channel_id];

                    if (channel) {
                        channel.update(response.data.data);
                    } else {
                        channel = new Channel(response.data.data);
                        channel_cache[channel.id] = channel;
                    }

                    $rootScope.channel_list = _.values(channel_cache);

                    return channel;
                });
            }

            if (fetch_messages) {
                return promise.then(function (channel) {
                    return query_messages(channel).then(function () {
                        return channel;
                    });
                });
            } else {
                return promise;
            }
        };

        var query_channels = function (num_to_fetch, fetch_older) {
            num_to_fetch = num_to_fetch || 0;
            if (channels_queried && !fetch_older) {
                var defer = $q.defer();
                defer.resolve($rootScope.channel_list);
                return defer.promise;
            }

            var params = {
                count: num_to_fetch,
                include_recent_message: 1,
                channel_types: 'net.app.core.pm'
            };

            if (channel_min_id) {
                params.before_id = channel_min_id;
            }

            return $http({
                method: 'GET',
                url: '/adn-proxy/stream/0/channels',
                params: params
            }).then(function (response) {
                channel_min_id = response.data.meta.min_id;
                var fetched_channels = [];

                angular.forEach(response.data.data, function (value) {
                    var channel = new Channel(value, true);
                    channel_cache[channel.id] = channel;
                    fetched_channels.push(channel);
                });

                User.fetch_pending();

                channels_queried = true;

                $rootScope.channel_list = _.values(channel_cache);

                return fetched_channels;
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
            if ($rootScope.user_id !== msg.user.id && window.webkitNotifications) {
                var permission = window.webkitNotifications.checkPermission();
                if (permission === 0) {
                    // notifications are enabled
                    var n = window.webkitNotifications.createNotification(msg.user.avatar_image.url, msg.user.username, msg.text);
                    n.ondisplay = function () {
                        setTimeout(function () {
                            n.cancel();
                        }, 5000);
                    };
                    n.onclick = function () {
                        window.focus();
                        n.cancel();
                    };
                    $(window).unload(function () {
                        n.cancel();
                    });
                    n.show();
                }
            }
        };

        $rootScope.$on('stream_push', function (event, obj) {
            var channel;
            if (obj.meta.type === 'channel') {
                channel = channel_cache[obj.meta.id];
                if (channel) {
                    channel.update(obj.data);
                } else {
                    // Stash the non-personalized channel object.
                    // This will cause further channel updates not to go back to
                    // the wire and run updates.
                    channel_cache[obj.meta.id] = new Channel(channel);
                    $rootScope.channel_list = _.values(channel_cache);

                    // If we haven't seen this channel, go fetch it.
                    get_channel(obj.meta.id, false);
                }
            }

            if (obj.meta.type === 'message') {
                channel = channel_cache[obj.data.channel_id];
                if (channel) {
                    var msg = new Message(obj.data);
                    if (!channel.recent_message || utils.comparable_id(channel.recent_message) < utils.comparable_id(msg)) {
                        channel.recent_message = msg;
                    }

                    if (channel.marker) {
                        channel.has_unread = utils.comparable_id(channel.recent_message) > utils.comparable_id(channel.marker);
                    } else {
                        channel.has_unread = true;
                    }

                    if (!channel.messages || utils.comparable_id(_.last(channel.messages)) < utils.comparable_id(msg)) {
                        if (channel.messages && channel.messages.length) {
                            channel.messages.push(msg);
                        }
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
                    } else {
                        channel.has_unread = false;
                    }
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
