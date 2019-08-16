const filmSplitter = require('./');

filmSplitter.handler({
  "Records":[
    {
      "s3": {
        "bucket": { "name": "some-bucket" },
        "object": {
          "key": "some-filename.mp4"
        }
      }
    }
  ]
}, {
  fail: err => console.error(err),
  succeed: ()=> console.log('success!'),
});
