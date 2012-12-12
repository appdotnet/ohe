/*globals angular */

(function () {
    angular.module('utils', []).factory('utils', function () {
        return {
            'id_newer': function (old_id, new_id) {
                return parseInt(old_id, 10) <= parseInt(new_id, 10);
            },
            'comparable_id': function (obj, field) {
                field = field || 'id';
                if (!obj) {
                    return 0;
                }

                return parseInt(obj[field], 10);
            },
            'random_string': function (len) {
                var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                var arr = [];
                var rand;
                while (arr.length < len) {
                    rand = Math.floor(Math.random() * chars.length);
                    arr.push(chars.substr(rand, 1));
                }
                return arr.join('');
            }
        };
    });
})();
