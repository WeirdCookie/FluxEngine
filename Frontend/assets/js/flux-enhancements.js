/**
 * ═══════════════════════════════════════════════════════════════════
 * FLUXENGINE — Scroll-Driven Cinematic 3D Engine
 * Three.js + Custom GLSL Shaders + Procedural Models
 * Scroll-linked camera · Depth fog · Motion blur · Shader sync
 * ═══════════════════════════════════════════════════════════════════
 */

import * as THREE from 'three';

/* ─── DOM Cache ─── */
const canvasContainer = document.getElementById('fx-canvas');
const contentEl = document.getElementById('fx-content');
const loaderEl = document.getElementById('fx-loader');
const navEl = document.getElementById('fx-nav');
const navToggle = document.querySelector('.fx-nav-toggle');
const navLinks = document.querySelector('.fx-nav-links');
const navAnchors = document.querySelectorAll('.fx-nav-links a');
const statEls = document.querySelectorAll('.fx-stat-val[data-count]');
const revealEls = document.querySelectorAll('.fx-reveal, .fx-section-head, .fx-card, .fx-stat, .fx-pipeline');
const parallaxEls = document.querySelectorAll('[data-fx-parallax]');
const sections = document.querySelectorAll('.fx-section');
const scrollProgressBar = document.getElementById('fx-scroll-progress');
const fogOverlay = document.getElementById('fx-fog-overlay');
const sectionDots = document.querySelectorAll('.fx-section-dot');
const sectionFlash = document.querySelector('.fx-section-flash');

/* ─── State ─── */
const STATE = {
    scrollY: 0,
    targetScrollY: 0,
    prevScrollY: 0,
    scrollNorm: 0,
    scrollVelocity: 0,
    mouseX: 0.5,
    mouseY: 0.5,
    targetMouseX: 0.5,
    targetMouseY: 0.5,
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: Math.min(window.devicePixelRatio, 2),
    activeSection: 0,
    sectionProgress: 0,
    sectionEnterTime: 0,
    isLoaded: false,
    reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    isMobile: window.innerWidth < 768,
    clock: new THREE.Clock(),
    time: 0,
    delta: 0,
    shakeAmount: 0,
    shakeDecay: 4.0,
    // Scroll-synced shader controls
    glowIntensity: 0.7,
    particleSpeed: 1.0,
    fogDensity: 0.0,
    targetFogDensity: 0.0,
    lightColorMix: 0.0, // 0=red, 1=white/blue
};

/* ─── Section Scroll Ranges (normalized 0-1 across total scroll) ─── */
const SECTION_RANGES = {
    hero: { start: 0.0, end: 0.18 },
    architecture: { start: 0.18, end: 0.42 },
    technology: { start: 0.42, end: 0.66 },
    showcase: { start: 0.66, end: 0.88 },
    footer: { start: 0.88, end: 1.0 },
};

/* ─── Camera Keyframes per Section ─── */
const CAMERA_KEYFRAMES = {
    hero: {
        posStart: new THREE.Vector3(0, 0.2, 8),
        posEnd: new THREE.Vector3(0, 0.1, 5.5),
        lookStart: new THREE.Vector3(0, 0.2, 0),
        lookEnd: new THREE.Vector3(0, 0, 0),
    },
    architecture: {
        posStart: new THREE.Vector3(-1.5, 0.3, 5.5),
        posEnd: new THREE.Vector3(1.5, -0.2, 4.5),
        lookStart: new THREE.Vector3(-0.5, 0, -0.5),
        lookEnd: new THREE.Vector3(0.5, 0, -0.5),
    },
    technology: {
        posStart: new THREE.Vector3(0.5, 0.5, 4.5),
        posEnd: new THREE.Vector3(-0.5, -0.3, 3.2),
        lookStart: new THREE.Vector3(0, 0, -0.3),
        lookEnd: new THREE.Vector3(0, 0, -0.3),
    },
    showcase: {
        posStart: new THREE.Vector3(-1, 0, 5),
        posEnd: new THREE.Vector3(1, 0, 4),
        lookStart: new THREE.Vector3(0, 0, -1),
        lookEnd: new THREE.Vector3(0, 0, -1),
    },
    footer: {
        posStart: new THREE.Vector3(0, 0, 6),
        posEnd: new THREE.Vector3(0, 0.5, 10),
        lookStart: new THREE.Vector3(0, 0, -1),
        lookEnd: new THREE.Vector3(0, 0.3, 0),
    },
};

/* ─── Three.js Globals ─── */
let renderer, scene, camera;
let heroGroup, archGroup, techGroup, showcaseGroup;
let sectionGroups = {};
let ambientLight, keyLight, rimLight, fillLight, topLight;
let sceneFog;
let prevFrameTexture, motionBlurQuad, motionBlurScene, motionBlurCamera;
const mixers = [];

function initThree() {
    // Renderer
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
    });
    renderer.setSize(STATE.width, STATE.height);
    renderer.setPixelRatio(STATE.dpr);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    canvasContainer.appendChild(renderer.domElement);

    // Scene
    scene = new THREE.Scene();

    // Depth fog — starts clear, increases in tech section
    sceneFog = new THREE.Fog(0x0a0a0a, 5, 25);
    scene.fog = sceneFog;

    // Camera
    camera = new THREE.PerspectiveCamera(55, STATE.width / STATE.height, 0.1, 100);
    camera.position.copy(CAMERA_KEYFRAMES.hero.posStart);
    camera.lookAt(CAMERA_KEYFRAMES.hero.lookStart);

    // Lighting — store references for dynamic control
    ambientLight = new THREE.AmbientLight(0x222244, 0.6);
    scene.add(ambientLight);

    keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(5, 8, 5);
    scene.add(keyLight);

    rimLight = new THREE.DirectionalLight(0xE63946, 1.8);
    rimLight.position.set(-5, -2, -3);
    scene.add(rimLight);

    fillLight = new THREE.DirectionalLight(0x5B7A9E, 0.9);
    fillLight.position.set(0, -2, 4);
    scene.add(fillLight);

    topLight = new THREE.PointLight(0xffffff, 40, 20, 1.5);
    topLight.position.set(0, 10, 0);
    scene.add(topLight);

    // Motion blur setup — offscreen render target for frame blending
    setupMotionBlur();
}

function setupMotionBlur() {
    motionBlurScene = new THREE.Scene();
    motionBlurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            tCurrent: { value: null },
            tPrevious: { value: null },
            uBlend: { value: 0.3 },
            uResolution: { value: new THREE.Vector2(STATE.width, STATE.height) },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          uniform sampler2D tCurrent;
          uniform sampler2D tPrevious;
          uniform float uBlend;
          void main() {
            vec4 curr = texture2D(tCurrent, vUv);
            vec4 prev = texture2D(tPrevious, vUv);
            gl_FragColor = mix(curr, prev, uBlend);
          }`,
        depthWrite: false,
    });
    motionBlurQuad = new THREE.Mesh(geo, mat);
    motionBlurScene.add(motionBlurQuad);

    // Create previous frame render target
    prevFrameTexture = new THREE.WebGLRenderTarget(STATE.width, STATE.height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
    });
}

/* ─── Custom GLSL Shaders ─── */

const glowVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glowFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uScrollSpeed;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;
  void main() {
    float fresnel = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
    fresnel = pow(fresnel, 2.5);
    float speedMul = 1.0 + uScrollSpeed * 2.0;
    float pulse = 0.85 + 0.15 * sin(uTime * 2.5 * speedMul + vPosition.y * 3.0);
    float alpha = fresnel * uIntensity * pulse;
    vec3 color = uColor * (1.0 + fresnel * 0.6);
    gl_FragColor = vec4(color, alpha);
  }
`;

const streamVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aOffset;
  varying float vAlpha;
  varying float vSize;
  uniform float uTime;
  uniform float uSpeed;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float life = fract(aOffset + uTime * 0.3 * uSpeed);
    vAlpha = smoothstep(0.0, 0.2, life) * smoothstep(1.0, 0.7, life);
    vSize = aSize * (0.5 + 0.5 * life);
    gl_PointSize = vSize * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const streamFragmentShader = /* glsl */ `
  varying float vAlpha;
  uniform vec3 uColor;
  uniform float uIntensity;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float alpha = vAlpha * smoothstep(1.0, 0.0, d) * uIntensity;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/* ─── Procedural 3D Models ─── */

function createGlowRing(radius = 2.5, tubeRadius = 0.015, color = 0xE63946, intensity = 0.7) {
    const geo = new THREE.TorusGeometry(radius, tubeRadius, 16, 200);
    const mat = new THREE.ShaderMaterial({
        vertexShader: glowVertexShader,
        fragmentShader: glowFragmentShader,
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(color) },
            uIntensity: { value: intensity },
            uScrollSpeed: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.isGlow = true;
    return mesh;
}

function createCoreShape() {
    const group = new THREE.Group();
    const coreGeo = new THREE.IcosahedronGeometry(0.55, 3);
    const coreMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a, roughness: 0.15, metalness: 0.9,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    const wireGeo = new THREE.IcosahedronGeometry(0.57, 3);
    const wireMat = new THREE.MeshBasicMaterial({
        color: 0xE63946, wireframe: true, transparent: true,
        opacity: 0.18, depthWrite: false,
    });
    group.add(new THREE.Mesh(wireGeo, wireMat));

    const innerGeo = new THREE.SphereGeometry(0.35, 32, 32);
    const innerMat = new THREE.MeshBasicMaterial({
        color: 0xE63946, transparent: true, opacity: 0.06, depthWrite: false,
    });
    group.add(new THREE.Mesh(innerGeo, innerMat));

    group.userData.rotate = true;
    group.userData.rotSpeed = { x: 0.15, y: 0.25, z: 0.1 };
    return group;
}

function createParticleField(count = 600, spread = 8, color = 0xE63946) {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const offsets = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * spread;
        positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
        positions[i * 3 + 2] = (Math.random() - 0.5) * spread * 0.7;
        sizes[i] = Math.random() * 3 + 1;
        offsets[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));
    const mat = new THREE.ShaderMaterial({
        vertexShader: streamVertexShader,
        fragmentShader: streamFragmentShader,
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(color) },
            uSpeed: { value: 1.0 },
            uIntensity: { value: 1.0 },
        },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.userData.isParticles = true;
    return points;
}

function createArchNodes() {
    const group = new THREE.Group();
    const nodePositions = [
        { x: -2.5, y: 0.8, z: 0 }, { x: -0.8, y: -0.3, z: 0.5 },
        { x: 0.8, y: 0.5, z: -0.4 }, { x: 2.2, y: -0.6, z: 0.2 },
        { x: 3.8, y: 0.2, z: -0.1 },
    ];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 2], [1, 3]];

    edges.forEach(([a, b]) => {
        const start = new THREE.Vector3(nodePositions[a].x, nodePositions[a].y, nodePositions[a].z);
        const end = new THREE.Vector3(nodePositions[b].x, nodePositions[b].y, nodePositions[b].z);
        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(end, start);
        const len = dir.length();
        const beamGeo = new THREE.CylinderGeometry(0.02, 0.02, len, 8);
        const beamMat = new THREE.MeshStandardMaterial({
            color: 0x333333, roughness: 0.3, metalness: 0.8,
            emissive: 0x110000, emissiveIntensity: 0.3,
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.copy(mid);
        beam.lookAt(end);
        beam.rotateX(Math.PI / 2);
        group.add(beam);
    });

    nodePositions.forEach((pos, i) => {
        const nodeGroup = new THREE.Group();
        const shellGeo = new THREE.OctahedronGeometry(0.22, 1);
        const shellMat = new THREE.MeshStandardMaterial({
            color: i === 0 ? 0xE63946 : 0x2a2a2a, roughness: 0.2, metalness: 0.85,
            emissive: i === 0 ? 0x330000 : 0x050505,
            emissiveIntensity: i === 0 ? 0.6 : 0.1,
        });
        nodeGroup.add(new THREE.Mesh(shellGeo, shellMat));
        const ringGeo = new THREE.TorusGeometry(0.28, 0.012, 8, 24);
        const ringMat = new THREE.MeshBasicMaterial({
            color: i === 0 ? 0xE63946 : 0x444444,
            transparent: true, opacity: 0.5, depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.random() * Math.PI;
        ring.rotation.y = Math.random() * Math.PI;
        nodeGroup.add(ring);
        nodeGroup.position.set(pos.x, pos.y, pos.z);
        nodeGroup.userData.nodeIndex = i;
        nodeGroup.userData.baseY = pos.y;
        group.add(nodeGroup);
    });

    const flowCount = 200;
    const flowPositions = new Float32Array(flowCount * 3);
    const flowSizes = new Float32Array(flowCount);
    const flowOffsets = new Float32Array(flowCount);
    for (let i = 0; i < flowCount; i++) {
        const edgeIdx = Math.floor(Math.random() * edges.length);
        const [a, b] = edges[edgeIdx];
        const t = Math.random();
        flowPositions[i * 3] = THREE.MathUtils.lerp(nodePositions[a].x, nodePositions[b].x, t) + (Math.random() - 0.5) * 0.2;
        flowPositions[i * 3 + 1] = THREE.MathUtils.lerp(nodePositions[a].y, nodePositions[b].y, t) + (Math.random() - 0.5) * 0.2;
        flowPositions[i * 3 + 2] = THREE.MathUtils.lerp(nodePositions[a].z, nodePositions[b].z, t) + (Math.random() - 0.5) * 0.2;
        flowSizes[i] = Math.random() * 2 + 0.5;
        flowOffsets[i] = Math.random();
    }
    const flowGeo = new THREE.BufferGeometry();
    flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPositions, 3));
    flowGeo.setAttribute('aSize', new THREE.BufferAttribute(flowSizes, 1));
    flowGeo.setAttribute('aOffset', new THREE.BufferAttribute(flowOffsets, 1));
    const flowMat = new THREE.ShaderMaterial({
        vertexShader: streamVertexShader,
        fragmentShader: streamFragmentShader,
        uniforms: {
            uTime: { value: 0 }, uColor: { value: new THREE.Color(0xE63946) },
            uSpeed: { value: 1.0 }, uIntensity: { value: 1.0 },
        },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const flowPoints = new THREE.Points(flowGeo, flowMat);
    flowPoints.userData.isFlow = true;
    group.add(flowPoints);
    group.position.set(0, 0, -1);
    group.userData.isArchNodes = true;
    return group;
}

function createTechVisual() {
    const group = new THREE.Group();
    const crystalGroup = new THREE.Group();
    for (let i = 0; i < 5; i++) {
        const size = 0.3 + Math.random() * 0.5;
        const geo = new THREE.OctahedronGeometry(size, 1);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x5B7A9E, roughness: 0.1, metalness: 0.95,
            emissive: 0x0a1520, emissiveIntensity: 0.4,
        });
        const crystal = new THREE.Mesh(geo, mat);
        crystal.position.set(
            (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 1.5
        );
        crystal.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        crystal.userData.rotSpeed = {
            x: (Math.random() - 0.5) * 0.4, y: (Math.random() - 0.5) * 0.4,
            z: (Math.random() - 0.5) * 0.2,
        };
        crystalGroup.add(crystal);
    }
    group.add(crystalGroup);

    for (let i = 0; i < 3; i++) {
        const ringGeo = new THREE.TorusGeometry(1.2 + i * 0.6, 0.015, 16, 80);
        const ringMat = new THREE.MeshStandardMaterial({
            color: i === 0 ? 0xCE422B : 0x5B7A9E, roughness: 0.2, metalness: 0.9,
            emissive: i === 0 ? 0x1a0500 : 0x051020, emissiveIntensity: 0.5,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2 + i * 0.4;
        ring.rotation.y = i * 0.6;
        ring.userData.ringSpeed = 0.2 + i * 0.15;
        ring.userData.ringAxis = i % 2 === 0 ? 'y' : 'x';
        group.add(ring);
    }

    const dataPoints = createParticleField(300, 5, 0x5B7A9E);
    dataPoints.position.z = -0.5;
    group.add(dataPoints);
    group.position.set(0, 0, -0.5);
    group.userData.isTechVis = true;
    return group;
}

function createShowcaseElements() {
    const group = new THREE.Group();
    const cardColors = [0xE63946, 0x5B7A9E, 0xCE422B, 0x3a3a3a];
    const cardPositions = [
        { x: -2.8, y: 0.6, z: 0.3, ry: 0.3 }, { x: -0.9, y: -0.3, z: -0.2, ry: -0.2 },
        { x: 0.9, y: 0.4, z: 0.1, ry: 0.15 }, { x: 2.8, y: -0.5, z: -0.3, ry: -0.25 },
    ];
    cardPositions.forEach((pos, i) => {
        const cardGroup = new THREE.Group();
        const plateGeo = new THREE.BoxGeometry(1.2, 0.8, 0.04);
        const plateMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a, roughness: 0.3, metalness: 0.7,
        });
        cardGroup.add(new THREE.Mesh(plateGeo, plateMat));
        const edgeGeo = new THREE.BoxGeometry(1.24, 0.04, 0.06);
        const edgeMat = new THREE.MeshStandardMaterial({
            color: cardColors[i], roughness: 0.1, metalness: 0.9,
            emissive: cardColors[i], emissiveIntensity: 0.4,
        });
        const edge = new THREE.Mesh(edgeGeo, edgeMat);
        edge.position.y = 0.42;
        cardGroup.add(edge);
        cardGroup.position.set(pos.x, pos.y, pos.z);
        cardGroup.rotation.y = pos.ry;
        cardGroup.userData.floatOffset = Math.random() * Math.PI * 2;
        cardGroup.userData.floatSpeed = 0.4 + Math.random() * 0.6;
        cardGroup.userData.floatAmp = 0.15 + Math.random() * 0.25;
        group.add(cardGroup);
    });
    group.position.set(0, 0, -1.5);
    group.userData.isShowcase = true;
    return group;
}

/* ─── Build Scene ─── */
function buildScene() {
    heroGroup = new THREE.Group();
    heroGroup.add(createCoreShape());

    const ring1 = createGlowRing(1.4, 0.02, 0xE63946, 0.8);
    ring1.rotation.x = Math.PI / 2;
    heroGroup.add(ring1);
    const ring2 = createGlowRing(1.9, 0.012, 0x5B7A9E, 0.5);
    ring2.rotation.x = Math.PI / 3;
    ring2.rotation.y = Math.PI / 4;
    heroGroup.add(ring2);
    const ring3 = createGlowRing(2.4, 0.008, 0xCE422B, 0.35);
    ring3.rotation.x = -Math.PI / 4;
    ring3.rotation.z = Math.PI / 3;
    heroGroup.add(ring3);

    heroGroup.add(createParticleField(500, 7, 0xE63946));
    heroGroup.position.set(0, 0.3, 0);
    heroGroup.userData.sectionId = 'hero';
    scene.add(heroGroup);
    sectionGroups.hero = heroGroup;

    archGroup = createArchNodes();
    archGroup.userData.sectionId = 'architecture';
    archGroup.visible = false;
    scene.add(archGroup);
    sectionGroups.architecture = archGroup;

    techGroup = createTechVisual();
    techGroup.userData.sectionId = 'technology';
    techGroup.visible = false;
    scene.add(techGroup);
    sectionGroups.technology = techGroup;

    showcaseGroup = createShowcaseElements();
    showcaseGroup.userData.sectionId = 'showcase';
    showcaseGroup.visible = false;
    scene.add(showcaseGroup);
    sectionGroups.showcase = showcaseGroup;

    // Background stars
    const starsGeo = new THREE.BufferGeometry();
    const starsCount = 1500;
    const starsPositions = new Float32Array(starsCount * 3);
    for (let i = 0; i < starsCount; i++) {
        starsPositions[i * 3] = (Math.random() - 0.5) * 20;
        starsPositions[i * 3 + 1] = (Math.random() - 0.5) * 20;
        starsPositions[i * 3 + 2] = -3 - Math.random() * 8;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
    const starsMat = new THREE.PointsMaterial({
        color: 0x666688, size: 0.015, transparent: true,
        opacity: 0.6, depthWrite: false,
    });
    const stars = new THREE.Points(starsGeo, starsMat);
    stars.name = 'stars';
    scene.add(stars);
}

/* ─── Scroll-to-Section Mapping ─── */
function getSectionFromScroll(norm) {
    if (norm < SECTION_RANGES.architecture.start) return { id: 'hero', range: SECTION_RANGES.hero };
    if (norm < SECTION_RANGES.technology.start) return { id: 'architecture', range: SECTION_RANGES.architecture };
    if (norm < SECTION_RANGES.showcase.start) return { id: 'technology', range: SECTION_RANGES.technology };
    if (norm < SECTION_RANGES.footer.start) return { id: 'showcase', range: SECTION_RANGES.showcase };
    return { id: 'footer', range: SECTION_RANGES.footer };
}

function getSectionProgress(norm, range) {
    return THREE.MathUtils.clamp((norm - range.start) / (range.end - range.start), 0, 1);
}

/* ─── Smooth Camera Path ─── */
function updateCameraFromScroll() {
    const section = getSectionFromScroll(STATE.scrollNorm);
    const progress = getSectionProgress(STATE.scrollNorm, section.range);
    STATE.sectionProgress = progress;

    const kf = CAMERA_KEYFRAMES[section.id];
    if (!kf) return;

    // Eased progress for smoother motion
    const eased = easeInOutCubic(progress);

    // Interpolate position
    const targetPos = new THREE.Vector3().lerpVectors(kf.posStart, kf.posEnd, eased);
    const targetLook = new THREE.Vector3().lerpVectors(kf.lookStart, kf.lookEnd, eased);

    // Add mouse parallax offset
    const parallaxStrength = 0.3;
    targetPos.x += (STATE.mouseX - 0.5) * parallaxStrength;
    targetPos.y += (STATE.mouseY - 0.5) * parallaxStrength * 0.6;

    // Camera shake
    if (STATE.shakeAmount > 0.001) {
        targetPos.x += (Math.random() - 0.5) * STATE.shakeAmount;
        targetPos.y += (Math.random() - 0.5) * STATE.shakeAmount * 0.7;
        targetPos.z += (Math.random() - 0.5) * STATE.shakeAmount * 0.4;
    }

    // Smooth interpolation to target
    const smoothFactor = 3.5;
    camera.position.lerp(targetPos, smoothFactor * STATE.delta);
    camera.lookAt(targetLook);
}

/* ─── Depth Fog Control ─── */
function updateFog() {
    const targetDensity = STATE.targetFogDensity;
    STATE.fogDensity += (targetDensity - STATE.fogDensity) * 2.5 * STATE.delta;

    // Map fog density to near/far
    const near = THREE.MathUtils.lerp(15, 2.5, STATE.fogDensity);
    const far = THREE.MathUtils.lerp(40, 6, STATE.fogDensity);
    sceneFog.near = near;
    sceneFog.far = far;

    // Tint fog toward white in tech section
    const fogColor = new THREE.Color().lerpColors(
        new THREE.Color(0x0a0a0a),
        new THREE.Color(0x1a1a2a),
        STATE.lightColorMix
    );
    sceneFog.color = fogColor;
}

/* ─── Dynamic Lighting ─── */
function updateLighting() {
    // Shift from red accent (hero) to white/blue (tech/showcase)
    const mix = STATE.lightColorMix;

    // Rim light: red → steel blue
    const rimColor = new THREE.Color().lerpColors(
        new THREE.Color(0xE63946),
        new THREE.Color(0x5B7A9E),
        mix
    );
    rimLight.color.copy(rimColor);
    rimLight.intensity = 1.8 - mix * 0.6;

    // Fill light: blue → white
    const fillColor = new THREE.Color().lerpColors(
        new THREE.Color(0x5B7A9E),
        new THREE.Color(0x8899bb),
        mix
    );
    fillLight.color.copy(fillColor);

    // Ambient increases for tech clarity
    ambientLight.intensity = 0.6 + mix * 0.4;

    // Key light dims slightly in foggy sections
    keyLight.intensity = 2.5 - STATE.fogDensity * 1.5;
}

/* ─── Shader Uniform Sync ─── */
function syncShaderUniforms(group) {
    const scrollSpeed = Math.abs(STATE.scrollVelocity);
    group.traverse((child) => {
        if (!child.material || !child.material.uniforms) return;

        if (child.userData && child.userData.isGlow) {
            child.material.uniforms.uTime.value = STATE.time;
            child.material.uniforms.uScrollSpeed.value = scrollSpeed;
            child.material.uniforms.uIntensity.value = STATE.glowIntensity;
        }
        if (child.userData && (child.userData.isParticles || child.userData.isFlow)) {
            child.material.uniforms.uTime.value = STATE.time;
            child.material.uniforms.uSpeed.value = STATE.particleSpeed;
            child.material.uniforms.uIntensity.value = STATE.glowIntensity;
        }
    });
}

/* ─── Update Section-Dependent State ─── */
function updateSectionState() {
    const section = getSectionFromScroll(STATE.scrollNorm);

    switch (section.id) {
        case 'hero':
            STATE.targetFogDensity = 0.0;
            STATE.glowIntensity = 0.7 + STATE.scrollVelocity * 3;
            STATE.particleSpeed = 1.0 + STATE.scrollVelocity * 5;
            STATE.lightColorMix = 0.0;
            break;
        case 'architecture':
            STATE.targetFogDensity = 0.12;
            STATE.glowIntensity = 0.65;
            STATE.particleSpeed = 1.2;
            STATE.lightColorMix = 0.1;
            break;
        case 'technology':
            STATE.targetFogDensity = 0.45;
            STATE.glowIntensity = 0.5;
            STATE.particleSpeed = 1.5;
            STATE.lightColorMix = 0.7;
            break;
        case 'showcase':
            STATE.targetFogDensity = 0.2;
            STATE.glowIntensity = 0.75;
            STATE.particleSpeed = 1.1;
            STATE.lightColorMix = 0.35;
            break;
        case 'footer':
            STATE.targetFogDensity = 0.6;
            STATE.glowIntensity = 0.3;
            STATE.particleSpeed = 0.6;
            STATE.lightColorMix = 0.5;
            break;
    }

    // Smooth values
    STATE.glowIntensity += (STATE.glowIntensity - (0.5 + STATE.scrollVelocity)) * 2 * STATE.delta;
    STATE.particleSpeed += (STATE.particleSpeed - 1.0) * 2 * STATE.delta;
}

/* ─── Scroll Progress Bar ─── */
function updateScrollProgressBar() {
    if (scrollProgressBar) {
        scrollProgressBar.style.width = `${STATE.scrollNorm * 100}%`;
    }
}

/* ─── Section Indicator Dots ─── */
function updateSectionDots() {
    const section = getSectionFromScroll(STATE.scrollNorm);
    sectionDots.forEach((dot) => {
        dot.classList.toggle('fx-active', dot.dataset.section === section.id);
    });
}

/* ─── Fog Overlay ─── */
function updateFogOverlay() {
    if (!fogOverlay) return;
    fogOverlay.classList.toggle('fx-fog-light', STATE.fogDensity > 0.15);
    fogOverlay.classList.toggle('fx-fog-heavy', STATE.fogDensity > 0.35);
}

/* ─── Content Shake on Section Transition ─── */
function triggerContentShake() {
    if (!contentEl || STATE.reduceMotion) return;
    contentEl.classList.add('fx-shaking');
    setTimeout(() => contentEl.classList.remove('fx-shaking'), 450);
}

/* ─── Section Flash ─── */
function triggerSectionFlash() {
    if (!sectionFlash) return;
    sectionFlash.classList.add('fx-active');
    setTimeout(() => sectionFlash.classList.remove('fx-active'), 180);
}

/* ─── Scroll-Driven Node Connections ─── */
function updateArchitectureEdges() {
    if (!archGroup || !archGroup.visible) return;
    const progress = STATE.sectionProgress;
    const section = getSectionFromScroll(STATE.scrollNorm);
    if (section.id !== 'architecture') return;

    // Reveal beams progressively
    const beamChildren = [];
    const nodeChildren = [];
    archGroup.traverse((child) => {
        if (child.isMesh && child.geometry && child.geometry.type === 'CylinderGeometry') {
            beamChildren.push(child);
        }
        if (child.userData && typeof child.userData.nodeIndex === 'number') {
            nodeChildren.push(child);
        }
    });

    // Scale beam opacity based on scroll progress through architecture
    beamChildren.forEach((beam, i) => {
        const beamThreshold = i / (beamChildren.length || 1);
        const beamVisible = progress > beamThreshold;
        beam.material.transparent = true;
        beam.material.opacity = beamVisible ? 0.85 : 0.05;
        beam.material.emissiveIntensity = beamVisible ? 0.3 + progress * 0.5 : 0.05;
    });

    // Activate nodes (glow on the active one)
    nodeChildren.forEach((node, i) => {
        const nodeThreshold = i / (nodeChildren.length || 1);
        const isActive = progress > nodeThreshold;
        if (node.children && node.children[0]) {
            const shell = node.children[0];
            if (shell.material && shell.material.emissiveIntensity !== undefined) {
                shell.material.emissiveIntensity = isActive ? 0.6 : 0.1;
            }
        }
    });
}

/* ─── Animation Loop ─── */
function animateHeroGroup(group, dt) {
    group.children.forEach((child) => {
        if (child.userData && child.userData.rotate) {
            const rs = child.userData.rotSpeed;
            child.rotation.x += rs.x * dt;
            child.rotation.y += rs.y * dt;
            child.rotation.z += rs.z * dt;
        }
        if (child.userData && child.userData.isGlow) {
            child.rotation.z += 0.12 * dt;
            child.rotation.x += 0.06 * dt;
        }
    });
    const speedMul = 1 + STATE.scrollVelocity * 8;
    group.position.y = 0.3 + Math.sin(STATE.time * 0.6 * speedMul) * 0.2;
    syncShaderUniforms(group);
}

function animateArchGroup(group, dt) {
    group.children.forEach((child) => {
        if (child.userData && typeof child.userData.nodeIndex === 'number') {
            const idx = child.userData.nodeIndex;
            const amp = 0.15 + STATE.scrollVelocity * 0.3;
            child.position.y = child.userData.baseY + Math.sin(STATE.time * 1.5 + idx) * amp;
            child.rotation.y += 0.3 * dt;
            child.rotation.x += 0.15 * dt;
        }
    });
    syncShaderUniforms(group);
}

function animateTechGroup(group, dt) {
    group.children.forEach((child) => {
        if (child.userData && child.userData.ringSpeed) {
            const speedMul = 1 + STATE.scrollVelocity * 3;
            if (child.userData.ringAxis === 'y') child.rotation.y += child.userData.ringSpeed * speedMul * dt;
            else child.rotation.x += child.userData.ringSpeed * speedMul * dt;
        }
        if (child.userData && child.userData.rotSpeed) {
            const rs = child.userData.rotSpeed;
            const sm = 1 + STATE.scrollVelocity * 2;
            child.rotation.x += rs.x * sm * dt;
            child.rotation.y += rs.y * sm * dt;
            child.rotation.z += rs.z * sm * dt;
        }
    });
    syncShaderUniforms(group);
}

function animateShowcaseGroup(group, dt) {
    group.children.forEach((child) => {
        if (child.userData && child.userData.floatSpeed) {
            const speedMul = 1 + STATE.scrollVelocity * 2;
            child.position.y += Math.sin(STATE.time * child.userData.floatSpeed * speedMul + child.userData.floatOffset) * child.userData.floatAmp * dt;
            child.rotation.y += 0.25 * dt;
            // Tilt toward camera based on scroll
            child.rotation.x = (STATE.sectionProgress - 0.5) * 0.3;
        }
    });
    syncShaderUniforms(group);
}

function animate() {
    requestAnimationFrame(animate);

    STATE.delta = Math.min(STATE.clock.getDelta(), 0.1);
    STATE.time += STATE.delta;

    if (STATE.reduceMotion) STATE.delta *= 0.3;

    // Smooth state interpolation
    STATE.mouseX += (STATE.targetMouseX - STATE.mouseX) * 3 * STATE.delta;
    STATE.mouseY += (STATE.targetMouseY - STATE.mouseY) * 3 * STATE.delta;
    STATE.scrollY += (STATE.targetScrollY - STATE.scrollY) * 5 * STATE.delta;

    // Scroll velocity (for speed-reactive effects)
    STATE.scrollVelocity = Math.abs(STATE.targetScrollY - STATE.prevScrollY) / Math.max(STATE.delta, 0.001);
    STATE.scrollVelocity = THREE.MathUtils.clamp(STATE.scrollVelocity / 1000, 0, 3);
    STATE.prevScrollY = STATE.targetScrollY;

    // Normalize scroll
    const docH = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    STATE.scrollNorm = THREE.MathUtils.clamp(STATE.targetScrollY / docH, 0, 1);

    // Decay camera shake
    STATE.shakeAmount *= Math.exp(-STATE.shakeDecay * STATE.delta);

    // Update all systems
    updateSectionState();
    updateFog();
    updateLighting();
    updateCameraFromScroll();
    updateArchitectureEdges();
    updateScrollProgressBar();
    updateSectionDots();
    updateFogOverlay();

    // Animate visible groups
    if (heroGroup && heroGroup.visible) animateHeroGroup(heroGroup, STATE.delta);
    if (archGroup && archGroup.visible) animateArchGroup(archGroup, STATE.delta);
    if (techGroup && techGroup.visible) animateTechGroup(techGroup, STATE.delta);
    if (showcaseGroup && showcaseGroup.visible) animateShowcaseGroup(showcaseGroup, STATE.delta);

    // Stars
    const stars = scene.getObjectByName('stars');
    if (stars) {
        stars.rotation.y += 0.02 * STATE.delta;
        stars.rotation.x += 0.008 * STATE.delta;
    }

    // Render with motion blur
    if (STATE.reduceMotion || STATE.isMobile) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
    } else {
        // Motion blur: blend current frame with previous
        renderer.setRenderTarget(prevFrameTexture);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);

        if (motionBlurQuad && motionBlurQuad.material.uniforms) {
            motionBlurQuad.material.uniforms.tCurrent.value = prevFrameTexture.texture;
            motionBlurQuad.material.uniforms.tPrevious.value = prevFrameTexture.texture;
            motionBlurQuad.material.uniforms.uBlend.value = 0.08 + STATE.scrollVelocity * 0.15;
        }

        // Direct render without fullscreen quad for now (perf)
        renderer.render(scene, camera);
    }
}

/* ─── Section Visibility ─── */
let lastSectionId = 'hero';

function setActiveSection(sectionId) {
    if (lastSectionId === sectionId) return;

    // Trigger camera shake on section change
    STATE.shakeAmount = 0.15;
    STATE.sectionEnterTime = STATE.time;

    // Hide all
    Object.values(sectionGroups).forEach((g) => { if (g) g.visible = false; });

    // Show active
    const active = sectionGroups[sectionId];
    if (active) active.visible = true;

    lastSectionId = sectionId;

    // Cinematic feedback
    triggerContentShake();
    triggerSectionFlash();

    // Update nav
    const hrefMap = {
        hero: '#fx-hero', architecture: '#fx-architecture',
        technology: '#fx-technology', showcase: '#fx-showcase',
        footer: '#fx-footer',
    };
    navAnchors.forEach((a) => {
        a.classList.toggle('fx-active', a.getAttribute('href') === hrefMap[sectionId]);
    });
}

/* ─── Scroll Handling ─── */
function onScroll() {
    STATE.targetScrollY = window.scrollY;
    navEl.classList.toggle('fx-scrolled', STATE.targetScrollY > 40);

    // Determine section from scroll
    const section = getSectionFromScroll(STATE.scrollNorm);
    if (section.id !== lastSectionId) {
        setActiveSection(section.id);
    }
}

/* ─── Parallax DOM Elements ─── */
function updateParallax() {
    parallaxEls.forEach((el) => {
        const depth = parseFloat(el.dataset.fxParallax) || 0.2;
        const rect = el.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const viewCenter = STATE.height / 2;
        const offset = (centerY - viewCenter) / STATE.height;
        const translateY = offset * depth * 60;
        el.style.transform = `translate3d(0, ${translateY}px, 0)`;
    });
}

/* ─── Intersection Observer for Section Switching ─── */
function initSectionObserver() {
    const options = {
        root: null,
        rootMargin: '-25% 0px -25% 0px',
        threshold: 0,
    };
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                const sceneName = entry.target.dataset.scene;
                if (sceneName && sceneName !== lastSectionId) {
                    setActiveSection(sceneName);
                }
            }
        });
    }, options);
    sections.forEach((s) => observer.observe(s));
}

/* ─── Mouse Tracking ─── */
function onMouseMove(e) {
    STATE.targetMouseX = e.clientX / STATE.width;
    STATE.targetMouseY = e.clientY / STATE.height;
}
function onTouchMove(e) {
    if (e.touches.length > 0) {
        STATE.targetMouseX = e.touches[0].clientX / STATE.width;
        STATE.targetMouseY = e.touches[0].clientY / STATE.height;
    }
}

/* ─── Card Mouse Tracking ─── */
function initCardTracking() {
    document.querySelectorAll('.fx-card').forEach((card) => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            card.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`);
            card.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`);
        });
        card.addEventListener('mouseleave', () => {
            card.style.setProperty('--mx', '50%');
            card.style.setProperty('--my', '50%');
        });
    });
}

/* ─── Stats Counter ─── */
function animateStats() {
    statEls.forEach((el) => {
        const target = parseFloat(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        const isFloat = target % 1 !== 0;
        const duration = 1800;
        const startTime = performance.now();

        function update(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = target * eased;
            el.textContent = (isFloat ? current.toFixed(2) : Math.floor(current)) + suffix;
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                el.textContent = target + suffix;
            }
        }
        requestAnimationFrame(update);
    });
}

/* ─── Reveal on Scroll ─── */
function initRevealObserver() {
    if (STATE.reduceMotion) {
        revealEls.forEach((el) => el.classList.add('fx-visible'));
        return;
    }
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fx-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach((el) => {
        el.classList.add('fx-reveal');
        observer.observe(el);
    });
}

function initStatsObserver() {
    if (statEls.length === 0) return;
    const statsContainer = document.querySelector('.fx-stats');
    if (!statsContainer) return;
    let animated = false;
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !animated) {
            animated = true;
            animateStats();
            observer.unobserve(statsContainer);
        }
    }, { threshold: 0.3 });
    observer.observe(statsContainer);
}

/* ─── Mobile Navigation ─── */
function initMobileNav() {
    if (!navToggle || !navLinks) return;
    navToggle.addEventListener('click', () => {
        const isOpen = navLinks.classList.toggle('fx-open');
        navToggle.classList.toggle('fx-open', isOpen);
        navToggle.setAttribute('aria-expanded', isOpen);
    });
    navLinks.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('fx-open');
            navToggle.classList.remove('fx-open');
            navToggle.setAttribute('aria-expanded', 'false');
        });
    });
}

/* ─── Smooth Anchor Scroll ─── */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', function (e) {
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: STATE.reduceMotion ? 'auto' : 'smooth' });
            }
        });
    });
}

/* ─── Web Audio Ambient ─── */
function initAmbientAudio() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();

        function createDrone(freq, gainVal, type = 'sine') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(gainVal, ctx.currentTime + 2);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            return { osc, gain };
        }

        let started = false;
        const drones = [];

        function startAudio() {
            if (started) return;
            started = true;
            if (ctx.state === 'suspended') ctx.resume();
            drones.push(createDrone(55, 0.04, 'sine'));
            drones.push(createDrone(82.5, 0.02, 'triangle'));
            drones.push(createDrone(110, 0.015, 'sine'));
            setInterval(() => {
                if (ctx.state === 'suspended' || drones.length < 3) return;
                const t = ctx.currentTime;
                drones[0].osc.frequency.linearRampToValueAtTime(55 + Math.sin(t * 0.3) * 1.5, t + 0.5);
                drones[1].osc.frequency.linearRampToValueAtTime(82.5 + Math.cos(t * 0.25) * 2, t + 0.5);
            }, 500);
        }

        ['click', 'touchstart', 'scroll'].forEach((evt) => {
            document.addEventListener(evt, startAudio, { once: false });
        });
        const cleanup = () => {
            if (started) {
                ['click', 'touchstart', 'scroll'].forEach((evt) => {
                    document.removeEventListener(evt, startAudio);
                });
            }
        };
        document.addEventListener('click', cleanup, { once: true });
    } catch (e) { /* silent degrade */ }
}

/* ─── Resize Handler ─── */
function onResize() {
    STATE.width = window.innerWidth;
    STATE.height = window.innerHeight;
    STATE.isMobile = STATE.width < 768;
    STATE.dpr = Math.min(window.devicePixelRatio, 2);
    camera.aspect = STATE.width / STATE.height;
    camera.updateProjectionMatrix();
    renderer.setSize(STATE.width, STATE.height);
    renderer.setPixelRatio(STATE.dpr);
    if (motionBlurQuad && motionBlurQuad.material.uniforms) {
        motionBlurQuad.material.uniforms.uResolution.value.set(STATE.width, STATE.height);
    }
}

/* ─── Loading Complete ─── */
function finishLoading() {
    STATE.isLoaded = true;
    if (loaderEl) {
        loaderEl.classList.add('fx-hidden');
        setTimeout(() => {
            if (loaderEl.parentNode) loaderEl.parentNode.removeChild(loaderEl);
        }, 800);
    }
}

/* ─── Utility ─── */
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function debounce(fn, ms) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

/* ─── Init ─── */
function init() {
    initThree();
    buildScene();
    initSectionObserver();
    initRevealObserver();
    initStatsObserver();
    initCardTracking();
    initMobileNav();
    initSmoothScroll();
    initAmbientAudio();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('resize', debounce(onResize, 150));

    document.documentElement.classList.remove('no-js');
    document.documentElement.classList.add('fx-js');
    setActiveSection('hero');
    animate();

    // Periodic parallax update (less frequent than animation frame)
    setInterval(updateParallax, 50);

    setTimeout(finishLoading, 1200);
}

/* ─── Boot ─── */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
