/*globals angular */

(function () {
    angular.module('channels', ['messages', 'users', 'ui', 'channelState', 'utils']).config(function ($routeProvider) {
        $routeProvider.when('/', {
            controller: 'ChannelListCtrl',
            templateUrl: '/static/templates/channel-list.html',
            selectedNav: 'inbox'
        }).when('/channel/:channel_id', {
            template: '<channel-detail></channel-detail>'
        });
    }).directive('channelDetail', function ($timeout) {
        return {
            restrict: 'E',
            controller: 'ChannelDetailCtrl',
            templateUrl: '/static/templates/channel-detail.html'
        };
    }).factory('Channel', function ($q, $rootScope, $http, User, Message) {
        var Channel = function (data) {
            if (data) {
                angular.extend(this, data);
                this.creator = new User(data.creator);
            }

            this.subscribers = [];
            this._subscribers_loaded = false;
            this.messages = [];
            this.recent_message = undefined;
            this._recent_message_loaded = false;
        };

        Channel.prototype.detail_url = function () {
            return '/channel/' + this.id;
        };

        Channel.prototype.get_subscribers = function (include_viewer) {
            var subscribers;
            if (include_viewer) {
                subscribers = this.subscribers;
            } else {
                subscribers = _.filter(this.subscribers, function (sub) {
                    return sub.id !== $rootScope.user_id;
                });
            }
            return _.pluck(subscribers, 'name');
        };

        return Channel;
    }).controller('ChannelListCtrl', function ($scope, $location, Channel, Message, channelState, utils) {
        $scope.has_more_channels = true;
        $scope.num_to_fetch = 10;

        channelState.query_channels($scope.num_to_fetch, false).then(function () {
            // need to refactor this document title stuff so that it's not repeated
            var original_title = document.title;
            var new_title = "New Message";
            var toggle_title = function () {
                if (document.title === original_title) {
                    document.title = new_title;
                } else {
                    document.title = original_title;
                }
            };
            var interval;
            var one;
            $scope.$watch('channel_list', function (newVal, oldVal) {
                if (newVal !== oldVal) {
                    utils.title_bar_notification();
                }
            }, true);
        });

        $scope.selectedUsers = [];
        $scope.message = "";

        $scope.createUser = function () {
            Message.auto_create(_.pluck($scope.selectedUsers, 'id'), $scope.message).then(function (channel_id) {
                if (channel_id) {
                    $location.path('/channel/' + channel_id);
                }
            });
        };

        $scope.loadOlderChannels = function () {
            channelState.query_channels($scope.num_to_fetch, true).then(function (channels) {
                if (!channels.length) {
                    $scope.has_more_channels = false;
                }
            });
        };

    }).controller('ChannelDetailCtrl', function ($scope, $element, $timeout, channelState, $routeParams) {
        channelState.get_channel($routeParams.channel_id).then(function (channel) {
            $scope.channel = channel;
            // messages are also loaded at this point
            $scope.$broadcast('channel_loaded');
        });
    });
})();
