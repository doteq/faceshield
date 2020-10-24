import { EventEmitter } from 'events';
import Kinect from './trackers/kinect';
import Webcam from './trackers/webcam';
import configStore from './stores/config';
import trackingStore from './stores/tracking';

export default class TrackerManager extends EventEmitter {
  constructor() {
    super();
    this.lastTouches = [];
    this.lastTouchingStatus = false;
    this.trackingActive = false;
    this.previewActive = false;
    this.faceDetectStreak = 0;

    this.checkLastActiveTime();
    setInterval(() => this.checkLastActiveTime(), 1000);

    this.tracker = configStore.get('tracker');
    this.initKinect();
    this.initWebcam();
  }

  checkLastActiveTime() {
    const lastActiveTime = trackingStore.get('lastActiveTime');
    if (lastActiveTime === null) return;
    const timeSinceEnd = new Date().getTime() - lastActiveTime.endTimestamp;
    if (timeSinceEnd < 10000) return;
    trackingStore.set('lastActiveTime', null);

    const duration = lastActiveTime.endTimestamp - lastActiveTime.startTimestamp;
    if (duration >= 10000) {
      const activeTimes = trackingStore.get('activeTimes');
      activeTimes.push({
        ...lastActiveTime,
        duration,
      });
      trackingStore.set('activeTimes', activeTimes);
    }
  }

  updateActiveTime(detected) {
    if (!detected || !this.trackingActive) {
      this.faceDetectStreak = 0;
      return;
    }
    this.faceDetectStreak += 1;
    if (this.faceDetectStreak < 3) return;

    const lastActiveTime = trackingStore.get('lastActiveTime');
    const endTimestamp = new Date().getTime();
    if (lastActiveTime === null) {
      trackingStore.set('lastActiveTime', {
        startTimestamp: endTimestamp,
        endTimestamp,
      });
    } else trackingStore.set('lastActiveTime.endTimestamp', endTimestamp);
  }

  initKinect() {
    this.kinect = new Kinect();
    this.kinect.on('preview-update', (args) => this.emit('preview-update', args));
    this.kinect.on('skeleton-update', (skeleton) => {
      this.detectTouchingKinect(skeleton);
      this.emit('skeleton-update', skeleton);
    });
  }

  initWebcam() {
    this.webcam = new Webcam();
    this.webcam.on('data-update', (data) => {
      this.detectTouchingWebcam(data);
      this.emit('webcam-data-update', data);
    });
  }

  async start() {
    if (this.tracker === 'kinect') {
      await this.kinect.connect();
    } else if (this.tracker === 'webcam') {
      await this.webcam.start();
    }
  }

  stop() {
    if (this.tracker === 'kinect') {
      this.kinect.disconnect();
    } else if (this.tracker === 'webcam') {
      this.webcam.stop();
    }
  }

  async startTracking() {
    if (this.trackingActive) return;
    this.trackingActive = true;
    if (this.previewActive) return;
    await this.start();
  }

  stopTracking() {
    if (!this.trackingActive) return;
    this.trackingActive = false;
    if (this.previewActive) return;
    this.stop();
    this.emit('touching-update', false);
    this.updateActiveTime(false);
  }

  async startPreview() {
    if (this.previewActive) return;
    this.previewActive = true;
    if (this.trackingActive) return;
    await this.start();
  }

  stopPreview() {
    if (!this.previewActive) return;
    this.previewActive = false;
    if (this.trackingActive) return;
    this.stop();
  }

  async setTracker(tracker) {
    if (!(this.trackingActive || this.previewActive)) {
      this.tracker = tracker;
      return;
    }
    const currentTracker = this.tracker;
    if (tracker === currentTracker) return;
    this.stop();
    this.tracker = tracker;
    await this.start();
  }

  handleTouching(touching) {
    this.lastTouches.push({
      touching,
      timestamp: Date.now(),
    });
    // if (this.lastTouches.length > waitFrames) this.lastTouches.shift();
    this.lastTouches = this.lastTouches.filter((touchObj) => touchObj.timestamp > Date.now() - 500);
    if (this.lastTouches.filter((touch) => touch.touching).length > this.lastTouches.length * 0.5
      && this.lastTouches.length > 1) {
      if (!this.lastTouchingStatus && this.trackingActive) {
        const touches = trackingStore.get('touches');
        touches.push({
          timestamp: Date.now(),
        });
        trackingStore.set('touches', touches);
        this.emit('ding');
      }
      this.lastTouchingStatus = true;
      this.emit('touching-update', true);
    } else {
      this.lastTouchingStatus = false;
      this.emit('touching-update', false);
    }
  }

  detectTouchingKinect(skeleton) {
    let touching = false;
    if (skeleton.head) {
      this.updateActiveTime(true);
      skeleton.hands.forEach((hand) => {
        if (
          (hand.x >= skeleton.head.x && hand.x <= (skeleton.head.x + skeleton.head.dx))
        && (hand.y <= skeleton.head.y && hand.y >= (skeleton.head.y + skeleton.head.dy))
        ) touching = true;
      });
    } else {
      this.updateActiveTime(false);
    }
    this.handleTouching(touching, 50);
  }

  detectTouchingWebcam(data) {
    if (!data) {
      this.updateActiveTime(false);
      return;
    }

    this.updateActiveTime(data.facesBounds.length > 0);

    const touchJoints = data.hands.flatMap((hand) => hand.landmarks);
    let touching = false;
    data.facesBounds.forEach(({
      top, bottom, left, right,
    }) => {
      touchJoints.forEach(([x, y]) => {
        if ((x >= left && x <= right) && (y >= top && y <= bottom)) touching = true;
      });
    });
    this.handleTouching(touching, 5);
  }
}
