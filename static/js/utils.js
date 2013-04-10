/*globals angular,moment */

(function () {
    angular.module('utils', []).factory('utils', function () {
        // workaround for http://code.google.com/p/chromium/issues/detail?id=64846
        // otherwise would use document.hasFocus()
        var has_focus = true;
        $(window).on('focus', function () {
            has_focus = true;
        });
        $(window).on('blur', function () {
            has_focus = false;
        });

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

        return {
            id_newer: function (old_id, new_id) {
                return parseInt(old_id, 10) <= parseInt(new_id, 10);
            },
            comparable_id: function (obj, field) {
                field = field || 'id';
                if (!obj) {
                    return 0;
                }

                return parseInt(obj[field], 10);
            },
            random_string: function (len) {
                var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                var arr = [];
                var rand;
                while (arr.length < len) {
                    rand = Math.floor(Math.random() * chars.length);
                    arr.push(chars.substr(rand, 1));
                }
                return arr.join('');
            },
            title_bar_notification: function () {
                if (!has_focus && !interval) {
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
            },
            fit_to_box: function (w, h, max_w, max_h, expand) {
                expand = expand || false;
                // proportionately scale a box defined by (w,h) so that it fits within a box defined by (max_w, max_h)
                // by default, only scaling down is allowed, unless expand=True, in which case scaling up is allowed
                if ((w < max_w) && (h < max_h) && !expand) {
                    return [w, h];
                }
                var largest_ratio = Math.max(w / max_w, h / max_h);
                var new_height = parseInt(h / largest_ratio, 10);
                var new_width = parseInt(w / largest_ratio, 10);
                return [new_width, new_height];
            }
        };
    }).filter('fromNow', function () {
        moment.lang('en', {
            relativeTime : {
                future: "in %s",
                past:   "%s ago",
                s:  "%ds",
                m:  "%dm",
                mm: "%dm",
                h:  "%dh",
                hh: "%dh",
                d:  "%dd",
                dd: "%dd",
                M:  "%d month",
                MM: "%d months",
                y:  "%d year",
                yy: "%d years"
            }
        });
        var four_weeks_in_secs = 2419200;
        var one_year_in_secs = 31536000;
        return function (date_string) {
            var now = new Date();
            var then = new Date(date_string);
            var delta = (now - then) / 1000;
            var m = moment(date_string);
            if (delta > one_year_in_secs) {
                return m.format('DD MMM YY');
            } else if (delta > four_weeks_in_secs) {
                return m.format('DD MMM');
            } else {
                return m.fromNow(true);
            }
        };
    }).directive('ngBackgroundImage', function () {
        return function (scope, element, attrs) {
            attrs.$observe('ngBackgroundImage', function (value) {
                element.css({
                    'background-image': 'url(' + value + ')'
                });
            });
        };
    });
})();
