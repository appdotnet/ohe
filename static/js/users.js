/*globals angular */

(function () {
    angular.module('users', ['ui']).factory('User', ['$http', function ($http) {
        var User = function (complete, data) {
            if (complete) {
                this.complete(data);
            } else {
                angular.extend(this, data);
            }
        };

        User.prototype.complete = function (data) {
            angular.extend(this, data);
            this.is_complete = true;
            this.text = '@' + this.username + ' (' + this.name + ')';

            return this;
        };

        User._cache = {};
        User._pending = [];

        User.update = function (user) {
            if (!user) {
                return;
            }
            var cached_user = User._cache[user.id || 0];
            if (cached_user) {
                User._pending = _.without(User._pending, cached_user);
                return cached_user.complete(user);
            } else {
                return User._cache[user.id] = new User(true, user);
            }
        };

        User.bulk_get = function (user_ids, fetch) {
            var result = {};

            _.each(_.uniq(user_ids), function (user_id) {
                var user = User._cache[user_id];
                if (!user) {
                    user = User._cache[user_id] = new User(false, {id: user_id});
                    User._pending.push(user);
                }

                result[user_id] = user;
            });

            if (fetch) {
                User.fetch_pending();
            }

            return result;
        };

        User.fetch_pending = function () {
            var pending = User._pending;
            User._pending = [];

            var callback = function (response) {
                _.each(response.data.data, function (user) {
                    User.update(user);
                });
            };

            while (pending.length) {
                var chunk = _.first(pending, 200);
                pending = _.rest(pending, 200);

                var joined_ids = _.pluck(chunk, 'id').join();
                $http({
                    method: 'GET',
                    url: '/adn-proxy/stream/0/users',
                    params: {
                        ids: joined_ids
                    }
                }).then(callback);
            }
        };
        return User;
    }]).directive('userSearch', ['User', '$routeParams', '$timeout', '$rootScope', function (User, $routeParams, $timeout, $rootScope) {
        return {
            restrict: 'E',
            controller: 'UserSearchCtrl',
            templateUrl: 'user-search.html',
            replace: true,
            link: function (scope, element) {
                // push this up the stack
                scope.$watch('selectedUsers', function (newValue, oldValue) {
                    scope.$parent.selectedUsers = newValue;
                });
                scope.selectedUsers = undefined;
                var in_existing_channel = !!$routeParams.channel_id;
                if (!in_existing_channel) {
                    var userid = $routeParams.to;
                    if (userid) {
                        var users = User.bulk_get([parseInt(userid, 10)], true);
                        // select2 doesn't seem to dynamically update, so sometimes
                        // the username will say 'undefined' and not refresh
                        // need to make the User stuff return deferreds

                        // HACK: poll until the users are loaded (eg. the username property is loaded)
                        var interval_count = 100;
                        var interval = setInterval(function () {
                            interval_count -= 1;
                            var users_loaded = _.every(_.values(users), function (user) {
                                return !!user.username;
                            });
                            if (users_loaded || interval_count <= 0) {
                                scope.$apply(scope.selectedUsers = _.values(users));
                                $('input[name="text"]').focus();
                                clearInterval(interval);
                            }
                        }, 50);
                    }
                }
            }
        };
    }]).controller('UserSearchCtrl', ['$scope', 'User', function ($scope, User) {
        // autocomplete
        var get_search_select2 = function (include_users) {
            return {
                multiple: true,
                minimumInputLength: 1,
                tokenSeparators: [",", " "],
                createSearchChoice: function (term) {
                    return term;
                },
                width: 'resolve',
                ajax: {
                    url: '/adn-proxy/stream/0/users/search',
                    method: 'GET',
                    quietMillis: 100,
                    data: function (term, page) {
                        if (term.charAt(0) !== '@' && term.charAt(0) !== '#') {
                            term = '@' + term;
                        }

                        return {
                            q: term,
                            include_users: include_users || 'any'
                        };
                    },
                    results: function (data, page) {
                        return {
                            results: _.map(data.data, function (value) {
                                return User.update(value);
                            })
                        };
                    }
                }
            };
        };
        $scope.usernameSelect = get_search_select2();
    }]);
})();

