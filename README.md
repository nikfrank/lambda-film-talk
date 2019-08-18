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

<sub>LAMBDA</sub>
```js
exports.handler = (event, context) => {

  const ls = require('child_process').spawn('/opt/ffmpeg/ffmpeg', ['-version']);
    
  ls.stdout.on('data', d=> console.log(d.toString()));

  ls.on('close', code=> code ? context.fail(code) : context.succeed());     
};
```

if everything worked, this should print out the current version of ffmpeg



### running in the cloud

 - upload the zip (with all dependency layers)
 - configure the lambda to be triggered by upload to the s3
 - apply permissions to the lambda which will allow it to read from, write to the s3 buckets
 - test by uploading some files


now that our program works locally, we want to upload it to the AWS lambda console

first, we'll make a zip file, which we can upload


 - upload the zip (with all dependency layers)


`$ git archive -o lambda.zip`







## cloud security

 - api gateway + lambda -> jwt cookie login
 - lambda jwt cookie authenticator
 - loading the video / images using the cookie (html5 video tag)
 - https://aws.amazon.com/blogs/compute/simply-serverless-using-aws-lambda-to-expose-custom-cookies-with-api-gateway/




## front end upload

 - s3 signed url uploads, using our jwt security from before
 - lambda sed (lambda-film-talk-upload -> lambda-film-talk)
 - futch (upload progress)


## putting it all together

 - drag and drop film strips
 - one more lambda to splice film together
 - https://github.com/atlassian/react-beautiful-dnd




https://superuser.com/questions/138331/using-ffmpeg-to-cut-up-video