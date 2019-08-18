const AWS = require('aws-sdk');

const { spawn } = require('child_process');
const fs = require('fs');

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

const s3 = new AWS.S3();


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
