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





https://superuser.com/questions/138331/using-ffmpeg-to-cut-up-video