# superpowered shell in lambda (js il talk)

welcome to everyone from JSil - this is the code that goes with the talk


## agenda

- feature spec
- cloud architecture
- ffmpeg command
- child process from node
- download from / upload to S3
- packing ffmpeg into zip
- uploading with security
- login -> jwt cookie
- loading videos / images from S3 with cookie + lambda JWT + api gateway
- drag and drop front end
- putting the video back together in another lambda



### feature spec

we want to build a web video editor that works from the browser

of course though, we can't really do video editing in the browser (waits for someone to prove me wrong...)

so what we'll do instead is to edit the videos in earnest in lambda using a child process ffmpeg, with the front end simply issuing the commands

for simplicity, we will allow the user to upload short clips (< 3 Mb), arrange a few (3-5) in order, and receive a combined video with their clips concatenated together.

---

furthermore, we'll need a visualization of the videos for the user to move around in the webview

for that, we'll use stills captured from the videos when they are uploaded (also from a child process in lambda)

those stills will have to be saved to s3 when the video is uploaded (by a lmbda which is triggered by the upload)

---

furthermore, each of the processes will be secured by a cookie jwt (uploading video, downloading images and video) through API gateway + lambda


(( wireframes and arch diagrams ))


### cloud architecture

( insert image here ... )



## coding ffmpeg to run locally

### ffmpeg command

https://trac.ffmpeg.org/wiki/Create%20a%20thumbnail%20image%20every%20X%20seconds%20of%20the%20video


`ffmpeg -i assets/five.mp4 -vf fps=1 assets/out%d.png`


let's run that from javascript

`$ touch index.js`


<sub>./index.js</sub>
```js
const { spawn } = require('child_process');

const proc = spawn('ffmpeg', [
  '-i', 'assets/five.mp4', '-vf', 'fps=1', 'assets/out%d.png'
]);

proc.on('close', (code)=>{
  console.log(code);
});
```


### structuring our lambda

AWS lambda will expect our `index.js` to export a function, which it will call in a specified way


<sub>./index.js</sub>
```js
const { spawn } = require('child_process');

exports.handler = (event, context, callback)=> {

  const proc = spawn('ffmpeg', [
    '-i', 'assets/five.mp4', '-vf', 'fps=1', 'assets/out%d.png'
  ]);

  let err = '';
  proc.stderr.on('data', e=> err += e);
  
  proc.on('close', code=>
    code ? context.fail(err) : context.succeed()
  );
};

```

a few things to take note of here

- `exports.handler` is where AWS will take our function from
- `proc.stderr.on`... will save all the error output (if any)
- when the process finishes, we call either `context.fail` or `context.succeed`
- `context` is an object AWS calls our function with which gives us these functions (like req / res in express)



### testfile


Now we can write a test file which will call our function the way AWS will


`$ touch test.js`

<sub>./test.js</sub>
```js
const filmSplitter = require('./');

filmSplitter.handler('event', {
  fail: err => console.error(err),
  succeed: ()=> console.log('success!'),
});
```

so now we can test the code

`$ npm init -y`


<sub>./package.json</sub>
```js
//...
  "scripts": {
    "test": "node test.js"
  },
//...
```


we should be careful to note here that the AWS runtime will not download our dependencies we list in `package.json`

we will however use it locally to install `AWS`, the js SDK, in order to test the S3 download and upload features

we will need to package `ffmpeg` into our lambda manually (as opposed to using the npm-module version available)



### reading the filename from the event


when we trigger our lambda from an S3 upload event, AWS will send us the necessary information about the bucket and file-key in the `event` parameter


<sub>./index.js</sub>
```js
const AWS = require('aws-sdk');

const { spawn } = require('child_process');
const fs = require('fs');

const s3 = new AWS.S3();


exports.handler = (event, context, callback)=> {

  const FROM_BUCKET = event.Records[0].s3.bucket.name;
  const Key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
  const KeySlug = Key.replace('.mp4', '');
  
  //...
```


and we can now download the file from S3

```js
  const tmp = './assets';

  (new Promise((resolve, reject)=>
    s3.getObject(downloadParams, (err, response)=>{
      if( err ) return reject(err);
    
      fs.writeFile(tmp+'/'+Key, response.Body, err=>
        err ? reject(err) : resolve()
      )
    })
  ))
```


for this to work though, we'll need to temporarily put our AWS API key into our S3 config

and we'll need to remember to change the `tmp` directory in the lambda runtime to '/tmp' and commit a .gitkeep


for local testing, all we need to do to get this running is to wait for the download before running the child process

```js
//...

exports.handler = (event, context, callback)=> {

  const FROM_BUCKET = event.Records[0].s3.bucket.name;
  const Key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
  const KeySlug = Key.replace('.mp4', '');

  // download the file from s3
  const downloadParams = { Bucket: FROM_BUCKET, Key };

  (new Promise((resolve, reject)=>
    s3.getObject(downloadParams, (err, response)=>{
      if( err ) return reject(err);

      fs.writeFile(tmp+'/'+Key, response.Body, err=>
        err ? reject(err) : resolve()
      )
    })
  )).then(()=> {
    
    const proc = spawn('ffmpeg', [
      '-i', tmp+'/'+Key, '-vf', 'fps=1', tmp+'/'+KeySlug + '-out%d.png'
    ]);

    let err = '';
    proc.stderr.on('data', e=> err += e);
    
    proc.on('close', code=>
      code ? context.fail(err) : context.succeed()
    );
  }).catch(err => context.fail(err));
};
```

now we just need a file in the cloud to test this with!



### making an s3 bucket

open up the [aws console](aws.amazon.com)

now we can hit create button (image of console)


we'll fill in the form (images of form)

leaving everything to default, we'll limit access to our files to only explicitly allowed requests


once we're done, we can upload a test mp4 file (upload, uploaded images)



### testing s3 locally 

let's set the file we just uploaded as the test event

<sub>./test.js</sub>
```js
const filmSplitter = require('./');

filmSplitter.handler({
  "Records":[
    {
      "s3": {
        "bucket": { "name": "lambda-film-talk" },
        "object": {
          "key": "five.mp4"
        }
      }
    }
  ]
}, {
  fail: err => console.error(err),
  succeed: ()=> console.log('success!'),
});
```

we must remember to `$ yarn add aws-sdk` locally

lambda will have this dependency available without installation, but we will need to install it locally to test.


and we must load our credentials locally (again, lambda will have these automatically available in the cloud runtime)


<sub>./index.js</sub>
```js
const AWS = require('aws-sdk');

const { spawn } = require('child_process');
const fs = require('fs');

const credentials = new AWS.SharedIniFileCredentials({
  profile: 'default'
});
AWS.config.credentials = credentials;

const s3 = new AWS.S3();

//...
```

we'll remember to use a config flag to not do this on the cloud


this depends on there being default AWS credentials on your dev machine

usually you'll put them there by installing the aws-cli

[installing the cli](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html)

[configuring credentials in the cli](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html)


now when we run our test we get...


`success!`


and when we look in our assets directory, we'll see the input.mp4 that has been downloaded, and the output images


last thing before we upload to the cloud: let's upload automatically to s3


first, we'll have to refactor our child_process to work in a Promise




<sub>./index.js</sub>
```js

exports.handler = (event, context, callback)=> {

  const FROM_BUCKET = event.Records[0].s3.bucket.name;
  const Key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
  const KeySlug = Key.replace('.mp4', '');

  // download the file from s3
  const downloadParams = { Bucket: FROM_BUCKET, Key };

  (new Promise((resolve, reject)=>
    s3.getObject(downloadParams, (err, response)=>{
      if( err ) return reject(err);

      fs.writeFile(tmp+'/input.mp4', response.Body, err=>
        err ? reject(err) : resolve()
      )
    })
    
  )).then(()=> (
    new Promise((resolve, reject)=> {
    
      const proc = spawn('ffmpeg', [
        '-i', tmp+'/'+Key, '-vf', 'fps=1', tmp+'/'+KeySlug+'-out%d.png'
      ]);

      let err = '';
      proc.stderr.on('data', e=> err += e);
      
      proc.on('close', code=>
        code ? reject(err) : resolve()
      );
    }))
    
  ).then(()=> context.succeed())
   .catch(err => context.fail(err))

};

```



then we can chain another Promise on to upload the results to another S3 (which we need to make)

```js

const TO_BUCKET = 'lambda-film-talk-output';

```


first, we'll `fs.readdir` to get the list of output files



<sub>./index.js</sub>
```js

exports.handler = (event, context, callback)=> {

   //...
    
  ).then(()=> (
    new Promise((resolve, reject)=>
      fs.readdir(tmp, (err, files)=>
        err ?
        reject(err) :
        resolve(
          files.filter(file => (
            ~file.indexOf('out') &&
            ~file.indexOf(KeySlug) &&
            file.lastIndexOf('.png') === (file.length - 4)
          ))
        )
      )
    ))
  ).then(()=> context.succeed())
   .catch(err => context.fail(err))

};

```


then we can upload them all in a `Promise.all`



<sub>./index.js</sub>
```js

exports.handler = (event, context, callback)=> {

   //...
    
  ).then(filesToUpload=> Promise.all(
    filesToUpload.map(filename=> (
      new Promise((resolve, reject)=>

        fs.readFile(tmp + '/' + filename, (err, filedata)=> {
          if( err ) return reject(err);

          s3.putObject({
            Bucket: TO_BUCKET,
            Key: filename,
            Body: filedata,
            
          }, (err, response)=>
            err ? reject(err) : resolve()
          );
        })
      ))
    ))
  ).then(()=> context.succeed())
   .catch(err => context.fail(err))

};

```



## cloud integration


what we'll need to do to prepare our lambda for running in the cloud is:

 - move all local-config dependent values to separate config files for cloud / local
 - only load SharedIniFileCredentials when in local mode
 - commit a .gitkeep in the tmp directory we'll use in the cloud
 - package (zip using git) ffmpeg and its dependencies together with our lambda as a layer
   - https://dev.to/hmschreck/building-a-super-cheap-transcoder-using-aws-lambda-1j76
   - https://devopstar.com/2019/01/28/serverless-watermark-using-aws-lambda-layers-ffmpeg/



 - move all local-config dependent values to separate config files for cloud / local
 - only load SharedIniFileCredentials when in local mode
 
`$ touch config-local.json`

`$ touch config-lambda.json`

<sub>./package.json</sub>
```js
//...

  "scripts": {
    "test": "MODE=LOCAL node test.js"
  },

//...
```

<sub>./config-lambda.json</sub>
```js
{
  "tmp": "/tmp",
  "TO_BUCKET": "lambda-film-talk-output"
}
```

<sub>./config-local.json</sub>
```js
{
  "tmp": "./assets",
  "TO_BUCKET": "lambda-film-talk-output"
}
```


<sub>./index.js</sub>
```js
//...

let tmp, TO_BUCKET;

if( process.env.MODE === 'LOCAL' ){
  const credentials = new AWS.SharedIniFileCredentials({
    profile: 'default'
  });
  AWS.config.credentials = credentials;

  const localConfig = require('./config-local.json');
  tmp = localConfig.tmp;
  TO_BUCKET = localConfig.TO_BUCKET;

} else {
  const lambdaConfig = require('./config-lambda.json');
  tmp = lambdaConfig.tmp;
  TO_BUCKET = lambdaConfig.TO_BUCKET;
}

//...
```

now we can have whatever configuration different locally and in the cloud


- commit a .gitkeep in the tmp directory we'll use in the cloud

`$ mkdir tmp`

`$ touch tmp/.gitkeep`

`$ git add tmp/.gitkeep`

now when we run this in the cloud, there'll be a directory to keep temporary files



 - package (zip using git) ffmpeg and its dependencies together with our lambda as a layer

https://linuxize.com/post/how-to-install-ffmpeg-on-ubuntu-18-04/

`$ which ffmpeg`

`$ which ffprobe`

cp the two files resulting from those commands into a directory, and make a zip of them


then, in the lambda console, navigate to the `layers` page, create a new layer

upload the zip you just made

copy the arn, and add it to layers


once that's done, we'll want to test that the programs are available

we can edit our lambda inline with

<sub>LAMBDA: film-stills</sub>
```js
exports.handler = (event, context) => {

  const ls = require('child_process').spawn('/opt/ffmpeg/ffmpeg', ['-version']);
    
  ls.stdout.on('data', d=> console.log(d.toString()));

  ls.on('close', code=> code ? context.fail(code) : context.succeed());     
};
```

if everything worked, this should print out the current version of ffmpeg


now we should set a config var for the location of ffmpeg on the system

<sub>./config-local.json</sub>
```js
{
  "tmp": "./assets",
  "TO_BUCKET": "lambda-film-talk-output",
  "ffmpeg": "ffmpeg"
}
```

<sub>./config-lambda.json</sub>
```js
{
  "tmp": "/tmp",
  "TO_BUCKET": "lambda-film-talk-output",
  "ffmpeg": "/opt/ffmpeg/ffmpeg"
}
```


<sub>./index.js</sub>
```js
//...

let tmp, TO_BUCKET, ffmpeg;

if( process.env.MODE === 'LOCAL' ){
  const credentials = new AWS.SharedIniFileCredentials({
    profile: 'default'
  });
  AWS.config.credentials = credentials;

  const localConfig = require('./config-local.json');
  tmp = localConfig.tmp;
  TO_BUCKET = localConfig.TO_BUCKET;
  ffmpeg = localConfig.ffmpeg;

} else {
  const lambdaConfig = require('./config-lambda.json');
  tmp = lambdaConfig.tmp;
  TO_BUCKET = lambdaConfig.TO_BUCKET;
  ffmpeg = lambdaConfig.ffmpeg;
}

//...


      const proc = spawn(ffmpeg, [
        '-i', tmp+'/'+Key, '-vf', 'fps=1', tmp+'/'+KeySlug+'-out%d.png'
      ]);


//...
```


### running in the cloud

 - upload the zip (with all dependency layers)
 - configure the lambda to be triggered by upload to the s3
 - apply permissions to the lambda which will allow it to read from, write to the s3 buckets
 - test by uploading some files


now that our program works locally, we want to upload it to the AWS lambda console

first, we'll make a zip file, which we can upload


 - upload the zip (with all dependency layers)


`$ git archive -o lambda.zip HEAD`


now we can upload the zip file to the lambda console


and set a test event

```js
{
  "Records":[
    {
      "s3": {
        "bucket": { "name": "lambda-film-talk" },
        "object": {
          "key": "five.mp4"
        }
      }
    }
  ]
}
```

(in the test event menu... pic)


####
 - configure the lambda to be triggered by upload to the s3

(pics)




now we need permissions for our lambda to read / write to the s3 buckets



### permissions


#### apply permissions to the lambda which will allow it to read from, write to the s3 buckets

IAM console ... roles ... create role ... lambda



make a policy


```js
{
    "Version": "2012-10-17",
    "Statement": [
{
            "Effect": "Allow",
            "Action": [
                "s3:ListAllMyBuckets",
                "s3:GetBucketLocation"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": "s3:*",
            "Resource": [
                "arn:aws:s3:::lambda-film-talk",
                "arn:aws:s3:::lambda-film-talk/*",
                "arn:aws:s3:::lambda-film-talk-output",
                "arn:aws:s3:::lambda-film-talk-output/*"
            ]
        }
    ]
}
```

and select it for your role


in the lambda console, set the Execution Role (pic) to the role you just made







#### test by uploading some files

... in the s3 console



now we should see the files come out in the other bucket!






## cloud security

 - api gateway + lambda -> jwt cookie login
 - lambda jwt cookie authenticator
 - loading the video / images using the cookie (html5 video tag / img tag)
 - https://aws.amazon.com/blogs/compute/simply-serverless-using-aws-lambda-to-expose-custom-cookies-with-api-gateway/



#### api gateway + lambda -> jwt cookie login

now that our videos get processed automatically, we want to let our users do the uploading!



to accomplish this, we will use API gateway

https://us-west-2.console.aws.amazon.com/apigateway/home

we'll hit 'create api' --> REST + name


(Actions) -> create resource

login, login, enable CORS


(Actions) -> create method, POST

lambda + lambda proxy


---> here we need a login lambda!

https://us-west-2.console.aws.amazon.com/lambda

open up a new tab to make a lambda, we can call it "film-login"

we're not focusing too much on how to build a login system,

so for now, all we'll do is use node's `crypto` package to make a passwordHash to test

(normally we'd test this against a database, but this isn't a talk about how to build a user management system!)


<sub>LAMBDA: film-login<sub>
```js
exports.handler = (event, context) => {
    const expectedHash = '09af4adb971614bcc054eea17fbcfbb5a6f0d95926c99608e5b60c17c426a6c3d448b368315d55d85d9e171c6da6670fe34caf8a920c41e3db08d346f82456f0'; // don't do this
    
    const passwordHash = require('crypto').pbkdf2Sync(JSON.parse(event.body).password, 'secret code', 100, 64, 'sha512').toString('hex');
                                 
                             
    if( passwordHash === expectedHash ){
        const response = {
            statusCode: 200,
            body: JSON.stringify('Hello from Lambda!'),
            headers: {'Set-Cookie': 'token=some-token' }
        };
        
        context.done(null, response);
    } else {
        const response = {
            statusCode: 401,
            headers: {'Set-Cookie' : 'token=null'}
        };
        context.done(null, response);
    }
};

```


back in API Gateway,

type in the name of the lambda and hit ok to set this lambda on this API (POST /login)


in the Resources -> /login -> POST -> Method Response we need to add a Cookie header

<img src='http://awscomputeblogmedia.s3.amazonaws.com/apigw_cookies_method_response.png' />




now we want to deploy the api to test it

(Actions)-> Deploy API -> New stage (test, test, test)-> Deploy


to get the url of this endpoint, (Stages)-> test -> /login -> POST ... "invoke URL"


now from POSTMAN, wee can make a POST request to the endpoint we just copied

the password for the hash in the example code here is (of course) "guest", so our body should be

```js
{
	"password": "guest"
}
```

we should see a 200 and a cookie come back when we have the right password

when we test our API with the wrong password, we should see our token Cookie set back to null with a 401 response.

now, with our cookie, we're ready to authenticate future requests


#### actual jwt

earlier, we sent back a static cookie (`token=some-token`), which isn't very secure!

let's zip our lambda with npmjs.org/package/jsonwebtoken to be able to really prevent fraud

(lambda won't install your npm modules like heroku does. we need to zip everything to get it to work)



`$ cd ~/code`

`$ mkdir lambda-film-login`

`$ cd lambda-film-login`

`$ touch index.js`

`$ npm init -y`

`$ git init`

`$ npm i jsonwebtoken`

<sub>./index.js</sub>
```js
const jwt = require('jsonwebtoken');

exports.handler = (event, context) => {
  const expectedHash = '09af4adb971614bcc054eea17fbcfbb5a6f0d95926c99608e5b60c17c426a6c3d448b368315d55d85d9e171c6da6670fe34caf8a920c41e3db08d346f82456f0'; // don't do this
  
  const passwordHash = require('crypto').pbkdf2Sync(JSON.parse(event.body).password, 'secret code', 100, 64, 'sha512').toString('hex');
  
  
  if( passwordHash === expectedHash ){

    jwt.sign({ username: 'nik' }, 'jwt secret code', (err, token)=>{
      const response = {
        statusCode: 200,
        body: JSON.stringify('Hello from Lambda!'),
        headers: {'Set-Cookie': 'token='+token }
      };
      
      context.done(null, response);
    });
    
  } else {
    const response = {
      statusCode: 401,
      headers: {'Set-Cookie' : 'token=null'}
    };
    context.done(null, response);
  }
};
```

now after we check our password, we create a jwt, which we will respond with in the cookie


to deploy this new code, we'll need to generate a zip file (which I do with `git`)

`$ git add .`

`$ git commit -am "init lambda-film-login with jwt"`

push to github probably

`$ git archive -o lambda.zip HEAD`

now we can upload the zip file to the lambda console


(pics)



I usually delete the zip file (to avoid tracking it) after I've uploaded it


now when we do our test from POSTMAN, we should see the jwt come back in the cookie!

this is (besides for the password and jwt secret key being hardcoded) very much a production pattern.





#### lambda jwt cookie authenticator

now that we can make requests from POSTMAN with our cookie, we should make a route protected with an authorizer

in lambda, create a new function named film-authorizer

and same as last time

`$ cd ~/code`

`$ mkdir lambda-film-authorizer`

`$ cd lambda-film-autorizer`

`$ touch index.js`

`$ npm init -y`

`$ git init`

`$ npm i jsonwebtoken`


now we'll write a lambda that checks the jwt


<sub>./index.js</sub>
```js
const jwt = require('jsonwebtoken');

exports.handler =  function(event, context, callback) {
  const cookie = event.authorizationToken;
  
  const token = cookie.match(/(;|^)\s*token=[a-zA-Z0-9_\-\.]+(;|$)/)[0].split('token=')[1];
  
  jwt.verify(token, 'jwt secret code', (err, decoded)=>{
    if( err ) return callback(null, generatePolicy('user', 'Deny', event.methodArn));
    else {
      callback(null, generatePolicy('user', 'Allow', event.methodArn));
    }
  });
};

var generatePolicy = function(principalId, effect, resource) {
  var authResponse = {};
  
  authResponse.principalId = principalId;
  if (effect && resource) {
    var policyDocument = {};
    policyDocument.Version = '2012-10-17'; 
    policyDocument.Statement = [];
    var statementOne = {};
    statementOne.Action = 'execute-api:Invoke'; 
    statementOne.Effect = effect;
    statementOne.Resource = resource;
    policyDocument.Statement[0] = statementOne;
    authResponse.policyDocument = policyDocument;
  }
  
  return authResponse;
}
```

note we've used the same hard-coded jwt secret code here.


`$ git add .`

`$ git commit -am "init lambda-film-authorizer with jwt"`

push to github probably

`$ git archive -o lambda.zip HEAD`

now we can upload the zip to the lambda console as before.




in API Gateway ... (Authorizers)-> Create New Authorizer

(pic)


and apply it to a new route (( here we'll make the lambda that we'll program later to sign uploads to s3 ))

(Resources)-> (Actions)-> Create Resource... (s3-upload, s3-upload, enable CORS)... Create Resource

(Actions)-> Create Method -> POST

Enable Proxy integration

... in lambda, we'll make a new function named film-s3-upload ...

we can leave that lambda as default until the next step when we program it to sign uploads


... back in API Gateway ...

set the lambda function on the method to film-s3-upload (which we just made)

(Resources)-> /s3-upload -> POST ...-> Method Request

Authorization ---> film-authorizer (hit the little check mark)



let's deploy the API

(Actions)-> Deploy API


now we're ready to test our cookie authorizer


NOTE --- if you make a bug or mistake in the authorizer and re-upload it after deploying the API, you'll have to re-deploy the API in order to use the new copy of the lambda!



now, when we make a request to the s3-upload endpoint with the Cookie from a successful login, we should see a 200 response

when we make a request without a valid cookie, we should see a 403




#### loading the video / images using the cookie (html5 video tag / img tag)

now that we have a lambda cookie jwt auth system, let's make our assets (images & video) available by writing another lambda to load them



(Actions)-> create resource, (files, files, enable CORS)

(Actions)-> create method... GET... use Lambda Proxy integration

... over in the lambda console, let's make another lambda to download the files ...


```js
const AWS = require('aws-sdk');

const s3 = new AWS.S3();

exports.handler = (event, context) => {
    const params = {
      "Bucket": "lambda-film-talk-output",
      "Key": event.queryStringParameters.key  
    };
    
    s3.getObject(params, (err, data)=>{
        if(err) {
           context.done(err, null);
        } else {
            const response = {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "image/png"
                },
                "body": data.Body.toString('base64'),
                "isBase64Encoded": true
            };
    
            context.done(null, response);
        }
    });
    
};
```

in method request we can set the authorizer as before


and in (Settings)-> Binary Media Types, add */*



---


now when we make requests (from the browser) with a cookie, we'll receive the image / video

without, we will receive an unauthorized message.


it may be useful to use a cookie extension for chrome to achieve this (I have problems viewing images in POSTMAN)

certainly, it helped me while I was debugging my code & cloud architecture.




## front end upload

 - s3 signed url uploads, using our jwt security from before
 - futch (upload progress)
 - lambda sed (lambda-film-talk-upload -> lambda-film-talk)
 - deploying the s3 signer lambda


#### s3 signed url uploads, using our jwt security from before

We want to allow our users to upload video files to be able to edit (that's the whole point of this workshop!)

Amazon S3 is more efficient to upload the files to directly (rather than streaming them through a costly lambda)

But we need to use API Gateway & Lambda Authorizer to secure our upload...


So AWS has a solution just for us! We'll write a lambda (of course) which makes a pre-signed S3 upload URL



`$ cd ~/code`

`$ mkdir lambda-film-s3-signer`

`$ cd lambda-film-s3-signer`

`$ git init`

`$ npm init -y`

`$ npm i aws-sdk`

`$ touch index.js`

`$ touch test.js`

`$ touch config-local.json`

`$ touch config-lambda.json`


LAMBDA: film-s3-signer
<sub>./index.js</sub>
```js
const AWS = require('aws-sdk');

let TO_BUCKET;

if( process.env.MODE === 'LOCAL' ){
  const credentials = new AWS.SharedIniFileCredentials({
    profile: 'default'
  });
  AWS.config.credentials = credentials;
  AWS.config.region = 'us-west-2';
  
  const localConfig = require('./config-local.json');
  TO_BUCKET = localConfig.TO_BUCKET;
} else {
  const lambdaConfig = require('./config-lambda.json');
  TO_BUCKET = lambdaConfig.TO_BUCKET;
}

const s3 = new AWS.S3();

exports.handler = (event, context) => 
  s3.getSignedUrl('putObject', {
    Bucket: 'lambda-film-talk-upload',
    Key: event.filename,
    ContentType: 'multipart/form-data',
    Expires: 300
  }, (err, url)=>
    (err)? context.fail(err): context.succeed(url)
  );

```

NOTE:: the ContentType is set to 'multipart/form-data' because that's the kind of file upload we'll do




<sub>./config-local.json</sub>
```js
{
  "TO_BUCKET": "lambda-film-talk-upload"
}
```

<sub>./config-lambda.json</sub>
```js
{
  "TO_BUCKET": "lambda-film-talk-upload"
}
```

you may notice that these are the same so far. Mostly it's good practice to keep our lambdas consistent in file organization.


<sub>./package.json</sub>
```js
//...

  "scripts": {
    "test": "MODE=LOCAL node test.js"
  },

//...
```


<sub>./test.js</sub>
```js
const uploadSigner = require('./');

uploadSigner.handler({
  filename: 'some-video.mp4'
}, {
  fail: err => console.error(err),
  succeed: url=> console.log('success!', url),
});
```


now we can test it!

`$ npm test`



now we should go make that S3 Bucket and test uploading something to it.

we'll also need to set the CORS policy of the bucket to be able to test the uploads from our local env




### futch (upload progress)
 
let's start by creating a react app (finally!)


`$ cd ~/code`

`$ npx create-react-app lambda-film-studio`

<sub>~/code/lambda-film-studio/src/App.js</sub>
```js
import React, { useState } from 'react';
import './App.css';

function App() {
  const [ isLoggedIn, setIsLoggedIn ] = useState(false);
  const [ password, setPassword ] = useState('');

  const login = ()=> Promise.resolve().then(()=> setIsLoggedIn( true ));
  
  return (
    <div className="App">
      <header className="App-header">
        { !isLoggedIn ? (
            <>
              <label>
                What's the password?
                <input onChange={e=> setPassword(e.target.value)} value={password} type='password'/>
              </label>
              <button onClick={login}>Log in</button>
            </>
        ): (
            <div>Logged In</div>
        )}
      </header>
    </div>
  );
}

export default App;
```

<sub>./src/App.css</sub>
```css
.App {
  text-align: center;
}

.App-header {
  background-color: #282c34;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: calc(10px + 2vmin);
  color: white;
}


label {
  display: flex;
  flex-direction: column;
}

label input {
  margin: 10px;
  font-size: 2rem;
  border-radius: 5px;
}

button {
  margin: 30px;
  padding: 10px;
  border-radius: 5px;
  outline: none;
}
```

for now, we'll fake the log in and use a url from our test environment


let's use a common fetch-uploadProgress shim called futch (from [this comment](https://github.com/github/fetch/issues/89#issuecomment-256610849))

`$ touch src/futch.js`

<sub>./src/futch.js</sub>
```js
export const futch = (url, opts = {}, onProgress) => {
  return new Promise((res, rej) => {
    var xhr = new XMLHttpRequest();
    xhr.open(opts.method || "get", url);
    for (var k in opts.headers || {}) xhr.setRequestHeader(k, opts.headers[k]);
    xhr.onload = e => res(e.target);
    xhr.onerror = rej;
    if (xhr.upload && onProgress) xhr.upload.onprogress = onProgress;
    xhr.send(opts.body);
  });
};
```

which we'll use like so

<sub>./src/App.js</sub>
```js
//...

import { futch } from './futch';

const url = 'url from s3 signer test';

//...


  const upload = ()=>{
    const body = new FormData();
    body.append(
      'file',
      document.querySelector('input[type=file]').files[0]
    );

    futch(url, {
      method: 'PUT',
      body,
      headers: { "Content-Type": "multipart/form-data" },
      
    }, e=> {
      console.log('uploaded', e.loaded / e.total, '%');
      
    }).then(res=> console.log('upload done'))
     .catch(err=> console.log('upload failed with', err));
  };


//...

            <div className='logged-in'>
              <input type='file'/>
              <button onClick={upload}>
                Upload
              </button>
            </div>

//...
```


now we should see our file uploaded to the bucket

if you're having trouble with "signature match" failures, make sure the filename you're trying to upload is the same as that listed in <sub>./test.js</sub>




#### lambda sed (lambda-film-talk-upload -> lambda-film-talk)

When I tested this, I uploaded a `package.json` file from my local project, and when I downloaded it from the S3, I found that there was a bunch of `multipart/form-data` chunk formatting in the file


<sub>package.json in s3</sub>
```js
------WebKitFormBoundaryV8LnEBbs2iHxWLYB
Content-Disposition: form-data; name="file"; filename="package.json"
Content-Type: application/json

{
  "name": "film-talk",
  //...
}

------WebKitFormBoundaryV8LnEBbs2iHxWLYB--
```


which we'll definitely need to get rid of on video files if we want them to work with ffmpeg


my favourite way (and probably the fastest runtime) to cut lines out of a file is using `sed`

if you've never used `sed`, it's probably because it was written before you were born!


the command we'll want to run in a lambda is

`$ sed -i '1,4d;$d' FILENAME`

which will delete the first four lines and last line of the file (here FILENAME)


let's make a new lambda to do our file trimming

`$ cd ~/code`

`$ mkdir lambda-film-talk-trimmer`

`$ cd lambda-film-talk-trimmer`

`$ git init`

`$ npm init -y`

`$ npm i aws-sdk`

`$ touch config-local.json config-lambda.json test.js index.js`

`$ mkdir tmp`

`$ touch tmp/.gitkeep`



<sub>./index.js</sub>
```js
const AWS = require('aws-sdk');
const fs = require('fs')
const { exec } = require('child_process');


let TO_BUCKET, tmp;

if( process.env.MODE === 'LOCAL' ){
  const credentials = new AWS.SharedIniFileCredentials({
    profile: 'default'
  });
  AWS.config.credentials = credentials;
  AWS.config.region = 'us-west-2';
  
  const localConfig = require('./config-local.json');
  tmp = localConfig.tmp;
  TO_BUCKET = localConfig.TO_BUCKET;

} else {
  const lambdaConfig = require('./config-lambda.json');
  tmp = lambdaConfig.tmp;
  TO_BUCKET = lambdaConfig.TO_BUCKET;
}

const s3 = new AWS.S3();

exports.handler = (event, context) => {
  const FROM_BUCKET = event.Records[0].s3.bucket.name;
  const Key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));

  const downloadParams = { Bucket: FROM_BUCKET, Key };

  
  // download file from s3
  (new Promise((resolve, reject)=>
    s3.getObject(downloadParams, (err, response)=>{
      if( err ) return reject(err);
      
      fs.writeFile(tmp+'/input.mp4', response.Body, err=>
        err ? console.log('err',err)||reject(err) : resolve()
      )
    })
  )).then(()=>
    (new Promise((resolve, reject)=>
      exec('sed -i \'1,4d;$d\' '+tmp+'/input.mp4')
        .on('close', code=> (code ? reject(code) : resolve()))
    ))
  ).then(()=>
    (new Promise((resolve, reject)=>
      fs.readFile(tmp+'/input.mp4', (err, filedata)=> {
        if( err ) return reject(err); 

        s3.putObject({
          Bucket: TO_BUCKET,
          Key: Key,
          Body: filedata,
          
        }, (err, response) => {
          console.log(err);
          if( err ) return reject(err);

          resolve();
        });
      })
    ))
  )
  .then(()=> context.succeed())
  .catch(err=> context.fail(err))
}
```

<sub>./test.js</sub>
```js
const fileTrimmer = require('./');

fileTrimmer.handler({
  "Records":[
    {
      "s3": {
        "bucket": { "name": "lambda-film-talk-upload" },
        "object": {
          "key": "five.mp4"
        }
      }
    }
  ]

}, {
  fail: err => console.error(err),
  succeed: url=> console.log('success!', url),
});

```

<sub>./config-local.json</sub>
```js
{
  "tmp": "./tmp",
  "TO_BUCKET": "lambda-film-talk"
}
```

<sub>./config-lambda.json</sub>
```js
{
  "tmp": "/tmp",
  "TO_BUCKET": "lambda-film-talk"
}
```


<sub>./package.json</sub>
```js
//...

  "scripts": {
    "test": "MODE=LOCAL node test.js"
  },

//...
```

to test this, we'll need to upload a video file to our upload bucket through the front end


then we can test this locally now with


`$ npm test`



#### deploying the s3 signer lambda


we'll need to make sure to give permission to the lambda to PUT files into the S3 Bucket

in the [iam console](https://console.aws.amazon.com/iam/home#/policies) let's make a new policy

```js
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "ListObjectsInBucket",
            "Effect": "Allow",
            "Action": ["s3:GetObject"],
            "Resource": ["arn:aws:s3:::lambda-film-talk-upload/*"]
        },
        {
            "Sid": "AllObjectActions",
            "Effect": "Allow",
            "Action": "s3:PutObject",
            "Resource": ["arn:aws:s3:::lambda-film-talk/*"]
        }
    ]
}
```


let's hit (pic) 'View Role on IAM console'

then 'Attach Policy'

and choose the policy you just made



now we can configure it to be triggered on uploads to the upload bucket

select new trigger, S3, your upload bucket, keep the "all new object event" setting which is default




finally in order to run `sed` in a lambda, we'll have to make a layer for it with `sed`


`$ cd ~/code`

`$ mkdir sed-lambda-layer`

`$ cd sed-lambda-layer`

`$ git init`

`$ which sed`

using the output from `which`, for me /bin/sed

`$ cp /bin/sed ./`

`$ git add sed`

`$ git commit -m sed`

`$ git archive -o sed.zip HEAD`


now we can go to the [layers console](https://us-west-2.console.aws.amazon.com/lambda/home?region=us-west-2#/layers)

and upload our zip


which we'll now be able to select for our lambda




when this lambda PUTs the file into the lambda-film-talk bucket, the lambda we built first (cutting still images) will also run!



very nice!



## putting it all together

 - display film strips
 - drag and drop film strips
 - deploying our frontend in lambda
 - one more lambda to splice film together
 - https://github.com/atlassian/react-beautiful-dnd


### display film strips

to display our film cuts (which we'll be splicing together) we need to load the list of files in the S3

first, we'll build the lambda & test it in POSTMAN

then we'll make a mock network layer for our test application (which can't login because of the CORS issue)

lastly, we'll add login to the app, make a request to the real API endpoint, and deploy our app on lambda


`$ cd ~/code`

`$ mkdir lambda-film-talk-list-bucket`

`$ cd lambda-film-talk-list-bucket`

`$ git init`

`$ npm init -y`

`$ npm i aws-sdk`

`$ touch index.js test.js config-local.json config-lambda.json`

<sub>./index.js</sub>
```js
const AWS = require('aws-sdk');

let TO_BUCKET;

if( process.env.MODE === 'LOCAL' ){
  const credentials = new AWS.SharedIniFileCredentials({
    profile: 'default'
  });
  AWS.config.credentials = credentials;
  AWS.config.region = 'us-west-2';
  
  const localConfig = require('./config-local.json');
  TO_BUCKET = localConfig.TO_BUCKET;
} else {
  const lambdaConfig = require('./config-lambda.json');
  TO_BUCKET = lambdaConfig.TO_BUCKET;
}

const s3 = new AWS.S3();

exports.handler = (event, context)=>
  s3.listObjectsV2({
    Bucket: 'lambda-film-talk-output'
  }, (err, contents)=>{
    err ? context.fail(err) : context.succeed({
      statusCode: 200,
      body: JSON.stringify(contents),
      headers: { 'Content-Type': 'application/json' },
    })
  });
```

<sub>./test.js</sub>
```js
const bucketLister = require('./');

bucketLister.handler({}, {
  fail: err => console.error(err),
  succeed: items=> console.log('success!', items),
});
```

<sub>./config-local.json</sub>
```js
{
  "BUCKET": "lambda-film-talk-output"
}
```

<sub>./config-lambda.json</sub>
```js
{
  "BUCKET": "lambda-film-talk-output"
}
```

<sub>./package.json</sub>
```js
//...

  "scripts": {
    "test": "MODE=LOCAL node test.js"
  },

//...
```

we can test this on the shell again with `$ npm test`


and should see the output logged out.



let's make a lambda in the console

we can zip and upload our code the same way as last time (`git commit`, `git archive`)

now we need to grant the lambda permission to read the contents of the bucket

we can (again) in the [iam console](https://console.aws.amazon.com/iam/home#/policies) make a new policy

```js
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "ListObjectsInBucket",
            "Effect": "Allow",
            "Action": ["s3:ListBucket"],
            "Resource": ["arn:aws:s3:::lambda-film-talk-output"]
        }
    ]
}
```


hit (pic) 'View Role on IAM console'

then 'Attach Policy'

and choose the policy you just made





lastly we'll add a route to API Gateway which calls this lambda

(Actions)-> Create Resource ... film-list

(Actions)-> Create Method ... Get ... lambda proxy, selecting the lambda we just made

make sure to apply the authorizer in the Method Request sub-page


(Actions)-> Deploy API



now we should test our API from POSTMAN, and grab the output

we should see something like


```js
{
  IsTruncated: false,
  Contents: [
    {
      Key: "five-out1.png",
      LastModified: "2019-08-20T19:21:25.000Z",
      ETag: "2c8eae17e9f01eb12e1b4734c13b0440",
      Size: 693130,
      StorageClass: "STANDARD"
    },
    //...
  ],
  Name: "lambda-film-talk-output",
  Prefix: "",
  MaxKeys: 1000,
  CommonPrefixes: [ ],
  KeyCount: 18
}
```

so now in our front end (lambda-film-studio) we can make a mock network handler with some local images


`$ cd ~/code/lambda-film-studio`

`$ touch src/stub.js`


<sub>~/code/lambda-film-studio/src/stub.js</sub>
```js
export default {
    "IsTruncated": false,
    "Contents": [
        {
            "Key": "five-out1.png",
            "LastModified": "2019-08-20T19:21:25.000Z",
            "ETag": "\"2c8eae17e9f01eb5771b4734c63b0440\"",
            "Size": 693130,
            "StorageClass": "STANDARD"
        },
        //... etc, the response from your lambda API route
    ],
    "Name": "lambda-film-talk-output",
    "Prefix": "",
    "MaxKeys": 1000,
    "CommonPrefixes": [],
    "KeyCount": 18
}
```



and load the contents to render when our App mounts

```js
import React, { useState, useEffect } from 'react';
import './App.css';

import { futch } from './futch';

import stub from './stub';


const url = 'testing url';

const groupStills = allFiles => {
  const filenames = allFiles.map(file => file.Key).filter(filename=> filename.match(/-out\d+\.png/));

  const slugs = Array.from(new Set(
    filenames.map(filename=> filename.slice(0, filename.lastIndexOf('-out')))
  ));

  return slugs.map(slug => ({ slug, stills: filenames.filter(filename=> filename.match(new RegExp(slug + '-out\\d\\.png'))) }));
};



function App() {
  const [ isLoggedIn, setIsLoggedIn ] = useState(false);
  const [ password, setPassword ] = useState('');
  const [ films, setFilms ] = useState([]);
  
  const login = ()=> Promise.resolve().then(()=> setIsLoggedIn( true ));


  useEffect(()=> setFilms( groupStills(stub.Contents) ), []);

  //...
              {films.map(film => (
                <div className='film-strip' key={film.slug}>
                  <div className='edge'/>
                  <div className='strip'>
                    {
                      film.stills.map(still => (
                        <div key={still} className='cell'>
                          <img alt='' src={'YOUR API GATEWAY DOMAIN/test/files?key='+still}/>
                        </div>
                      ))
                    }
                  </div>
                  <div className='edge'/>
                </div>
              ))}


```

wonderful! the images are showing up (I'm using a cookie chrome extension to get through the authorizer)


now the fun part! we get to style the stills into film strips!


<sub>./src/App.css</sub>
```css
.film-strip {
  height: 160px;
  background-color: #5559;

  display: flex;
  flex-direction: column;
  justify-content: space-around;

  margin: 10px;
}

.film-strip .edge {
 background: repeating-linear-gradient(
    90deg,
    transparent,
    transparent 4%,
    black 4%,
    black 8%
  );
  
  height: 20px;
  margin: 5px 0;
}


.film-strip .strip {
  display: flex;
  flex-direction: row;
  margin: 0 20px;
}

.film-strip .cell {
  display: flex;
  justify-content: center;
  align-items: center;

  width: 120px;
  height: 100px;
  margin: 0 8px;

  overflow: hidden;
}

.film-strip .cell img {
  height: 100px;
  width: auto;
}
```



### drag and drop film strips

`$ cd ~/code/lambda-film-studio`

`$ yarn add react-beautiful-dnd`






### Login & deployment


#### login

now let's integrate our `login` function to our API Gateway

(( this won't work in local testing due to CORS, so we will see it work in deployment ))


```js
  const login = ()=> fetch('/test/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })

  }).then(response => response.statusCode > 400 ? console.error(401) : setLoggedIn( true ))

```



#### splicing the film together with (you guessed it) lambda

... reuse ffmpeg layer ...

... API Gateway, POST body: [ Key, .. ] ...

output to public bucket, respond with URL





#### deployment of our create-react-app to lambda + api gateway

by deploying the site as a {proxy+} on apigateway, our cookie will be valid across all requests (login, load files)


we'll need to write a lambda which reads the file and responds with it

```js
exports.handler = (event, context)=>{
  
  context.done(null, {
    "statusCode": 200,
    "headers":{
      "Content-Type": "text/html",
    },
    "body": require('fs').readFileSync('./build'+event.path).toString()
  });
}
```


https://superuser.com/questions/138331/using-ffmpeg-to-cut-up-video