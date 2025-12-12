import { init, Wasmer } from "@wasmer/sdk";

await init();

let ffmpeg = await Wasmer.fromRegistry("wasmer/ffmpeg");
let resp = await fetch("https://cdn.wasmer.io/media/wordpress.mp4");
let video = await resp.arrayBuffer();

// We take stdin ("-") as input and write the output to stdout ("-") as a
// WAV audio stream.
const instance = await ffmpeg.entrypoint.run({
  args: ["-i", "-", "-f", "wav", "-"],
  stdin: new Uint8Array(video),
});

const output = await instance.wait();
console.log(`The audio stream: ${output.stdoutBytes}`);