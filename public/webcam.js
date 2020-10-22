console.log('Importing dependencies...');

const { ipcRenderer } = require('electron');

ipcRenderer.send('webcam:data', null);
ipcRenderer.send('webcam:models-error', false);
ipcRenderer.send('webcam:camera-error', false);
ipcRenderer.send('webcam:execute-error', false);

const faceLandmarksDetection = require('@tensorflow-models/face-landmarks-detection');
const handtrack = require('@tensorflow-models/handpose');
const tf = require('@tensorflow/tfjs-core');
require('@tensorflow/tfjs-backend-webgl');
require('@tensorflow/tfjs-backend-cpu');

console.log('Imported dependencies');

let faceModel;
let handsModel;

let video;
let canvas;
let ctx;
let stream = null;
let frameWait = 0;

function waitForPromiseFinish(promise) {
  return new Promise((resolve) => {
    promise.then(resolve, resolve);
  });
}

function waitForDataLoaded() {
  return new Promise((resolve) => {
    if (video.readyState >= 2) { // 2 - HAVE_CURRENT_DATA
      resolve();
    } else {
      video.addEventListener('loadeddata', resolve, { once: true });
    }
  });
}

function assignElements() {
  video = document.getElementById('video');
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext('2d');
}

async function execute() {
  try {
    await waitForDataLoaded();
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/jpeg');
    const [faces, hands] = await Promise.all([
      faceModel.estimateFaces({ input: video }),
      handsModel.estimateHands(video),
    ]);

    const facesBounds = faces.map((face) => {
      let left = canvas.width;
      let right = 0;
      let top = canvas.height;
      let bottom = 0;

      face.scaledMesh.forEach(([x, y]) => {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      });

      return {
        left, right, top, bottom,
      };
    });
    ipcRenderer.send('webcam:data', {
      image,
      width: video.videoWidth,
      height: video.videoHeight,
      facesBounds,
      hands: hands.map((hand) => ({
        landmarks: hand.landmarks,
      })),
    });
    ipcRenderer.send('webcam:execute-error', false);
  } catch (error) {
    ipcRenderer.send('webcam:execute-error', true);
  } finally {
    setTimeout(execute, frameWait);
  }
}

async function loadModels() {
  try {
    faceModel = await faceLandmarksDetection.load();
    handsModel = await handtrack.load();
  } catch (error) {
    ipcRenderer.send('webcam:models-error', true);
    console.error(error);
    await new Promise((resolve) => {
      setTimeout(async () => {
        await loadModels();
        resolve();
      }, 5000);
    });
  }

  ipcRenderer.send('webcam:models-error', false);
}

let getUserMediaPromise = null;
let setDeviceTimeoutId = null;

async function setDevice(label) {
  ipcRenderer.send('webcam:data', null);
  if (setDeviceTimeoutId !== null) clearTimeout(setDeviceTimeoutId);
  if (getUserMediaPromise !== null) await waitForPromiseFinish(getUserMediaPromise);

  if (stream !== null) {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
    stream = null;
  }
  video.srcObject = null;
  if (label === null) {
    getUserMediaPromise = navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
      },
    });
  } else {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const device = devices.find((e) => e.kind === 'videoinput' && e.label === label);
    if (device === null) {
      getUserMediaPromise = Promise.reject(new Error('No device matching label found'));
    } else {
      getUserMediaPromise = navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: device.deviceId },
          facingMode: 'user',
        },
      });
    }
  }

  try {
    stream = await getUserMediaPromise;
    video.srcObject = stream;
    ipcRenderer.send('webcam:camera-error', false);
  } catch (error) {
    console.error(error);
    ipcRenderer.send('webcam:camera-error', true);
    setDeviceTimeoutId = setTimeout(() => {
      setDeviceTimeoutId = null;
      setDevice(label);
    }, 5000);
  } finally {
    getUserMediaPromise = null;
  }
}

async function main() {
  assignElements();

  ipcRenderer.on('webcam:video-input-label-changed', async (event, label) => {
    await setDevice(label);
  });
  ipcRenderer.on('webcam:use-cpu-backend-changed', async (event, useCpuBackend) => {
    await tf.setBackend(useCpuBackend ? 'cpu' : 'webgl');
  });
  ipcRenderer.on('webcam:frame-wait-changed', async (event, wait) => {
    frameWait = wait;
  });

  console.log('Loading backend...');
  const useCpuBackend = await ipcRenderer.invoke('webcam:get-use-cpu-backend');
  await tf.setBackend(useCpuBackend ? 'cpu' : 'webgl');

  console.log('Loading models...');
  await loadModels();
  console.log('Settings device...');

  const label = await ipcRenderer.invoke('webcam:get-video-input-label');
  await setDevice(label);
  console.log('Set device');

  frameWait = await ipcRenderer.invoke('webcam:get-frame-wait');

  await execute();
}

main();
