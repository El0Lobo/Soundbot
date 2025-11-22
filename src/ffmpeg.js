const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { windowsHide:true });
    let err = "";
    p.stderr.on("data", d => err += d.toString());
    p.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(err || "ffmpeg failed"));
    });
  });
}

async function convertToMp3(inputPath, outPath) {
  await runFfmpeg(["-y", "-i", inputPath, "-vn", "-acodec", "libmp3lame", "-b:a", "192k", outPath]);
}

async function trimAudio(inputPath, outPath, startSec, endSec) {
  const dur = Math.max(0, endSec - startSec);
  await runFfmpeg(["-y","-i", inputPath, "-ss", String(startSec), "-t", String(dur), "-vn", "-acodec", "libmp3lame", "-b:a", "192k", outPath]);
}

module.exports = { convertToMp3, trimAudio };
