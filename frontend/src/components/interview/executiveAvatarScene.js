import * as T from 'three';
import { createExecutiveAvatarModel } from './executiveAvatarModel';

const SPEECH_RHYTHM = [.30, 1, .18, .72, .94, .20, .87, .15, .62, .03, .82, .22, .94, .04, .48, .88];
const LISTENING_CYCLE = 3.6;

function nodPulse(elapsed, start, duration) {
  const progress = T.MathUtils.clamp((elapsed - start) / duration, 0, 1);
  return Math.sin(Math.PI * progress) ** 2;
}

export function mountExecutiveAvatar(host, onReady) {
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const canvas = renderer.domElement;
  host.append(canvas);

  const scene = new T.Scene();
  const camera = new T.OrthographicCamera();
  camera.position.set(0, .14, 6);
  camera.near = .1;
  camera.far = 20;
  scene.add(new T.HemisphereLight(0xfff2e7, 0x8491b7, 1.8));
  for (const [color, intensity, x, y, z] of [
    [0xffdfc2, 2.65, -3, 4, 4],
    [0xd0dfff, 1.05, 3, 1, 4],
    [0xddd3ff, 2.2, 2, 3, -4],
  ]) {
    const lamp = new T.DirectionalLight(color, intensity);
    lamp.position.set(x, y, z);
    scene.add(lamp);
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const models = new Map();
  let activeModel;
  let status = 'idle';
  let statusSince = performance.now();
  let frame;
  let contextLost = false;
  let ready = false;

  function render(now) {
    frame = undefined;
    if (!activeModel || contextLost) return;
    const { head, bust, eyes, gazes, brows, poseMouth } = activeModel;
    const elapsed = Math.max(0, now - statusSince) / 1000;
    const reduceMotion = reduced.matches;
    const motion = reduceMotion ? .45 : 1;
    const speaking = status === 'speaking';
    const asking = status === 'asking';
    const thinking = status === 'analyzing';
    const listening = status === 'listening';
    const speech = speaking ? T.MathUtils.smoothstep(elapsed, 0, .16) * motion : 0;
    const question = asking ? nodPulse(elapsed, 0, 1.45) * motion : 0;
    const reflect = thinking ? T.MathUtils.smoothstep(elapsed, .06, .78) * motion : 0;
    const listenTime = reduceMotion ? elapsed : elapsed % LISTENING_CYCLE;
    const nod = listening ? (nodPulse(listenTime, .14, .72) + .74 * nodPulse(listenTime, .97, .66)) * motion : 0;

    head.rotation.set(
      (.055 + .17 * Math.sin(elapsed * 4.4)) * speech + .22 * nod + .11 * question - .16 * reflect,
      (.07 + .26 * Math.sin(elapsed * 2.5)) * speech + .16 * question + .26 * reflect,
      (.08 + .16 * Math.sin(elapsed * 3.5)) * speech + .13 * question - .045 * nod - .19 * reflect,
    );
    bust.rotation.z = .050 * Math.sin(elapsed * 2.6) * speech + .026 * question - .031 * reflect;
    bust.position.y = .025 * Math.sin(elapsed * 3.3) * speech;
    const blink = speaking ? Math.exp(-(((((elapsed + .28) % 2.65) - 1.36) / .086) ** 2)) : 0;
    eyes.forEach((eye) => { eye.scale.y = .76 * (1 - .95 * blink * motion); });
    gazes.forEach((gaze) => { gaze.position.x = .014 * reflect; });
    brows.forEach((brow, index) => {
      brow.position.y = brow.userData.restY + (index === 0 ? .057 : .028) * reflect
        + (.023 + .048 * Math.sin(elapsed * 5.4 + index * .5)) * speech + .050 * question;
    });
    const syllable = elapsed * 5.3;
    const index = Math.floor(syllable);
    const amount = T.MathUtils.smoothstep(syllable - index, 0, 1);
    const shape = T.MathUtils.lerp(SPEECH_RHYTHM[index % SPEECH_RHYTHM.length], SPEECH_RHYTHM[(index + 1) % SPEECH_RHYTHM.length], amount);
    poseMouth(shape * speech);
    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      onReady(true);
    }

    if (speaking || (asking && elapsed < 1.45) || (listening && (!reduceMotion || elapsed < 1.63)) || (thinking && elapsed < .78)) {
      scheduleRender();
    }
  }

  function scheduleRender() {
    if (frame === undefined && !contextLost) frame = window.requestAnimationFrame(render);
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = host;
    if (!width || !height) return;
    const half = Math.max(1.24, height / width);
    camera.left = -half * width / height;
    camera.right = -camera.left;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    scheduleRender();
  }

  function handleContextLost() {
    contextLost = true;
    ready = false;
    onReady(false);
  }

  function handleContextRestored() {
    contextLost = false;
    scheduleRender();
  }

  canvas.addEventListener('webglcontextlost', handleContextLost);
  canvas.addEventListener('webglcontextrestored', handleContextRestored);
  reduced.addEventListener('change', scheduleRender);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  return {
    setStatus(next) {
      if (status === next) return;
      status = next;
      statusSince = performance.now();
      scheduleRender();
    },
    setVariant(variant) {
      if (!models.has(variant)) models.set(variant, createExecutiveAvatarModel(variant));
      if (activeModel) scene.remove(activeModel.figure);
      activeModel = models.get(variant);
      scene.add(activeModel.figure);
      scheduleRender();
    },
    dispose() {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      reduced.removeEventListener('change', scheduleRender);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      const resources = new Set();
      for (const { figure } of models.values()) {
        figure.traverse((node) => {
          if (node.isMesh) {
            resources.add(node.geometry);
            resources.add(node.material);
          }
        });
      }
      resources.forEach((resource) => resource.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
