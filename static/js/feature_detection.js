/*global Modernizr:true */
(function () {
    var doc_element = document.documentElement;

    var queries = window.TAPP_MEDIA_QUERIES = {
        phone: "(max-width: 700px)",
        tablet: "(min-width: 701px) and (max-width: 1151px)",
        widescreen: "(min-width: 1152px)",
        retina: "only screen and (-webkit-min-device-pixel-ratio : 2)",
        height_large: "(min-height: 1200px)",
        height_medium: "(min-height: 950px) and (max-height: 1199px)",
        height_small: "(min-height: 600px) and (max-height: 949px)",
        height_mini: "(max-height: 599px)"
    };

    var makeTest = function (query) {
            return function () {
                return Modernizr.mq(query);
            };
        };

    // remove the default state
    doc_element.className = doc_element.className.replace('breakpoint-phone', '');
    Modernizr.test_media_queries = function () {
        for (var name in queries) {
            Modernizr.addTest('breakpoint-' + name, makeTest(queries[name]));
        }
    };

    Modernizr.test_media_queries();

    Modernizr.addTest('filereader', function () {
        return !!(window.File && window.FileList && window.FileReader);
    });

    Modernizr.addTest('overflowscrolling', function () {
        return Modernizr.testAllProps("overflowScrolling");
    });

    $(window).on('resize', _.debounce(Modernizr.test_media_queries, 50));
}());
