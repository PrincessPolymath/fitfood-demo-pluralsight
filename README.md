This is a proof-of-concept example for tying several APIs together, based on Jeremiah Cohick's fitbit-hapi-demo.  It will be adapted to add libraries, and break out the code, but for now it is simply a walk-through of my demo at Full Stack London.

It uses:
- Fitbit
- Twilio (to send SMS's to remind you to step it up when you're lagging)

For the OAuth piece:
This is a proof of concept example for using the Fitbit Web API. It demonstrates:
- Obtaining consent from a user to make requests to the Fitbit Web API using OAuth 2.0 Authorization Code Flow
- Subscribing to changes in the user's activity data
- Receiving notifications when the user's activity data is updated

I'm serious. This is not a well structured Node.js application.

This example app uses NeDB, a flat-file database similar to Mongo. It's meant to be easy to demo, not highly scalable.

This example assumes you're using Node.js 4.2.x

# To get started

`npm install`

## Fitbit Web API client settings at https://dev.fitbit.com/app

Set your OAuth redirect URI to:
<your server here>/signin

Set your subscriber endpoint URI to:
<your server here>/webhook-receiver


# To run on Modulus:

Set the environment variables using the instructions at http://help.modulus.io/customer/portal/articles/1701180-using-environments-variables
* FITBIT_OAUTH2_CLIENT_ID
* FITBIT_OAUTH2_CLIENT_SECRET
* COOKIE_PASSWORD

# Get a Twilio account from www.twilio.com, and set the following variables in modulus:
* TWILIOSID
* TWILIOAUTHTOKEN
* TWILIOPHONENUMBER

(PORT and CLOUD_DIR will be automatically added by Modulus)

How non-ephemeral file storage (used by NeDB) works on Modulus:
http://help.modulus.io/customer/en_us/portal/articles/1653448-file-storage
