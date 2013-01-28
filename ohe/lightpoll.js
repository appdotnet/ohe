var _ = require('underscore');

var defaults = {
    timeout: 10,
    redis_pubsub_key: 'lightpoll_mux',
    route: '/lightpoll',
    user_ttl: 600,
    client_ttl: 60
};

var LightPoll = function (options) {
    var poller = this;

    _.extend(poller, defaults);
    _.extend(poller, options);

    poller.local_clients = {};

    if (!poller.redis_client || !poller.pub_client || !poller.sub_client) {
        throw new Error('Must supply redis_client, pub_client, sub_client');
    }

    var PollClient = function (client_id, req, res) {
        this.client_id = client_id;
        this.req = req;
        this.res = res;
        this.drained = false;
    };

    PollClient.prototype.poll = function () {
        var self = this;

        // clean up after ourselves
        self.res.on('end', function () {
            console.log('Poll client', self.client_id, 'ending');
            delete poller.local_clients[self.client_id];
        });

        var key = 'user_client:' + self.req.adn_user().id;

        // HACK: We never modify the session -- so don't write it back
        // to redis after we're done, write it back now.
        self.req.session.resetMaxAge();
        self.req.session.save();
        self.req.session = undefined;

        // renew user_id registration
        poller.redis_client.hset(key, self.client_id, +new Date(), function (err, result) {
            if (!err) {
                poller.redis_client.expire(key, poller.user_ttl);
            }
        });

        // see if there's anything waiting for me
        self.drain_list(function (err, items) {
            if (err) {
                // if redis crapped out, reply
                self.res.send(500);
            } else {
                if (items.length) {
                    // If we got anything, return it
                    self.res.json(items);
                } else {
                    // register for updates
                    poller.local_clients[self.client_id] = self;

                    // set timeout
                    setTimeout(function () {
                        if (!self.drained) {
                            delete poller.local_clients[self.client_id];
                            self.res.json([]);
                        }
                    }, poller.timeout * 1000);
                }
            }
        });
    };

    PollClient.prototype.drain_list = function (callback) {
        var self = this;

        var trans = poller.redis_client.multi();
        var key = 'client_queue:' + self.client_id;
        trans.lrange(key, 0, -1);
        trans.del(key);
        trans.exec(function (err, replies) {
            if (err) {
                console.error('Error fetching items from Redis:', err);
                callback(err, []);
            } else {
                var encoded_items = replies[0];
                var items = [];

                _.each(encoded_items, function (encoded_item) {
                    try {
                        items.push(JSON.parse(encoded_item));
                    } catch (err) {
                        console.error('Error decoding bad JSON in encoded_items:', encoded_items);
                    }
                });

                callback(err, items);
            }
        });
    };

    PollClient.prototype.on_notify = function () {
        var self = this;

        // can't handle getting notified about any other events
        // in this session
        delete poller.local_clients[self.client_id];

        // cause the timeout not to fire -- we'll handle it from here
        self.drained = true;

        self.drain_list(function (err, items) {
            if (err) {
                return self.res.send(500);
            } else {
                // *always* reply if we got here, even
                // if the list is empty.
                return self.res.json(items);
            }
        });
    };

    this.PollClient = PollClient;
};

LightPoll.prototype.enable = function (app) {
    var self = this;
    // bind to the routes
    app.get(self.route, _.bind(self.poll, self));

    // tell redis we're interested
    self.sub_client.on('ready', function () {
        self.sub_client.subscribe(self.redis_pubsub_key);
    });

    self.sub_client.on('message', function (channel, message) {
        if (channel === self.redis_pubsub_key) {
            // for now message is always just an ID that needs updating
            var client_id = message;
            var client = self.local_clients[client_id];
            if (client && client.on_notify) {
                client.on_notify();
            }
        }
    });
};

LightPoll.prototype.poll = function (req, res) {
    if (!req.adn_user().is_authenticated()) {
        return res.send(401);
    }

    if (!req.query.id || req.query.id.length != 32) {
        return res.send(400);
    }

    var client = new this.PollClient(req.query.id, req, res);
    client.poll();
};

LightPoll.prototype.dispatch = function (user_id, message) {
    var self = this;

    // get all clients registered for a certain user
    var key = 'user_client:' + user_id;

    self.redis_client.hgetall(key, function (err, result) {
        if (err) {
            console.error('Error getting all keys', key, 'in redis:', err);
        } else {
            if (result) {
                var expiration_timestamp = +new Date() - (self.user_ttl * 1000);
                var pub_keys = [];
                var encoded_message = JSON.stringify(message);
                var multi = self.redis_client.multi();

                _.each(result, function (hres, hkey) {
                    var list_key = 'client_queue:' + hkey;

                    if (expiration_timestamp >= hres) {
                        // purge stale entry
                        multi.hdel(key, hkey);
                    } else {
                        // push those onto right of list
                        multi.rpush(list_key, encoded_message);
                        multi.expire(list_key, self.client_ttl);
                        pub_keys.push(hkey);
                    }
                });

                // Now dispatch messages to sockets (if they're polling)
                multi.exec(function (err, result) {
                    if (err) {
                        console.error('Error dispatching messages:', err);
                    } else {
                        _.each(pub_keys, function (pub_key) {
                            self.pub_client.publish(self.redis_pubsub_key, pub_key);
                        });
                    }
                });
            }
        }
    });
};

exports.LightPoll = LightPoll;
