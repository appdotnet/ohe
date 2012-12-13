# ohe — Private messaging on App.net

This is `ohe`, the code behind App.net's reference private messaging UI called Omega. It's the same code we run in production for [omega.app.net](https://omega.app.net/). This code is ready for local deployment, deployment on Heroku, or larger scale deployment, if you want. It is an example of a thick Javascript application with some server logic.

It contains:

* An Angular.js application for the UI
* An API proxy to allow API calls to be made as session-authenticated calls
* A consumer of the streaming API

## Requirements

* Node.js 0.8.xx+
* Redis server

## Installation — development

1. Create a new application on App.net. Note the client_id and client_secret. The redirect URI should be /return on the host you're going to use for ohe, e.g., http://localhost:8666/return.

1. Create a config.json in the root of your application. Add your client_id/client_secret where prompted, as well as a random secret to protect your sessions. Update your redis URL if necessary. Make sure you don't check in any sensitive data, e.g., client secret or session secret, where it will be exposed publicly.

    This configuration is read via the [nconf](https://github.com/flatiron/nconf) configuration library. It is possible to specify configuration via the config file, via environment variables or via the command line.

1. `npm install`

1. `node app.js`

1. Open your browser to http://localhost:8666/

## Optional — deploy to Heroku

If you're deploying to Heroku, you probably want to configure your app with environment variables instead. Try this:

    heroku config:set NODE_ENV=production adn__client_id=<client_id> adn__client_secret=<client_secret> adn__scope=messages deploy__heroku=1

`deploy__heroku=1` causes the app to use Heroku environment variables for the Redis URL (assumes Redis To Go) and HTTP port.

Note that you might want to set `adn__stream_key` to a different value for your Heroku config so that your development and Heroku environments use different connections to the App.net streaming API.

Custom domains on Heroku are not currently supported, unless you have a custom SSL certificate. Please use a .herokuapp.com domain so that you can use SSL.

## Optional — multiprocess deployment

If you are running more than one process, e.g., a worker and several web nodes, you can elect to pipe stream updates through Redis. You must ensure that all processes run with the deploy:multiprocess option enabled, and **exactly one** process runs with the deploy:master flag set to a true value.
