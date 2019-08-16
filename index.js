const { spawn } = require('child_process');
const fs = require('fs');

AWS.config.update({
  region:"us-east-1",
});
const s3 = new AWS.S3();


exports.handler = (event, context, callback)=> {

  const FROM_BUCKET = event.Records[0].s3.bucket.name;
  const Key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));


  // download the file from s3
  const downloadParams = { Bucket: FROM_BUCKET, Key };

  const tmpPlace = Math.random();

  (new Promise((resolve, reject)=>
    s3.getObject(downloadParams, (err, response)=>{
      if(err) {
        console.error(err.code, '-', err.message);
        return reject(err);
      }
      
      fs.writeFile('./assets/input.mp4', response.Body, err=>
        err ? reject(err) : resolve()
      )
    })
  ));
  
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
