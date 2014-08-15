var request = require('request');
var es = require('event-stream');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var url = require('url');
var nconf = require('nconf');

var stream_url_override = nconf.get('adn:stream_url_override');

function ADNStream(endpoint) {
    EventEmitter.call(this);

    this.headers = {};

    // Here is where some of our infrastructure details leak
    // into something we're open sourcing. Sorry about this, y'all.
    if (stream_url_override) {
        var parsed_endpoint = url.parse(endpoint);
        var parsed_override = url.parse(stream_url_override);
        this.headers.host = parsed_endpoint.hostname;
        parsed_override.pathname = parsed_endpoint.pathname;
        endpoint = url.format(parsed_override);
    }

    this.endpoint = endpoint;
}

util.inherits(ADNStream, EventEmitter);

ADNStream.prototype.process = function (purge) {
    var self = this;
    var qs = {};

    if (purge) {
        qs.purge = 1;
    }

    this.request = request({
        url: this.endpoint,
        method: 'GET',
        headers: this.headers,
        qs: qs
    });

    this.request.on('error', function (error) {
        self.emit('error', error);
    });

    this.request.on('response', function (response) {
        console.info('Got response:', response.statusCode);
        if (response.statusCode === 200) {
            console.info('Connected to stream');
        } else {
            console.error('Unexpected status code:', response.statusCode);
        }

        response.on('end', function () {
            self.emit('end');
        });
    });

    var processor = es.through(function (data) {
        var s = data.toString('utf-8');
        if (!s.length) { return; }

        var obj;
        try {
           obj = JSON.parse(s);
        } catch(err) {
            return;
        }

        self.emit(obj.meta.type, obj);
    });

    this.request.pipe(es.pipeline(es.split('\r\n'), processor));
};

module.exports.ADNStream = ADNStream;
