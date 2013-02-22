/*globals angular, io */

(function () {
    angular.module('socket', ['utils']).factory('Socket', ['$rootScope', '$http', '$timeout', 'utils',
    function ($rootScope, $http, $timeout, utils) {
        var id = utils.random_string(32);
        var poll = function () {
            $http({
                url: '/lightpoll',
                method: 'GET',
                params: {
                    'id': id,
                    't': +new Date()
                }
            }).then(function (response) {
                angular.forEach(response.data, function (d) {
                    $rootScope.$emit('stream_push', d);
                });

                $timeout(poll);
            }, function (response) {
                $timeout(poll, 10000);
            });
        };

        poll();
    }]);
})();
