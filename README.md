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



### cloud architecture

( insert image here ... )



## coding

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
  
  proc.on('close', (code)=>{
    if( code ) context.fail(err);
    else context.succeed();
  });
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
const { spawn } = require('child_process');
const fs = require('fs');

AWS.config.update({
  region:"us-east-1",
});
const s3 = new AWS.S3();


exports.handler = (event, context, callback)=> {

  const FROM_BUCKET = event.Records[0].s3.bucket.name;
  const Key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));

  //...
```


and we can now download the file from S3

```js
  const tmp = './tmp';

  (new Promise((resolve, reject)=>
    s3.getObject(downloadParams, (err, response)=>{
      if(err) {
        console.error(err.code, '-', err.message);
        return reject(err);
      }
    
      fs.writeFile(tmp+'/input.mp4', response.Body, err=>
        err ? reject(err) : resolve()
      )
    })
  ))
```


for this to work though, we'll need to temporarily put our AWS API key into our S3 config

and we'll need to remember to change the `tmp` directory in the lambda runtime to '/tmp' and commit a .gitkeep

...



https://superuser.com/questions/138331/using-ffmpeg-to-cut-up-video