/*globals angular */

(function () {
    angular.module('channelState', ['channels', 'messages', 'users', 'socket', 'utils'])
    .factory('channelState', ['$http', '$rootScope', '$q', '$routeParams', 'Socket', 'User', 'Channel', 'Message', 'utils', function ($http, $rootScope, $q, $routeParams, Socket, User, Channel, Message, utils) {
        var channel_cache = {};
        var channels_queried = false;

        var query_messages = function (channel) {
            // TODO: enable this to backfill
            var params = {
                count: $rootScope.message_fetch_size,
                include_deleted: 0,
                include_annotations: 1
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

        var on_channel = function (data, fetch) {
            var channel;
            // don't add muted channels to the channel cache
            if (data.you_muted) {
                channel = new Channel(data);
            } else {
                channel = channel_cache[data.id];

                if (channel) {
                    channel.update(data);
                } else {
                    channel = channel_cache[data.id] = new Channel(data);
                    $rootScope.channel_list = _.values(channel_cache);
                }
            }

            if (fetch) {
                get_channel(data.id, false);
            }

            return channel;
        };

        var channel_unsubscribe = function (channel_id) {
            delete channel_cache[channel_id];
            $rootScope.channel_list = _.values(channel_cache);
        };

        var mute_channel = function (channel_id) {
            return $http({
                method: 'POST',
                url: '/adn-proxy/stream/0/channels/' + channel_id + '/mute'
            }).then(function () {
                channel_unsubscribe(channel_id);
                // clear it from the channel cache, if it was there
                delete channel_cache[channel_id];
                $rootScope.channel_list = _.values(channel_cache);
            });
        };

        var unmute_channel = function (channel_id) {
            var d1 = $http({
                method: 'DELETE',
                url: '/adn-proxy/stream/0/channels/' + channel_id + '/mute'
            });
            var d2 = $http({
                method: 'POST',
                url: '/adn-proxy/stream/0/channels/' + channel_id + '/subscribe'
            });

            return $q.all(d1, d2);
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
                    return on_channel(response.data.data);
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

        var query_channels = function () {
            var url = '/adn-proxy/stream/0/channels';
            var params = {
                count: 200,
                include_recent_message: 1,
                channel_types: 'net.app.core.pm'
            };

            var ajax_call = function (before_id) {
                if (before_id) {
                    params.before_id = before_id;
                } else {
                    delete params.before_id;
                }
                return $http({
                    method: 'GET',
                    url: url,
                    params: params
                }).then(function (response) {
                    var more_channels = response.data.meta.more;
                    var min_id = response.data.meta.min_id;
                    var fetched_channels = [];
                    angular.forEach(response.data.data, function (value) {
                        var channel = new Channel(value, true);
                        channel_cache[channel.id] = channel;
                        fetched_channels.push(channel);
                    });
                    User.fetch_pending();
                    channels_queried = true;
                    if (more_channels) {
                        ajax_call(min_id);
                    }
                    $rootScope.channel_list = _.values(channel_cache);
                    return fetched_channels;
                });
            };

            if (!channels_queried) {
                // query all channels so we know which channels the user is in and with whom
                return ajax_call();
            } else {
                var deferred = $q.defer();
                deferred.resolve();
                return deferred.promise;
            }
        };

        var fetch_muted_channels = function () {
            var url = '/adn-proxy/stream/0/users/me/channels/muted';

            var params = {
                count: 200,
                include_recent_message: 1,
                channel_types: 'net.app.core.pm'
            };
            return $http({
                method: 'GET',
                url: url,
                params: params
            }).then(function (response) {
                var fetched_channels = [];
                angular.forEach(response.data.data, function (value) {
                    var channel = new Channel(value, true);
                    fetched_channels.push(channel);
                });

                $rootScope.muted_channel_list = _.values(fetched_channels);

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
                on_channel(obj.data);
            }

            if (obj.meta.type === 'channel_subscription') {
                if (!obj.meta.is_deleted) {
                    on_channel(obj.data.channel);
                } else {
                    channel_unsubscribe(obj.data.channel.id);
                }
            }

            if (obj.meta.type === 'message') {
                channel = channel_cache[obj.data.channel_id];
                if (channel) {
                    if (obj.meta.is_deleted) {
                        channel.messages = _.reject(channel.messages, function (m) {
                            return m.id === obj.data.id;
                        });
                    } else {
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
                            if (channel.messages) {
                                // this is a hack so that you can still send messages into an empty channel (eg all messages deleted)
                                // need to fix this, channel.messages.length shouldn't be used to tell whether you're in a channel or in the main window
                                if (channel.messages.length || $routeParams.channel_id) {
                                    channel.messages.push(msg);
                                }
                            }
                            display_notification(msg);
                        }
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
            'fetch_muted_channels': fetch_muted_channels,
            'update_marker': update_marker,
            'mute_channel': mute_channel,
            'unmute_channel': unmute_channel
        };
    }]);
})();
