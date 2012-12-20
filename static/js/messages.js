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
                scope.$on('submit_message', function (event) {
                    scroll_to_bottom();
                });

                scope.$on('$destroy', function () {
                    $timeout.cancel(scope.timeout);
                    element.find('.message-list').off('scroll.message-list');
                });

                var on_channel_loaded = function () {
                    // everything that needs to wait until the channel is fully loaded
                    scope.$watch('channel.messages', function (newVal, oldVal) {
                        if (newVal && newVal.length || oldVal && oldVal.length) {
                            if (pinned_to_bottom) {
                                scroll_to_bottom();
                            }
                        }
                    }, true);

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
                    scope.$watch('channel.messages.length', function (newVal, oldVal) {
                        if (newVal > oldVal && !interval) {
                            // make sure the new messages aren't all from the viewer
                            // some assumptions in here about new messages always
                            // getting appended to end of messages array
                            var new_messages = scope.channel.messages.slice(oldVal);
                            var has_others = _.some(new_messages, function (msg) {
                                return msg.user.id !== scope.user_id;
                            });
                            if (has_others) {
                                toggle_title();
                                interval = window.setInterval(toggle_title, 1500);
                                if (!one) {
                                    one = $(window, 'html').one('focus', function () {
                                        document.title = original_title;
                                        clearInterval(interval);
                                        interval = undefined;
                                        one = undefined;
                                    });
                                }
                            }
                        }
                    }, true);

                    // fire_update_marker on initial load also
                    fire_update_marker();
                };

                var channel_loaded_deregister = scope.$on('channel_loaded', function () {
                    on_channel_loaded();
                    channel_loaded_deregister();
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
    }).directive('resizeHeight', function ($timeout) {
        return function (scope, element) {
            var t;
            var w = $(window);
            var layout_dimensions = {};
            var check_dimensions = function () {
                var dimensions = {
                    window_height: w.height(),
                    window_width: w.width(),
                    container_offset: element.offset()
                };

                if (!_.isEqual(layout_dimensions, dimensions)) {
                    layout_dimensions = dimensions;

                    // fix dimensions
                    element.height(Math.max(0, dimensions.window_height - dimensions.container_offset.top - 70));
                }
                t = $timeout(check_dimensions, 100);
            };
            check_dimensions();
        };
    }).directive('roster', function ($timeout) {
        return {
            restrict: 'E',
            templateUrl: '/static/templates/roster.html',
            replace: true
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
            $scope.$emit('submit_message');
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
