const { spawn } = require('child_process');

const proc = spawn('ffmpeg', [
  '-i', 'assets/five.mp4', '-vf', 'fps=1', 'assets/out%d.png'
]);

proc.on('close', (code)=>{
  console.log(code);
});
