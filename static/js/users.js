/*globals angular */

(function () {
    angular.module('users', ['ui']).factory('User', function ($http) {
        var User = function (data) {
            if (data) {
                angular.extend(this, data);
            }

            this.text = '@' + this.username + ' (' + this.name + ')';
        };

        User.get = function (user_id, callback) {
            var user = new User();

            $http.get('/adn-proxy/stream/0/users/' + user_id).then(function (response) {
                angular.extend(user, response.data.data);
                if (callback) {
                    callback(user);
                }
            });

            return user;
        };

        User.prototype.follow = function (callback) {
            $http.post('/adn-proxy/stream/0/users/' + user_id + '/follow').then(function (response) {
                callback(new User(response.data.data));
            });
        };

        User.prototype.unfollow = function (callback) {
            $http.delete('/adn-proxy/stream/0/users/' + user_id + '/follow').then(function (response) {
                callback(new User(response.data.data));
            });
        };

        User.query = function (callback) {
            var users = [];

            $http.get('/adn-proxy/stream/0/users').then(function (response) {
                angular.forEach(response.data.data, function (value) {
                    users.push(new User(value));
                });

                if (callback) {
                    callback(users);
                }
            });

            return users;
        };

        User.get_search_select2 = function (include_users) {
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
                                return new User(value);
                            })
                        };
                    }
                }
            };
        };

        return User;
    }).controller('UserSearchCtrl', function ($scope, User) {
        // autocomplete
        $scope.usernameSelect = User.get_search_select2();

        // push this up the stack
        $scope.$watch('selectedUsers', function (newValue, oldValue) {
            $scope.$parent.selectedUsers = newValue;
        });
    });
})();

