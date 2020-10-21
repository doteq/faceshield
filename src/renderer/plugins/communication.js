class CommunicationPlugin {
  async init() {
    const autostartConfig = await window.ipcRenderer.invoke('get-autostart-config');
    this.store.commit('setAutostartConfig', autostartConfig);

    const trackingActive = await window.ipcRenderer.invoke('get-tracking-active');
    this.store.commit('setTrackingActive', trackingActive);

    const videoInputLabel = await window.ipcRenderer.invoke('get-video-input-label');
    this.store.commit('setVideoInputLabel', videoInputLabel);

    const useCpuBackend = await window.ipcRenderer.invoke('get-use-cpu-backend');
    this.store.commit('setUseCpuBackend', useCpuBackend);

    const webcamFrameWait = await window.ipcRenderer.invoke('get-webcam-frame-wait');
    this.store.commit('setWebcamFrameWait', webcamFrameWait);

    const tracker = await window.ipcRenderer.invoke('get-tracker');
    this.store.commit('setTracker', tracker);
  }

  setAutostartConfig(config) {
    window.ipcRenderer.send('set-autostart-config', config);
  }

  startTracking() {
    window.ipcRenderer.send('start-tracking');
  }

  pauseTracking() {
    window.ipcRenderer.send('pause-tracking');
  }

  setVideoInputLabel(label) {
    window.ipcRenderer.send('set-video-input-label', label);
  }

  setUseCpuBackend(useCpuBackend) {
    window.ipcRenderer.send('set-use-cpu-backend', useCpuBackend);
  }

  setWebcamFrameWait(webcamFrameWait) {
    window.ipcRenderer.send('set-webcam-frame-wait', webcamFrameWait);
  }

  setTracker(tracker) {
    window.ipcRenderer.send('set-tracker', tracker);
  }

  async install(Vue, options) {
    this.store = options.store;
    window.ipcRenderer.on('autostart-config-changed', (event, config) => {
      this.store.commit('setAutostartConfig', config);
    });
    window.ipcRenderer.on('tracking-active-changed', (event, active) => {
      this.store.commit('setTrackingActive', active);
    });
    window.ipcRenderer.on('video-input-label-changed', (event, label) => {
      this.store.commit('setVideoInputLabel', label);
    });
    window.ipcRenderer.on('use-cpu-backend-changed', (event, useCpuBackend) => {
      this.store.commit('setUseCpuBackend', useCpuBackend);
    });
    window.ipcRenderer.on('webcam-frame-wait-changed', (event, webcamFrameWait) => {
      this.store.commit('setWebcamFrameWait', webcamFrameWait);
    });
    window.ipcRenderer.on('tracker-changed', (event, tracker) => {
      this.store.commit('setTracker', tracker);
    });

    await this.init();
    Vue.prototype.$comm = {
      setAutostartConfig: this.setAutostartConfig,
      startTracking: this.startTracking,
      pauseTracking: this.pauseTracking,
      setVideoInputLabel: this.setVideoInputLabel,
      setUseCpuBackend: this.setUseCpuBackend,
      setWebcamFrameWait: this.setWebcamFrameWait,
      setTracker: this.setTracker,
    };
  }
}

const plugin = new CommunicationPlugin();

export default plugin;
