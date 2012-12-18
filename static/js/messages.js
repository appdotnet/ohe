/*globals angular */

(function () {
    angular.module('messages', []).directive('messageList', function ($timeout) {
        return {
            restrict: 'E',
            controller: 'MessageListCtrl',
            templateUrl: '/static/templates/message-list.html',
            replace: true,
            link: function (scope, element, attrs, controller) {
                var w = $(window);
                var pinned_to_bottom = true;

                // nasty javascript-based layout because bryan sucks at the CSS
                scope.messages_layout_dimensions = {};

                scope.check_dimensions = function () {
                    var dimensions = {
                        window_height: w.height(),
                        window_width: w.width(),
                        container_offset: element.offset()
                    };

                    if (!_.isEqual(scope.layout_dimensions, dimensions)) {
                        scope.layout_dimensions = dimensions;

                        // fix dimensions
                        element.height(Math.max(0, dimensions.window_height - dimensions.container_offset.top - 70));
                    }

                    scope.timeout = $timeout(scope.check_dimensions, 100);
                };

                scope.check_dimensions();

                scope.$watch('channel.messages', function (newVal, oldVal) {
                    if (newVal && newVal.length || oldVal && oldVal.length) {
                        if (pinned_to_bottom) {
                            scroll_to_bottom();
                        }
                    }
                }, true);

                var fire_update_marker = function () {
                    var el = element.find('.message-list');
                    var parent_top = el.offset().top;
                    var parent_bottom = parent_top + el.height();

                    var bottom_element;

                    // if there is no scrollbar:
                    if (el.get(0).scrollHeight > el.height()) {
                        bottom_element = el.find('.message').last();
                    } else {
                        // start from the bottom and find the first message with
                        // a visible midpoint
                        $(el.find('.message').get().reverse()).each(function () {
                            var mel = $(this);
                            var midpoint = mel.offset().top + (mel.height() / 2);
                            if (midpoint > parent_top  && midpoint < parent_bottom) {
                                bottom_element = mel;
                                // no need to keep going
                                return false;
                            }
                        });
                    }

                    if (bottom_element) {
                        var el_scope = bottom_element.scope();
                        if (el_scope && el_scope.message) {
                            scope.$emit('update_marker', el_scope.message);
                        }
                    }
                };

                fire_update_marker = _.debounce(fire_update_marker, 300);


                var scroll_to_bottom = function () {
                    var target = element.find('.message-list');
                    target.scrollTop(target[0].scrollHeight);
                    fire_update_marker();
                };

                element.find('.message-list').on('scroll.message-list', function (event) {
                    // maybe debounce/throttle this if it gets slow
                    var target = event.target;

                    if (target.offsetHeight + target.scrollTop >= target.scrollHeight) {
                        pinned_to_bottom = true;
                    } else {
                        pinned_to_bottom = false;
                    }

                    fire_update_marker();
                });
                scope.$on('submit-message', function (event) {
                    scroll_to_bottom();
                });
                // fire_update_marker on initial load also
                fire_update_marker();

                scope.$on('$destroy', function () {
                    $timeout.cancel(scope.timeout);
                    element.find('.message-list').off('scroll.message-list');
                });
            }
        };
    }).directive('messageForm', function () {
        return {
            restrict: 'E',
            controller: 'MessageFormCtrl',
            templateUrl: '/static/templates/message-form.html',
            replace: true
        };
    }).directive('roster', function ($timeout) {
        return {
            restrict: 'E',
            templateUrl: '/static/templates/roster.html',
            replace: true,
            link: function (scope, element) {
                var w = $(window);
                // nasty copy + paste.. need to refactor
                scope.roster_layout_dimensions = {};

                scope.roster_check_dimensions = function () {
                    var dimensions = {
                        window_height: w.height(),
                        window_width: w.width(),
                        container_offset: element.offset()
                    };

                    if (!_.isEqual(scope.roster_layout_dimensions, dimensions)) {
                        scope.roster_layout_dimensions = dimensions;

                        // fix dimensions
                        element.height(Math.max(0, dimensions.window_height - dimensions.container_offset.top - 70));
                    }

                    scope.timeout = $timeout(scope.roster_check_dimensions, 100);
                };

                scope.roster_check_dimensions();
            }
        };
    }).factory('Message', function ($http) {
        var Message = function (obj) {
            angular.extend(this, obj);
        };

        Message.prototype.create = function () {
            var self = this;

            return $http({
                method: 'POST',
                url: '/adn-proxy/stream/0/channels/' + self.channel_id + '/messages',
                data: {
                    text: self.text
                }
            }).then(function (response) {
                angular.extend(self, response.data.data);
                return self;
            });
        };

        Message.auto_create = function (destinations, text) {
            return $http({
                method: 'POST',
                url: '/adn-proxy/stream/0/channels/pm/messages',
                data: {
                    destinations: destinations,
                    text: text
                }
            }).then(function (response) {
                return response.data.data.channel_id;
            });
        };

        return Message;
    }).controller('MessageFormCtrl', function ($scope, $element, $routeParams, Message) {
        $scope.message = new Message();

        $element.find('input').focus();

        $scope.submitMessage = function () {
            var message = $scope.message;

            // preemptively empty the box
            $scope.$emit('submit-message');
            $scope.message = new Message();
            $element.find('input').focus();

            if ($scope.channel) {
                message.channel_id = $scope.channel.id;
                message.create();
            }
        };
    }).controller('MessageListCtrl', function ($scope, $element, channelState) {
        $scope.$on('update_marker', function (event, message) {
            if ($scope.channel) {
                channelState.update_marker($scope.channel, message);
            }
        });
    });
})();
