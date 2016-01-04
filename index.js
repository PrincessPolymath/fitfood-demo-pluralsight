var Hapi = require('hapi'),
    Wreck = require('wreck'),
    path = require('path'),
    JWT = require('jwt-simple'),
    crypto = require('crypto'),
    moment = require('moment'),
    vision = require('vision'),
    Twilio = require('twilio')(process.env.TWILIOSID, process.env.TWILIOAUTHTOKEN);

    

// Create a server with a host and port
var server = new Hapi.Server({ debug: { request: ['error'] } });
server.connection({ 
    host: '0.0.0.0', 
    port: parseInt(process.env.PORT, 10)
});

// Connect to database
var Datastore = require('nedb');
var db = new Datastore({
    filename: path.join(process.env.CLOUD_DIR, 'nedb.json'),
    autoload: true
});

// Bell is a third-party authentication plugin for hapi.
// Register Fitbit as an OAuth 2.0 authentication provider:
server.register([{register: require('bell')
},{ register: require('vision')}], function(err) {
    server.auth.strategy('fitbit', 'bell', {
        provider: {
            protocol: 'oauth2',
            useParamsAuth: false,
            auth: 'https://www.fitbit.com/oauth2/authorize',
            token: 'https://api.fitbit.com/oauth2/token',
            scope: ['profile', 'activity', 'heartrate', 'location', 'nutrition','sleep'],
            profile: function(credentials, params, get, callback) {
                get('https://api.fitbit.com/1/user/-/profile.json', null, function(profile) {
                    credentials.profile = {
                        id: profile.user.encodedId,
                        displayName: profile.user.displayName,
                        name: profile.user.fullName,
                        phone: process.env.USERPHONENUMBER,
                        stepsToday: 0
                    };

                    return callback();
                });
            }
        },
        password: process.env.COOKIE_PASSWORD,
        clientId: process.env.FITBIT_OAUTH2_CLIENT_ID,
        clientSecret: process.env.FITBIT_OAUTH2_CLIENT_SECRET,
        cookie: 'bell-fitbit',
        isSecure: false // Remove if server is HTTPS, which it should be if using beyond a demo.
    });
});

// Page to start the OAuth 2.0 Authorization Code Grant Flow
server.route({
    method: 'GET',
    path:'/',
    handler: function (request, reply) {
        return reply('Go <a href="./signin">here</a> to sign in.');
    }
});

server.route({
    method: 'GET',
    path:'/signin',
    config: {
        auth: 'fitbit',
        handler: function (request, reply) {
            if (!request.auth.isAuthenticated) {
                return reply('Authentication failed due to: ' + request.auth.error.message);
            }
            
            // Set the key for this database record to the user's id
            request.auth.credentials._id = request.auth.credentials.profile.id;
            
            // Save the credentials to database
            db.update(
                {_id: request.auth.credentials.profile.id}, // query
                request.auth.credentials, // update
                {upsert: true}, // options
                function(err, numReplaced, newDoc) {
                    if (err) {
                        return reply(err).code(500);
                    }

                    // Subscribe to Activity Data
                    Wreck.post('https://api.fitbit.com/1/user/-/activities/apiSubscriptions/' + request.auth.credentials.profile.id + '.json',
                        {
                            headers: {
                                Authorization: 'Bearer ' + request.auth.credentials.token
                            },
                            json: true
                        },
                        function(err, response, payload) {
                            if (err) {
                                return reply(err).code(500);
                            }

                            // Finally respond to the request
                            return reply('Signed in as ' + request.auth.credentials.profile.displayName);
                        }
                    );
                }
            );
        }
    }
});

// Callback page at the end of the authorization flow
server.route({
    method: 'GET',
    path:'/auth-callback',
    handler: function(request, reply) {
        return reply('Signed in as ' + request.auth.credentials.profile.displayName);
    }
});

// Callback page at the end of the authorization flow
server.route({
    method: 'GET',
    path:'/phone',
    handler: function(request, reply) {
        return reply.render('phone.ejs');
    }
});


// Add the route to receive and process webhook requests
server.route({
    method: 'POST',
    path:'/webhook-receiver',
    config: {
        payload: {
            output: 'data',
            parse: false
        }
    },
    handler: function (request, reply) {
        reply().code(204);
        // Verify request is actually from Fitbit
        // https://dev.fitbit.com/docs/subscriptions/#security
        var requestHash = crypto.createHmac('sha1', process.env.FITBIT_OAUTH2_CLIENT_SECRET+'&').update(request.payload.toString()).digest('base64');
        
        if (requestHash !== request.headers['x-fitbit-signature']) {
            return console.error('Invalid subscription notification received.');
        }
        var stuff = JSON.parse(request.payload.toString());
        //console.log (stuff[0]);
        
        // Process this request after the response is sent
        setImmediate(processWebhookNotification, JSON.parse(request.payload.toString()));
    }
});

function processWebhookNotification(notifications) {
    // Multiple notifications may be received in a request
    // TODO: Handle more than one notification
    
    // Lookup the auth credentials of the user
    getAccessTokenByUserId(
        notifications[0].ownerId,
        function(err, authCredentials) {
            console.log('Doing something with the credentials...', authCredentials);
            activitypath = 'https://api.fitbit.com/1/user/-/activities/date/' + moment().subtract(8, 'hours').format('YYYY-MM-DD') + '.json';
            sleeppath = 'https://api.fitbit.com/1/user/-/sleep/date/' + moment().subtract(8, 'hours').format('YYYY-MM-DD') + '.json';
            function fitbit_oauth_getP(path, token) {
                return new Promise (function(resolve, reject) {
                console.log ("Requesting " + path)
                Wreck.get(path,
                        {
                            headers: {
                                Authorization: 'Bearer ' + token
                            },
                            json: true
                        },
                    function(err, response, payload) {
                        if (err) {
                            reject(err);
                        }
                        resolve(payload);
                }
            );
            })};

            Promise.all([
                         fitbit_oauth_getP(activitypath, authCredentials.token),
                         fitbit_oauth_getP(sleeppath, authCredentials.token)])
                         .then(function(arrayOfResults) {
			console.log(moment().subtract(8,'hours').format("H"))
                        console.log(arrayOfResults);
                        activityObject = arrayOfResults[0];
                        sleepObject = arrayOfResults[1];

                        // Check to see it's at least 9AM

			hours = moment().subtract(8,'hours').format("H");
			console.log(hours);
                        if (hours < 9 || hours > 20) {
                            return;
                        }
                        percentageCheck = (hours-8) * 8.25;
                        // Check to make sure we have a new number of steps
                        if (authCredentials.profile.stepsToday == activityObject.summary.steps) {
                            return;
                        }


                        db.findOne({_id: notifications[0].ownerId}, function(err, doc) {
                            if (err) {
                                throw new Error(err);
                            }
                            doc.stepsToday = activityObject.summary.steps

                            db.update(
                                {_id: doc._id}, // query
                                doc, // update
                                {}, // options
                                function(err, numReplaced, newDoc) {
                                    if (err) {
                                        throw new Error(err);
                                }
                            })
                        });

                        // Get the todaySteps and todayProtein from the creds
                        // Set up the percentages for checking
                        var stepsPercentage = activityObject.summary.steps / activityObject.goals.steps * 100;
                        console.log("Steps percentage: " + stepsPercentage);
                        console.log("Percentage check: " + percentageCheck);
                        console.log ("Today's steps: " + activityObject.summary.steps);
                        console.log("Goal steps: " + activityObject.goals.steps);
                        
                        var smsBody = '';
                        if (stepsPercentage < percentageCheck) {
                            var stepsRemaining = activityObject.goals.steps - activityObject.summary.steps;
                            smsBody += 'Get Moving! ' + stepsRemaining + ' steps to go today. ' + stepsPercentage + '% of the way there!\n';
                        }

                        if (smsBody != '') {
                            console.log("Twilio.sendSms", authCredentials.profile.phone, smsBody);
                            sendSMS(authCredentials.profile.phone, smsBody);
                        }

                        console.log("Fitbit Got Activities and Food");
            });
        }
    );
}

// Fitbit Web API OAuth 2.0 access tokens expire frequently and must be refreshed
function getAccessTokenByUserId(userId, cb) {
    db.findOne({_id: userId}, function(err, doc) {
        if (err) {
            throw new Error(err);
        }

        // Check to see if the token has expired
        var decodedToken = JWT.decode(doc.token, null, true);

        if (Date.now()/1000 > decodedToken.exp) {
            // Token expired, so refresh it.
            Wreck.post('https://api.fitbit.com/oauth2/token',
                {
                    headers: {
                        Authorization: 'Basic ' + new Buffer(process.env.FITBIT_OAUTH2_CLIENT_ID + ':' + process.env.FITBIT_OAUTH2_CLIENT_SECRET).toString('base64'),
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    json: true,
                    payload: 'grant_type=refresh_token&refresh_token=' + doc.refreshToken
                },
                function(err, response, payload) {
                    if (err) {
                        throw new Error(err);
                    }

                    // Save the new token
                    doc.token = payload.access_token;
                    doc.refreshToken = payload.refresh_token;

                    db.update(
                        {_id: doc._id}, // query
                        doc, // update
                        {}, // options
                        function(err, numReplaced, newDoc) {
                            if (err) {
                                throw new Error(err);
                            }

                            return cb(null, doc);
                        }
                    );
                }
            );
        } else {
            return cb(null, doc);
        }
    });
}


function sendSMS(to, message) {
    console.log("Sending SMS");
    Twilio.sendMessage(
        {
            to: to,
            from: process.env.TWILIOPHONENUMBER,
            body: message
        },
        function(err, responseData) {
            if (err) {
                console.error("Error sending SMS:", err);
            } else {
                console.log("SMS sent:", to, message);
            }
        }
    );
};

// Start the server
server.start(function () {
    console.log('Server running at:', server.info.uri);
});
