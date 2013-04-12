/*globals angular */

(function () {
    angular.module('channels', ['messages', 'users', 'ui', 'channelState', 'utils']).config(['$routeProvider', function ($routeProvider) {
        $routeProvider.when('/', {
            controller: 'ChannelListCtrl',
            templateUrl: 'channel-list.html',
            selectedNav: 'inbox'
        }).when('/muted', {
            controller: 'ChannelListCtrl',
            templateUrl: 'channel-list.html',
            selectedNav: 'muted'
        }).when('/new-message', {
            controller: 'NewMessageCtrl',
            templateUrl: 'new-message.html'
        }).when('/channel/:channel_id', {
            template: '<channel-detail></channel-detail>'
        });
    }]).directive('channelDetail', [function () {
        return {
            restrict: 'E',
            controller: 'ChannelDetailCtrl',
            templateUrl: 'channel-detail.html'
        };
    }]).factory('Channel', ['$q', '$rootScope', '$http', 'User', 'Message', function ($q, $rootScope, $http, User, Message) {
        var Channel = function (data, batch) {
            if (data) {
                this.update(data, batch);
            }

            this.messages = [];
        };

        Channel.prototype.update = function (data, batch) {
            angular.extend(this, data);
            this.owner = User.update(data.owner);

            if (data.recent_message) {
                this.recent_message = new Message(data.recent_message);
            }

            this.users = _.values(User.bulk_get(this.get_user_ids(), !batch));
        };

        Channel.prototype.detail_url = function () {
            return '/channel/' + this.id;
        };

        Channel.prototype.get_visible_user = function () {
            if (this.recent_message && this.recent_message.user &&
                this.recent_message.user.id !== $rootScope.user_id) {
                return this.recent_message.user;
            }

            return _.first(this.users);
        };

        Channel.prototype.get_users = function (include_viewer) {
            var users;
            if (include_viewer) {
                users = this.users;
            } else {
                users = _.reject(this.users, function (sub) {
                    return sub.id === $rootScope.user_id;
                });
            }

            // if recent_message is supplied, have that user name at the beginning of the list
            var recent_message = this.recent_message;
            if (recent_message && recent_message.user &&
                recent_message.user.id !== $rootScope.user_id) {
                users = _.reject(users, function (sub) {
                    return sub.id === recent_message.user.id;
                });
                users.unshift(recent_message.user);
            }

            return users;
        };

        Channel.prototype.get_user_ids = function () {
            if (this.owner) {
                return _.union([this.owner.id], this.writers.user_ids);
            } else {
                return this.writers.user_ids;
            }
        };

        return Channel;
    }]).controller('ChannelListCtrl', ['$scope', '$rootScope', '$location', 'Channel', 'Message', 'channelState', 'utils', function ($scope, $rootScope, $location, Channel, Message, channelState, utils) {
        $scope.has_more_channels = true;
        $scope.channel_fetch_size = 10;

        var watch_notifications = function () {
            $scope.$watch('channel_list', function (newVal, oldVal) {
                if (newVal !== oldVal) {
                    utils.title_bar_notification();
                }
            }, true);
        };
        if ($rootScope.selectedNav === 'muted') {
            channelState.fetch_muted_channels();
        } else {
            channelState.query_channels($scope.channel_fetch_size, false).then(function () {
                watch_notifications();
            });
        }

        $scope.selectedUsers = [];
        $scope.message = new Message();

        $scope.loadOlderChannels = function () {
            channelState.query_channels($scope.channel_fetch_size, true).then(function (channels) {
                if (channels.length < $scope.channel_fetch_size) {
                    $scope.has_more_channels = false;
                }
            });
        };
    }]).controller('ChannelDetailCtrl', ['$scope', '$element', '$timeout', 'channelState', '$routeParams', '$location', function ($scope, $element, $timeout, channelState, $routeParams, $location) {
        channelState.get_channel($routeParams.channel_id, true).then(function (channel) {
            $scope.channel = channel;
        });

        $scope.muteChannel = function () {
            channelState.mute_channel($scope.channel.id).then(function () {
                $location.path('/');
            });
        };

        $scope.unmuteChannel = function () {
            var channel_id = $scope.channel.id;
            channelState.unmute_channel(channel_id).then(function () {
                channelState.get_channel(channel_id, false);
                $location.path('/');
            });
        };

        $scope.getRoster = function () {
            if ($scope.channel) {
                return $scope.channel.get_users(true);
            }
        };
    }]).controller('NewMessageCtrl', ['User', '$rootScope', '$scope', function (User, $rootScope, $scope) {
        $scope.getRoster = function () {
            return $scope.selectedUsers;
        };
    }]);
})();
