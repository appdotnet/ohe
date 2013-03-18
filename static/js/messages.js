/*globals angular */

(function () {
    angular.module('messages', ['users', 'utils']).directive('messageList',
    ['$timeout', 'utils', '$rootScope', '$http', 'Message',
    function ($timeout, utils, $rootScope, $http, Message) {
        return {
            restrict: 'E',
            controller: 'MessageListCtrl',
            templateUrl: 'message-list.html',
            replace: true,
            link: function (scope, element) {
                var pinned_to_bottom = true;

                var fire_update_marker = function () {
                    var el = element.find('.message-list');
                    var parent_top = el.offset().top;
                    var parent_bottom = parent_top + el.height();

                    var bottom_element;

                    // if there is no scrollbar:
                    if (el.get(0).scrollHeight > el.height()) {
                        bottom_element = el.find('.message-container').last();
                    } else {
                        // start from the bottom and find the first message with
                        // a visible midpoint
                        $(el.find('.message-container').get().reverse()).each(function () {
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

                scope.$on('submit_message', function () {
                    scroll_to_bottom();
                });

                scope.$on('$destroy', function () {
                    $timeout.cancel(scope.timeout);
                    element.find('.message-list').off('scroll.message-list');
                });

                var set_up_iscroll = function () {
                    if ($('html.touch').length && $('html.no-overflowscrolling').length) {
                        window.setTimeout(function () {
                            $('.message-list').on('touchmove', function (e) {
                                e.preventDefault();
                            });
                            $('.message-list').css('overflow-y', 'auto');
                            var message_list_iscroll = new iScroll($('.message-list')[0]);
                            message_list_iscroll.scrollTo(0, message_list_iscroll.maxScrollY, 0);
                            $(window).on('resize', function () {
                                message_list_iscroll.refresh();
                            });
                        }, 200);
                    }
                };

                // everything that needs to wait until the channel is fully loaded
                scope.$watch('channel.messages', function (newVal, oldVal) {
                    if (newVal && newVal.length || oldVal && oldVal.length) {
                        if (pinned_to_bottom) {
                            $timeout(function () {
                                scroll_to_bottom();
                            }, 1, false);
                        }
                        set_up_iscroll();
                    }
                }, true);

                scope.$watch('channel.messages.length', function (newVal, oldVal) {
                    if (newVal > oldVal) {
                        // make sure the new messages aren't all from the viewer
                        // there are some assumptions in here about new messages always
                        // getting appended to end of messages array
                        var new_messages = scope.channel.messages.slice(oldVal);
                        var has_others = _.some(new_messages, function (msg) {
                            return msg.user.id !== scope.user_id;
                        });

                        if (has_others) {
                            utils.title_bar_notification();
                        }
                    }
                }, true);

                // fire_update_marker on initial load also
                fire_update_marker();

                scope.has_older_messages = true;

                scope.loadOlderMessages = function () {
                    var oldest_message_id = scope.channel.messages[0].id;
                    var oldest_message_elem = element.find('[data-message-id=' + oldest_message_id + ']');

                    var params = {
                        count: $rootScope.message_fetch_size,
                        before_id: oldest_message_id,
                        include_deleted: 0,
                        include_annotations: 1
                    };

                    $http({
                        method: 'GET',
                        url: '/adn-proxy/stream/0/channels/' + scope.channel.id + '/messages',
                        params: params
                    }).then(function (response) {
                        var messages = [];

                        angular.forEach(response.data.data, function (d) {
                            messages.unshift(new Message(d));
                        });
                        scope.channel.messages = messages.concat(scope.channel.messages);

                        if (messages.length < $rootScope.message_fetch_size) {
                            scope.has_older_messages = false;
                        }
                        $timeout(function () {
                            element.find('.message-list').scrollTop(oldest_message_elem.offset().top - 70);
                        }, 1);
                    });
                };

                scope.deleteMessage = function (msg) {
                    var msg_id = msg.id;
                    msg.delete().then(function () {
                        var new_messages_list = _.reject(scope.channel.messages, function (m) {
                            return m.id === msg_id;
                        });
                        scope.channel.messages = new_messages_list;
                    });
                }
            }
        };
    }]).directive('fileUpload', [function () {
        return {
            restrict: 'A',
            controller: 'MessageFormCtrl',
            templateUrl: 'file-upload.html',
            replace: true,
            link: function (scope, element) {
                if (!(window.FileReader && window.FormData)) {
                    return; // element is hidden also
                }

                scope.attachment = {
                    file: null,
                    id: null,
                    token: null,
                    annotations: null
                };
                scope.upload_in_progress = false;

                var uploader;
                var activator = element.closest('form').find('[data-attach-btn]');
                var file_input = element.find('[data-file-upload-input]');
                var name_preview = element.find('[data-attachment-name]');
                var upload_progress_cont = element.find('[data-upload-progress]');
                var upload_progress_bar = upload_progress_cont.find('.bar');
                var remove_file = element.find('[data-remove-attachment]');
                var alert_area = element.find('[data-attachment-alert]');
                var alert_area_text = alert_area.find('.text');

                var annotations_from_response = function (resp) {
                    var annotations;
                    if (resp.kind === 'image') {
                        annotations = [{
                            type: "net.app.core.oembed",
                            value: {
                                "+net.app.core.file": {
                                    file_token: resp.file_token,
                                    format: "oembed",
                                    file_id: resp.id
                                }
                            }
                        }];
                    } else {
                        annotations = [{
                            type: "net.app.core.attachments",
                            value: {
                                "+net.app.core.file_list": [{
                                    file_token: resp.file_token,
                                    format: "metadata",
                                    file_id: resp.id
                                }]
                            }
                        }];
                    }

                    return annotations;
                };

                var onfile = function (file, on_file_read) {
                    scope.attachment.file = file;
                    upload_progress_cont.removeClass('hide');
                    name_preview.find('[data-text]').text(file.name);
                };

                var onresetfile = function () {
                    scope.attachment = {
                        file: null,
                        id: null,
                        token: null,
                        annotations: null
                    };
                    scope.upload_in_progress = false;

                    name_preview.find('[data-text]').text('').removeClass('text-success');
                    upload_progress_cont.addClass('hide').removeClass('plain');
                    upload_progress_bar.css('width', '0%').removeClass('hide');
                    remove_file.addClass('hide');
                    activator.removeClass('hide');
                    upload_progress_cont.find('.progress').addClass('progress-striped active');
                    element.find('input[name="text"]').focus();
                };

                var onuploadstart = function () {
                    scope.upload_in_progress = true;
                    upload_progress_cont.removeClass('hide');
                    upload_progress_bar.css('width', '0%');
                    activator.addClass('hide');
                    alert_area_text.text('');
                    alert_area.hide();
                };

                var onprogress = function (percent_done) {
                    percent_done = Math.max(percent_done, 5);
                    upload_progress_bar.css('width', percent_done + '%');
                    if (percent_done === 100) {
                        upload_progress_cont.find('.progress').addClass('progress-striped active');
                    }
                };

                var onuploaddone = function (resp) {
                    scope.upload_in_progress = false;
                    scope.attachment.id = resp.id;
                    scope.attachment.token = resp.file_token;
                    scope.attachment.annotations = annotations_from_response(resp.data);
                    upload_progress_cont.addClass('plain');
                    upload_progress_bar.addClass('hide');
                    remove_file.removeClass('hide');
                    name_preview.find('[data-text]').addClass('text-success');
                    element.find('input[name="text"]').focus();
                };

                var onerror = function (reason, file) {
                    // TODO: some kind of notification
                    if (reason === 'empty') {
                        alert_area_text.text('The file you attached was empty.');
                        alert_area.show();
                    } else if (reason === 'too_large') {
                        var max_in_mb = uploader.max_file_size / 1e6;
                        // TODO: accurate max file size based on free tier, etc
                        alert_area_text.text('The file you tried to attach was too large.');
                        alert_area.show();
                    }
                };

                var upload_to = function (form_data, progress) {
                    return $.ajax({
                        type: 'POST',
                        url: '/adn-proxy/stream/0/files',
                        data: form_data,
                        cache: false,
                        contentType: false,
                        processData: false,
                        progress: progress
                    });
                };

                var options = {
                    activator: activator,
                    file_input: file_input,
                    onfile: onfile,
                    onresetfile: onresetfile,
                    onuploadstart: onuploadstart,
                    onprogress: onprogress,
                    onuploaddone: onuploaddone,
                    upload_on_change: true,
                    upload_to: upload_to,
                    onerror: onerror,
                    max_file_size: 100e6,
                    extra_data: [
                        ['type', 'net.app.omega.attachment']
                    ]
                };

                uploader = new Omega.FileUploader(options);
                uploader.bind_events();
                element.on('click', '[data-remove-attachment]', function () {
                    uploader.reset_file_upload();
                });
                scope.$on('submit_message', function () {
                    uploader.reset_file_upload();
                });
            }
        };
    }]).directive('messageForm', function () {
        return {
            restrict: 'E',
            controller: 'MessageFormCtrl',
            replace: true,
            templateUrl: 'message-form.html'
        };
    }).directive('autoCreateMessageForm', function () {
        return {
            restrict: 'E',
            controller: 'MessageFormCtrl',
            replace: true,
            templateUrl: 'auto-create-message-form.html'
        };
    }).directive('messageContainer', ['utils', '$http', function (utils, $http) {
        return {
            restrict: 'A',
            templateUrl: 'message-container.html',
            replace: true,
            link: function (scope) {
                var core_file_attachments = [];
                var oembed_images = [];
                var i = 0;
                _.each(scope.message.annotations, function (annotation) {
                    if (annotation.type === 'net.app.core.attachments') {
                        var file_list = annotation.value['net.app.core.file_list'];
                        _.map(file_list, function(file) {
                            var friendly_size = file.size + "B";
                            if (file.size >= 1e9) {
                                friendly_size = (file.size / 1e9).toFixed(1) + "G";
                            } else if (file.size > 1e6) {
                                friendly_size = (file.size / 1e6).toFixed(1) + "M";
                            } else if (file.size > 1e3) {
                                friendly_size = (file.size / 1e3).toFixed(0) + "K";
                            }
                            file.friendly_size = friendly_size;
                        });
                        core_file_attachments.push(annotation.value['net.app.core.file_list']);
                    } else if (annotation.type === 'net.app.core.oembed') {
                        var value = annotation.value;
                        if (value.type === 'photo') {
                            if (value.url && value.version === '1.0' && value.thumbnail_url && value.thumbnail_width &&
                                    value.thumbnail_height && value.width && value.height) {

                                var dims = utils.fit_to_box(value.thumbnail_width, value.thumbnail_height, 100, 100);
                                value.scaled_thumbnail_width = dims[0];
                                value.scaled_thumbnail_height = dims[1];
                                value.annotation_index = i;
                                if (value.thumbnail_url.indexOf('http:') === 0) {
                                    // make http urls secure to avoid mixed content warnings
                                    $http({
                                        method: 'GET',
                                        url: '/camofy-url',
                                        params: {
                                            'url': value.thumbnail_url
                                        }
                                    }).then(function(response) {
                                        value.secure_thumbnail_url = response.data;
                                        oembed_images.push(value);
                                    });
                                } else {
                                    value.secure_thumbnail_url = value.thumbnail_url;
                                    oembed_images.push(value);
                                }
                            }
                        }
                    }
                    i++;
                });
                scope.core_file_attachments = core_file_attachments;
                scope.oembed_images = oembed_images;
            }
        };
    }]).directive('resizeHeight', ['$timeout', function ($timeout) {
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
                    var min_height = 200;
                    var new_height = Math.max(min_height, dimensions.window_height - dimensions.container_offset.top - 130);
                    element.height(new_height);
                }
                t = $timeout(check_dimensions, 200, false);
            };
            check_dimensions();
        };
    }]).directive('roster', [function () {
        return {
            restrict: 'E',
            templateUrl: 'roster.html',
            replace: true
        };
    }]).factory('Message', ['User', '$http', function (User, $http) {
        var Message = function (data) {
            this.update(data);
        };

        Message.prototype.update = function (data) {
            if (data) {
                angular.extend(this, data);
                this.user = User.update(data.user);
            }

            return this;
        };

        Message.prototype.create = function () {
            var self = this;

            return $http({
                method: 'POST',
                url: '/adn-proxy/stream/0/channels/' + self.channel_id + '/messages',
                data: {
                    text: self.text,
                    annotations: self.annotations || []
                }
            }).then(function doneCallback (response) {
                self.update(response.data.data);

                return self;
            }, function failCallback (response) {
                // TODO: some kind of notification
                console.log(response.data.meta.error_message);
            });
        };

        Message.prototype.auto_create = function (destinations, text) {
            var self = this;

            return $http({
                method: 'POST',
                url: '/adn-proxy/stream/0/channels/pm/messages',
                data: {
                    destinations: self.destinations,
                    text: self.text,
                    annotations: self.annotations || []
                }
            }).then(function (response) {
                return response.data.data.channel_id;
            });
        };

        Message.prototype.delete = function () {
            var self = this;

            return $http({
                method: 'DELETE',
                url: '/adn-proxy/stream/0/channels/' + self.channel_id + '/messages/' + self.id
            });
        }

        return Message;
    }]).controller('MessageFormCtrl', ['$scope', '$element', '$routeParams', 'Message', '$location',
    function ($scope, $element, $routeParams, Message, $location) {
        $scope.message = new Message();

        $element.find('input[name="text"]').focus();

        $scope.submitMessage = function () {
            if ($scope.upload_in_progress) {
                return;
            }
            var message = $scope.message;
            // create annotations if there's a file attached
            message.annotations = $scope.attachment && $scope.attachment.annotations || [];

            // preemptively empty the box
            $scope.$emit('submit_message');
            $scope.message = new Message();
            $element.find('input').focus();

            if ($scope.channel) {
                message.channel_id = $scope.channel.id;
                message.create();
            }
        };

        $scope.createUser = function () {
            if ($scope.upload_in_progress) {
                return;
            }
            var message = $scope.message;
            // create annotations if there's a file attached
            message.annotations = $scope.attachment && $scope.attachment.annotations || [];
            message.destinations = _.pluck($scope.selectedUsers, 'id');
            message.auto_create().then(function (channel_id) {
                if (channel_id) {
                    $location.path('/channel/' + channel_id);
                }
            });
        };

        $scope.show_file_upload_button = function () {
            return !!(window.File && window.FileList && window.FileReader && window.FormData);
        };

        $scope.enable_send_button = function () {
            return ($scope.message.text && $scope.message.text.length <= 256);
        };
    }]).controller('MessageListCtrl', ['$scope', '$element', 'channelState', function ($scope, $element, channelState) {
        $scope.$on('update_marker', function (event, message) {
            if ($scope.channel) {
                channelState.update_marker($scope.channel, message);
            }
        });
    }]);
})();
