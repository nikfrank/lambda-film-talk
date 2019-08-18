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
