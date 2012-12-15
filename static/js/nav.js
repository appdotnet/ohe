/*globals angular */

(function () {
    angular.module('nav', []).directive('nav', function () {
        return {
            restrict: 'E',
            controller: 'NavCtrl',
            templateUrl: '/static/templates/nav.html',
            replace: true,
            link: function (scope, element) {

            }
        };
    }).controller('NavCtrl', function ($scope, $element, $window) {
        $scope.enable_notifications = function () {
            if (!$window.webkitNotifications) {
                return;
            }
            $window.webkitNotifications.requestPermission(function () {
                var perm = $window.webkitNotifications.checkPermission();
                if (perm === 0) {
                    // notifications enabled
                    $scope.$apply($scope.alert_message = 'notifications_enabled');
                } else if (perm === 2) {
                    // notifications globally disabled
                    $scope.$apply($scope.alert_message = 'notifications_globally_disabled');
                }
            });
        };
        $scope.show_enable_notifications_button = function () {
            return $window.webkitNotifications && ($window.webkitNotifications.checkPermission() !== 0);
        };
    });
})();