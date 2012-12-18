/*globals angular */

(function () {
    angular.module('ohe', ['messages', 'channels', 'nav',
    function ($httpProvider) {
        var interceptor = ['$q', function ($q) {
            var success = function (response) {
                return response;
            };
            var error = function (response) {
                var status = response.status;
                if (status === 401) {
                    window.location.href = window.location.href;
                }
                return $q.reject(response);
            };
            return function (promise) {
                return promise.then(success, error);
            };
        }];
        $httpProvider.responseInterceptors.push(interceptor);
    }
    ]).config(function ($routeProvider, $locationProvider, $httpProvider) {
        $locationProvider.html5Mode(true);
        $locationProvider.hashPrefix = '!';
        $routeProvider.otherwise({ redirectTo: '/' });
        $httpProvider.defaults.headers.common['X-CSRF-Token'] = document.getElementById('csrftoken').getAttribute('data-token');
    }).run(function ($rootScope) {
        var user = document.getElementById('user');
        $rootScope.user_id = user && user.getAttribute('data-id');
        $rootScope.username = user && user.getAttribute('data-username');
        $rootScope.window = window;
        $rootScope.channel_list = [];
        $rootScope.$on('$routeChangeSuccess', function (event, route) {
            $rootScope.selectedNav = route.$route.selectedNav;
        });
    });
})();
