// The homepage's WebGL layer: a cinematic opening (the Milky Way -> the
// name in particles -> a networked globe) that settles into a living backdrop
// behind the intro cards, then carries the same particles down the page,
// reshaping them into a formation for every section as it scrolls past.
// Loaded on demand by the bootstrap script in components/introduction.html.
import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  Euler,
  Group,
  LineSegments,
  Matrix3,
  Matrix4,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "/lib/three/three.module.min.js";

const FOV = 45;
const CAM_Z = 60;
const NAME = "MANOJ SATISHKUMAR";

// Cinematic, in seconds: origin (galaxy) -> the name -> the career, one
// company at a time -> the globe it reaches today -> who he is -> the cards.
// Every hand-off between formations is long, so the particles drift from one
// to the next rather than snap.
const TO_NAME = [3.6, 6.6]; // the galaxy streams into the name
const NAME_AT = TO_NAME[1];
const CO_START = NAME_AT + 4.2; // first company fully formed
const CO_STEP = 7.0; // one company to the next: at least 5 s on screen each
const CO_MORPH = 3.2; // of which the particles are in flight
const CO_END = CO_START + 4 * CO_STEP + 4.2; // last company hands over to the globe
const coAt = (k) => CO_START + k * CO_STEP;
// Captions hand over halfway through each morph
const coSwap = (k) => coAt(k) - CO_MORPH / 2;

const REVEAL = CO_END + 6.5;
const CUE = { reveal: REVEAL, cards: REVEAL + 0.35, end: REVEAL + 1.5 };
const CAPTIONS = [
  ["chaos", 0.9, TO_NAME[0] + 0.4],
  ["name", NAME_AT - 0.7, NAME_AT + 2.0],
  ["co0", coAt(0) - 0.6, coSwap(1)],
  ["co1", coSwap(1) + 0.15, coSwap(2)],
  ["co2", coSwap(2) + 0.15, coSwap(3)],
  ["co3", coSwap(3) + 0.15, coSwap(4)],
  ["co4", coSwap(4) + 0.15, CO_END + 0.2],
  ["scale", CO_END + 1.4, CO_END + 4.4],
  ["roles", CO_END + 4.4, REVEAL + 0.1],
  ["hint", 2.0, NAME_AT + 6.0],
];

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const span = (t, a, b) => clamp01((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const smoothstep = (a, b, x) => {
  const k = span(x, a, b);
  return k * k * (3 - 2 * k);
};
const easeInOut = (x) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

// 0..1..0 over each company morph, with the index of the one in flight
function coFlight(t) {
  for (let k = 1; k < 5; k++) {
    const m = span(t, coAt(k) - CO_MORPH, coAt(k));
    if (m > 0 && m < 1) return { f: Math.sin(Math.PI * m), k };
  }
  return { f: 0, k: 0 };
}

function timeline(t) {
  let co = 0;
  for (let k = 1; k < 5; k++) co += span(t, coAt(k) - CO_MORPH, coAt(k));
  return {
    // The galaxy is there from the first frame while the camera eases in
    galIn: span(t, 0, TO_NAME[0] + 1.0),
    toText: span(t, TO_NAME[0], TO_NAME[1]),
    // cj: the name hands over to the companies, which hand over to the globe
    // once it has mostly formed beneath them
    cj: span(t, NAME_AT + 1.9, CO_START) * (1 - span(t, CO_END + 0.8, CO_END + 3.0)),
    co,
    toGlobe: span(t, CO_END, CO_END + 2.6),
    rim: span(t, CO_END + 1.2, CO_END + 2.8),
    arcs: span(t, CO_END + 1.5, CO_END + 3.4),
    ambient: easeInOut(span(t, CUE.reveal, CUE.reveal + 1.3)),
  };
}

const STATE_KEYS = ["galIn", "toText", "cj", "co", "toGlobe", "rim", "arcs", "ambient"];
const REST = { galIn: 1, toText: 0, cj: 0, co: 0, toGlobe: 1, rim: 1, arcs: 1, ambient: 1 };

// Blends premultiplied colour, so one material can glow additively on the
// dark curtain (alpha tracks brightness) and paint normally over a light page
// (alpha 1) by moving a single uniform between the two.
const BLEND = {
  transparent: true,
  depthWrite: false,
  depthTest: false,
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
  blendSrcAlpha: OneFactor,
  blendDstAlpha: OneMinusSrcAlphaFactor,
};

// Fades fragments outside the intro's visible band, so the fixed canvas never
// draws under the menubar, the mobile bottom bar or the next section.
const EDGE_GLSL = /* glsl */ `
  uniform float uEdge;
  uniform float uViewH;
  uniform float uPR;
  uniform vec4 uClip;
  float edgeFade() {
    float y = uViewH - gl_FragCoord.y / uPR;
    float f = smoothstep(uClip.x, uClip.y, y) * (1.0 - smoothstep(uClip.z, uClip.w, y));
    return mix(1.0, f, uEdge);
  }
`;

const POINTS_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uGalT;
  uniform float uGalIn;
  uniform vec2 uGalTilt; // tilt toward the camera, roll in the frame
  uniform float uToText;
  uniform float uToGlobe;
  uniform float uSize;
  uniform float uPR;
  uniform float uLight;
  uniform float uSweep;
  uniform float uTextW;
  uniform float uGalR;
  uniform vec4 uWave;
  uniform vec3 uGlobeC;
  uniform float uGlobeS;
  uniform vec2 uGlobeRot;
  // Scroll journey: formation A morphing into B, both in shape space
  uniform float uJourney;
  uniform float uMorph;
  uniform mat3 uRotA;
  uniform mat3 uRotB;
  uniform vec3 uOffA;
  uniform vec3 uOffB;
  uniform vec3 uPalA[3];
  uniform vec3 uPalB[3];
  uniform vec2 uAlphaAB;
  uniform vec2 uSizeAB;
  uniform vec3 uCenter;
  uniform float uDrama;
  uniform float uDramaW;
  uniform float uStir;
  uniform float uScrollW;
  uniform float uWorldH;

  attribute vec4 aGalC;
  attribute vec3 aText;
  attribute vec3 aGlobe;
  attribute vec4 aRand;
  attribute vec4 aA;
  attribute vec4 aB;

  varying vec3 vColor;
  varying float vAlpha;

  vec2 rot2(vec2 v, float a) {
    float c = cos(a), s = sin(a);
    return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
  }

  vec3 flow(vec3 p, float t) {
    return vec3(
      sin(p.y * 0.9 + t * 0.9) + sin(p.z * 0.7 - t * 0.6),
      sin(p.z * 0.8 + t * 0.7) + sin(p.x * 0.6 + t * 1.1),
      sin(p.x * 0.9 - t * 0.8) + sin(p.y * 0.5 + t * 0.5)
    ) * 0.5;
  }

  float ease(float x) {
    return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) * 0.5;
  }

  // Per-particle progress: each one starts after its own delay d (0..1)
  float local(float u, float d) {
    return clamp((u - d * 0.45) / 0.55, 0.0, 1.0);
  }

  vec3 ramp(vec3 a, vec3 b, vec3 c, float t) {
    return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, t * 2.0 - 1.0);
  }

  void main() {
    float kind = aRand.w; // 0 dust, 1 ocean, 2 land
    float dust = 1.0 - step(0.5, kind);
    float land = step(1.5, kind);
    float tn = clamp(aText.x / uTextW + 0.5, 0.0, 1.0);

    // Galaxy: the bar turns rigidly, the arms trail it and wind slowly;
    // stars light up from the core outward
    vec3 g = position;
    float rn = length(g.xz) / uGalR;
    g.xz = rot2(g.xz, -uGalT * (0.05 + 0.14 / (1.0 + 5.0 * max(rn - 0.2, 0.0))));
    g.yz = rot2(g.yz, -uGalTilt.x);
    g.xy = rot2(g.xy, uGalTilt.y);
    float galIn = clamp(0.15 + uGalIn * 14.0 - (0.55 * min(rn, 1.0) + 0.45 * aRand.y) * 2.5, 0.0, 1.0);

    // The name; dust drifts around it
    vec3 t = aText;
    t += dust * flow(aText * 0.08, uTime * 0.25) * 1.6;
    t.z += (1.0 - dust) * sin(uTime * 1.4 + aRand.z * 6.2832) * 0.15;

    // Globe, or starfield for dust
    vec3 o = aGlobe;
    float facing = 1.0;
    if (kind > 0.5) {
      o.xz = rot2(o.xz, uGlobeRot.y);
      o.yz = rot2(o.yz, uGlobeRot.x);
      facing = normalize(o).z;
      o = o * uGlobeS + uGlobeC;
    } else {
      o += flow(aGlobe * 0.06, uTime * 0.2) * 1.8;
    }

    float e1 = ease(local(uToText, mix(0.6 * tn + 0.4 * aRand.y, aRand.y, dust)));
    float e2 = ease(local(uToGlobe, 0.5 * tn + 0.5 * fract(aRand.y * 7.13)));

    vec3 p = mix(g, t, e1);
    float s1 = sin(3.14159 * e1);
    p.xy = rot2(p.xy, s1 * (0.5 + aRand.z) * 0.8);
    p += flow(p * 0.15, uTime) * s1 * 5.0;
    p = mix(p, o, e2);
    float s2 = sin(3.14159 * e2);
    p += flow(p * 0.12 + 3.0, uTime * 1.2) * s2 * 7.0;

    // Below the intro, every section reshapes the particles; dust becomes a
    // starfield that drifts with the scroll
    float ej = 0.0;
    float em = 0.0;
    float toneJ = 0.0;
    float flare = 0.0;
    float arc = 0.0;
    if (uJourney > 0.0) {
      vec3 jp;
      if (kind > 0.5) {
        // The cinematic's company morphs (uDrama) burn the old mark away
        // from its left edge, whirl it into a vortex that bursts toward the
        // lens, and condense the next mark out of it
        float wipe = clamp(0.5 + aA.x / uDramaW * 0.5, 0.0, 1.0);
        float delay = mix(fract(aRand.y * 3.71), wipe * 0.8 + fract(aRand.y * 3.71) * 0.2, uDrama);
        em = ease(local(uMorph, delay));
        arc = sin(3.14159 * em);
        jp = mix(uRotA * aA.xyz + uOffA, uRotB * aB.xyz + uOffB, em);
        jp += flow(jp * 0.1 + 5.0, uTime * 1.1) * arc * mix(6.0, 3.5, uDrama);
        if (uDrama > 0.0) {
          // The vortex leans toward the middle of the frame, so the burst
          // toward the lens stays on screen
          vec3 c = mix(uOffA, uOffB, 0.5);
          vec3 rel = jp - c;
          rel.xy = rot2(rel.xy, arc * (2.0 + aRand.z * 2.8) * uDrama);
          rel.xy *= 1.0 + arc * (0.1 + aRand.x * 0.4) * uDrama;
          rel.z += arc * (aRand.z - 0.3) * 14.0 * uDrama;
          jp = c + rel;
          jp.x -= arc * c.x * 0.3 * uDrama;
          float ignite = smoothstep(0.0, 0.03, em) * (1.0 - smoothstep(0.03, 0.22, em));
          float settle = smoothstep(0.82, 0.95, em) * (1.0 - smoothstep(0.95, 1.0, em));
          flare = (ignite + settle * 0.7) * uDrama;
        }
        jp += uCenter;
        toneJ = mix(aA.w, aB.w, em);
      } else {
        jp = aGlobe;
        float span = (${CAM_Z.toFixed(1)} - jp.z) / ${CAM_Z.toFixed(1)} * 0.6 * uWorldH;
        float drift = uScrollW * ${CAM_Z.toFixed(1)} / (${CAM_Z.toFixed(1)} - jp.z);
        jp.y = mod(jp.y + drift + span, 2.0 * span) - span;
        jp += flow(aGlobe * 0.06, uTime * 0.2) * 1.8;
        jp.xy += uCenter.xy;
      }
      jp += flow(jp * 0.15, uTime * 1.4) * uStir * 2.2;
      ej = ease(local(uJourney, fract(aRand.y * 5.31) * (1.0 - dust)));
      p = mix(p, jp, ej);
      p += flow(p * 0.12 + 7.0, uTime) * sin(3.14159 * ej) * 6.0 * (1.0 - dust);
    }

    // Landing shockwave: an expanding ring that lifts particles as it passes
    float age = uTime - uWave.w;
    if (age > 0.0 && age < 2.4) {
      vec2 dw = p.xy - uWave.xy;
      float dd = length(dw);
      float w = exp(-pow((dd - age * 26.0) / 3.0, 2.0)) * (1.0 - age / 2.4);
      p.xy += dw / max(dd, 0.001) * w * 2.8;
      p.z += w * 5.0;
    }

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float globeSize = mix(0.85, mix(0.8, 1.2, land), 1.0 - dust);
    float galSize = 0.9 + 0.55 * aGalC.w;
    float size = mix(0.65, 1.6, aRand.x) * mix(mix(galSize, 1.0, e1), globeSize, e2);
    // A pulse of light that travels along each formation
    float pulse = pow(0.5 + 0.5 * sin(toneJ * 12.566 - uTime * 1.8), 10.0) * (1.0 - dust);
    float sizeJ = mix(0.8, 2.0, aRand.x) * (1.0 + pulse * 0.6) * mix(uSizeAB.x, uSizeAB.y, em);
    sizeJ *= 1.0 + flare * 1.3 + arc * 0.45 * uDrama;
    size = mix(size, sizeJ, ej * (1.0 - dust));
    size *= mix(1.0, 1.2, uLight);
    gl_PointSize = size * uSize * uPR * (60.0 / max(-mv.z, 1.0));

    float twinkle = 0.65 + 0.35 * sin(uTime * (1.5 + aRand.x * 2.0) + aRand.z * 40.0);

    // Dark palette
    vec3 galD = aGalC.rgb;
    float galA = min(0.95 * aGalC.w * (0.8 + 0.2 * twinkle), 1.0) * galIn;

    float sweep = exp(-pow((tn - uSweep) * 7.0, 2.0));
    vec3 nameD = ramp(vec3(0.56, 0.64, 1.0), vec3(0.75, 0.52, 0.99), vec3(0.96, 0.45, 0.71), tn);
    nameD = mix(nameD, vec3(1.0), sweep * 0.8);
    vec3 dustD = vec3(0.62, 0.7, 1.0);
    vec3 textD = mix(nameD, dustD, dust);

    vec3 landD = mix(vec3(0.38, 0.66, 1.0), vec3(0.68, 0.56, 1.0), aRand.z);
    vec3 globeD = mix(mix(vec3(0.3, 0.45, 0.95), landD, land), dustD, dust);

    // Light palette (only reached once the curtain has lifted)
    vec3 nameL = ramp(vec3(0.31, 0.27, 0.9), vec3(0.49, 0.23, 0.93), vec3(0.86, 0.15, 0.47), tn);
    vec3 dustL = vec3(0.39, 0.4, 0.95);
    vec3 textL = mix(nameL, dustL, dust);
    vec3 landL = mix(vec3(0.31, 0.27, 0.9), vec3(0.49, 0.23, 0.93), aRand.z);
    vec3 globeL = mix(mix(vec3(0.39, 0.4, 0.95), landL, land), dustL, dust);

    vec3 colD = mix(mix(galD, textD, e1), globeD, e2);
    vec3 colL = mix(mix(galD * 0.55, textL, e1), globeL, e2);
    vColor = mix(colD, colL, uLight);

    float back = mix(0.18, 1.0, smoothstep(-0.35, 0.35, facing));
    float alphaText = mix(0.9 + sweep * 0.1, 0.32 * twinkle, dust);
    float alphaGlobe = mix(mix(0.28 * twinkle, 0.95, land) * back, 0.32 * twinkle, dust);
    float aD = mix(mix(galA, alphaText, e1), alphaGlobe, e2);
    float aL = mix(mix(0.6 * galIn, mix(0.85, 0.22 * twinkle, dust), e1),
                   mix(mix(0.2 * twinkle, 0.7, land) * back, 0.22 * twinkle, dust), e2);
    vAlpha = mix(aD, aL, uLight);

    if (ej > 0.0) {
      // Palettes arrive already mixed for the current theme
      vec3 colJ = mix(ramp(uPalA[0], uPalA[1], uPalA[2], aA.w),
                      ramp(uPalB[0], uPalB[1], uPalB[2], aB.w), em);
      colJ = mix(colJ, vec3(1.0), pulse * 0.55 * (1.0 - uLight));
      // In flight the particles run hot: white at the burning edge, a
      // brightened blend of both brands through the vortex
      colJ = mix(colJ, colJ * 0.45 + 0.55, arc * 0.4 * uDrama);
      colJ = mix(colJ, vec3(1.0, 0.95, 0.9), min(flare, 1.0) * 0.85);
      colJ = mix(colJ, mix(dustD, dustL, uLight), dust);
      float aJ = mix(uAlphaAB.x, uAlphaAB.y, em) * (0.75 + 0.25 * twinkle) + pulse * 0.3 + flare * 0.5;
      aJ = mix(aJ, mix(0.32, 0.22, uLight) * twinkle, dust);
      vColor = mix(vColor, colJ, ej);
      vAlpha = mix(vAlpha, aJ, ej);
    }
  }
`;

const POINTS_FRAG = /* glsl */ `
  uniform float uLight;
  varying vec3 vColor;
  varying float vAlpha;
  ${EDGE_GLSL}
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float glow = pow(max(1.0 - d * 2.0, 0.0), 1.8);
    float disc = 1.0 - smoothstep(0.32, 0.5, d);
    float a = mix(glow, disc, uLight) * vAlpha * edgeFade();
    if (a < 0.004) discard;
    float m = max(vColor.r, max(vColor.g, vColor.b));
    gl_FragColor = vec4(vColor * a, a * mix(m, 1.0, uLight));
  }
`;

const ARCS_VERT = /* glsl */ `
  attribute float aT;
  attribute float aSeed;
  varying float vT;
  varying float vSeed;
  varying float vFacing;
  void main() {
    vT = aT;
    vSeed = aSeed;
    vFacing = normalize(mat3(modelMatrix) * position).z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ARCS_FRAG = /* glsl */ `
  uniform float uArcs;
  uniform float uFade;
  uniform float uTime;
  uniform float uLight;
  varying float vT;
  varying float vSeed;
  varying float vFacing;
  ${EDGE_GLSL}
  void main() {
    float prog = clamp(uArcs * 1.8 - vSeed * 0.8, 0.0, 1.0);
    if (vT > prog) discard;
    float head = fract(uTime * 0.22 + vSeed * 5.3) * 1.3 - 0.15;
    float trail = smoothstep(0.18, 0.0, head - vT) * step(vT, head);
    vec3 dark = mix(vec3(0.35, 0.85, 1.0), vec3(0.97, 0.45, 0.78), vT);
    vec3 light = mix(vec3(0.15, 0.4, 0.95), vec3(0.85, 0.15, 0.5), vT);
    vec3 col = mix(dark, light, uLight);
    col = mix(col, vec3(1.0), trail * 0.5 * (1.0 - uLight));
    float a = (0.18 + trail * 0.9) * mix(0.25, 1.0, smoothstep(-0.3, 0.3, vFacing));
    a *= mix(1.0, 0.8, uLight) * uFade * edgeFade();
    float m = max(col.r, max(col.g, col.b));
    gl_FragColor = vec4(col * a, a * mix(m, 1.0, uLight));
  }
`;

const RIM_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const RIM_FRAG = /* glsl */ `
  uniform float uRim;
  uniform float uLight;
  varying vec3 vN;
  varying vec3 vV;
  ${EDGE_GLSL}
  void main() {
    float f = 1.0 - max(dot(normalize(vN), normalize(vV)), 0.0);
    float a = pow(f, 2.6) * uRim * mix(0.9, 0.35, uLight) * edgeFade();
    vec3 col = mix(vec3(0.42, 0.56, 1.0), vec3(0.39, 0.4, 0.95), uLight);
    gl_FragColor = vec4(col * a, a * mix(0.8, 1.0, uLight));
  }
`;

function randomOnSphere() {
  const u = Math.random() * 2 - 1;
  const th = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return [s * Math.cos(th), u, s * Math.sin(th)];
}

// Stylised continents: a few interfering waves over latitude and longitude
function isLand(x, y, z) {
  const lat = Math.asin(y);
  const lon = Math.atan2(z, x);
  if (Math.abs(lat) > 1.25) return false;
  const v =
    Math.sin(lon * 2 + 0.6) * Math.cos(lat * 2.2) +
    0.65 * Math.sin(lon * 3.3 - lat * 2.6 + 1.7) +
    0.4 * Math.cos(lon * 5.1 + lat * 4.2 + 0.4) +
    0.25 * Math.sin(lon * 9 + lat * 7);
  return v > 0.55;
}

function waitForFont(font) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.race([
    document.fonts.load(font).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 1200)),
  ]);
}

// Samples the name as filled pixels and returns world-space points
function sampleName(lines, maxW, maxH) {
  const fontSize = 180;
  const pad = 20;
  const font = `800 ${fontSize}px Poppins, "Helvetica Neue", Arial, sans-serif`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const style = () => {
    ctx.font = font;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "6px";
  };
  style();
  const lineH = fontSize * 1.05;
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  canvas.width = Math.ceil(textW + pad * 2);
  canvas.height = Math.ceil(lineH * lines.length + pad * 2);
  style();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) =>
    ctx.fillText(line, canvas.width / 2, pad + lineH * (i + 0.5)),
  );

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pts = [];
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      if (data[(y * canvas.width + x) * 4 + 3] > 140) pts.push(x, y);
    }
  }
  const boxH = lineH * lines.length;
  const scale = Math.min(maxW / textW, maxH / boxH);
  return {
    pts,
    scale,
    cx: canvas.width / 2,
    cy: canvas.height / 2,
    width: textW * scale,
    bottom: -(boxH / 2) * scale,
  };
}

// ---------- Section formations ----------
//
// Each maker fills particles [a, b) of a vec4 buffer with a position in shape
// space (centred on the origin, sized from S) and a tone (0..1) that picks the
// palette colour and times the travelling pulse.

const TAU = Math.PI * 2;
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
const put = (out, i, x, y, z, tone) => out.set([x, y, z, tone], i * 4);

// Career: a double helix running along the timeline
function makeHelix(out, a, b, L, S) {
  const len = L.stacked ? L.H * 0.88 : L.W * 0.8;
  const r = S * (L.stacked ? 0.42 : 0.3);
  const turns = 3.2;
  const rungs = 34;
  for (let i = a; i < b; i++) {
    let t;
    let y;
    let z;
    if (i % 6 === 0) {
      t = (((Math.random() * rungs) | 0) + 0.5) / rungs;
      const ang = t * turns * TAU;
      const s = Math.random() * 2 - 1;
      y = Math.cos(ang) * r * s;
      z = Math.sin(ang) * r * s;
    } else {
      t = Math.random();
      const ang = t * turns * TAU + (i % 2 ? Math.PI : 0);
      y = Math.cos(ang) * r + gauss() * r * 0.1;
      z = Math.sin(ang) * r + gauss() * r * 0.1;
    }
    const along = (t - 0.5) * len;
    if (L.stacked) put(out, i, y, along, z, t);
    else put(out, i, along, y, z, t);
  }
}

// Projects: a (2, 3) torus knot
function makeKnot(out, a, b, L, S) {
  const sc = S * 0.34;
  for (let i = a; i < b; i++) {
    const phi = Math.random() * TAU;
    const r = 2 + Math.cos(3 * phi);
    const d = randomOnSphere();
    const tube = 0.24 * Math.sqrt(Math.random());
    put(
      out,
      i,
      (r * Math.cos(2 * phi) + d[0] * tube) * sc,
      (r * Math.sin(2 * phi) + d[1] * tube) * sc,
      (-Math.sin(3 * phi) + d[2] * tube) * sc,
      phi / TAU,
    );
  }
}

// Skills: one orb per skill family, ringed and wired together
function makeOrbs(out, a, b, L, S) {
  const ringR = S * (L.stacked ? 0.8 : 1.15);
  const orbs = 8;
  const centre = (j) => {
    const ang = (j / orbs) * TAU;
    return [Math.cos(ang) * ringR, 0, Math.sin(ang) * ringR];
  };
  for (let i = a; i < b; i++) {
    const kind = i % 10;
    if (kind === 0) {
      const ang = Math.random() * TAU;
      put(out, i, Math.cos(ang) * ringR, gauss() * S * 0.015, Math.sin(ang) * ringR, ang / TAU);
    } else if (kind === 1) {
      const j = (Math.random() * orbs) | 0;
      const c0 = centre(j);
      const c1 = centre(j + 3);
      const t = Math.random();
      const sag = Math.sin(Math.PI * t) * S * 0.12;
      put(
        out,
        i,
        lerp(c0[0], c1[0], t),
        lerp(c0[1], c1[1], t) + sag + gauss() * S * 0.01,
        lerp(c0[2], c1[2], t),
        j / (orbs - 1),
      );
    } else {
      const j = i % orbs;
      const c = centre(j);
      const rr = S * (0.11 + 0.05 * ((j * 5) % 3)) * (0.78 + 0.22 * Math.random());
      const d = randomOnSphere();
      put(out, i, c[0] + d[0] * rr, c[1] + d[1] * rr, c[2] + d[2] * rr, j / (orbs - 1));
    }
  }
}

// Awards: a bevelled five-pointed star
function makeStar(out, a, b, L, S) {
  const R1 = S * 0.95;
  const R0 = R1 * 0.42;
  const v = [];
  for (let k = 0; k < 10; k++) {
    const ang = Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 ? R0 : R1;
    v.push([Math.cos(ang) * r, Math.sin(ang) * r]);
  }
  for (let i = a; i < b; i++) {
    const k = (Math.random() * 10) | 0;
    const p0 = v[k];
    const p1 = v[(k + 1) % 10];
    let x;
    let y;
    let z;
    if (i % 7 === 0) {
      const t = Math.random();
      x = lerp(p0[0], p1[0], t);
      y = lerp(p0[1], p1[1], t);
      z = gauss() * S * 0.015;
    } else {
      // Triangle (centre, p0, p1); the bevel rises toward the centre
      const r1 = Math.sqrt(Math.random());
      const r2 = Math.random();
      x = r1 * (1 - r2) * p0[0] + r1 * r2 * p1[0];
      y = r1 * (1 - r2) * p0[1] + r1 * r2 * p1[1];
      z = (Math.random() < 0.5 ? -1 : 1) * (1 - r1) * R1 * 0.3;
    }
    put(out, i, x, y, z, Math.hypot(x, y) / R1);
  }
}

// Patent: an atom, its electrons riding the pulse
function makeAtom(out, a, b, L, S) {
  const nucleus = S * 0.16;
  const ra = S * (L.stacked ? 0.85 : 1.0);
  const rb = ra * 0.36;
  for (let i = a; i < b; i++) {
    if (i % 5 === 0) {
      const d = randomOnSphere();
      const rr = nucleus * Math.cbrt(Math.random());
      put(out, i, d[0] * rr, d[1] * rr, d[2] * rr, Math.random() * 0.12);
      continue;
    }
    const o = (Math.random() * 3) | 0;
    const th = Math.random() * TAU;
    const ex = Math.cos(th) * ra + gauss() * S * 0.02;
    const ey = Math.sin(th) * rb + gauss() * S * 0.02;
    const rot = (o * Math.PI) / 3;
    put(
      out,
      i,
      ex * Math.cos(rot) - ey * Math.sin(rot),
      ex * Math.sin(rot) + ey * Math.cos(rot),
      gauss() * S * 0.02,
      0.2 + (th / TAU + o / 3) * 0.4,
    );
  }
}

// Education: a Mobius strip, learning that loops back on itself
function makeMobius(out, a, b, L, S) {
  const R = S * 0.78;
  const w = S * 0.3;
  for (let i = a; i < b; i++) {
    const u = Math.random() * TAU;
    const v = (i % 4 === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.random() * 2 - 1) * w;
    const rr = R + v * Math.cos(u / 2);
    put(out, i, rr * Math.cos(u), rr * Math.sin(u), v * Math.sin(u / 2), u / TAU);
  }
}

// Testimonials: giant quotation marks framing the quotes, the closing one
// being the opening one turned half a turn
function makeQuotes(out, a, b, L, S) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const font = '700 360px Georgia, "Times New Roman", serif';
  ctx.font = font;
  const text = "\u201C";
  canvas.width = Math.ceil(ctx.measureText(text).width + 40);
  canvas.height = 460;
  ctx.font = font;
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 20, canvas.height * 0.62);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pts = [];
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      if (data[(y * canvas.width + x) * 4 + 3] > 140) {
        pts.push(x, y);
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  if (!pts.length) return makeKnot(out, a, b, L, S);
  const scale = (S * (L.stacked ? 0.55 : 0.8)) / (y1 - y0);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const gap = S * (L.stacked ? 0.5 : 1.25);
  const lift = S * 0.25;
  const count = pts.length / 2;
  for (let i = a; i < b; i++) {
    const k = ((Math.random() * count) | 0) * 2;
    const x = (pts[k] + Math.random() * 2 - cx) * scale;
    const y = -(pts[k + 1] + Math.random() * 2 - cy) * scale;
    const z = (Math.random() * 2 - 1) * S * 0.07;
    const tone = clamp01(x / ((x1 - x0) * scale) + 0.5) * 0.5;
    if (i % 2) put(out, i, x - gap, y + lift, z, tone);
    else put(out, i, gap - x, -y - lift, z, 0.5 + tone);
  }
}

// Writing: ideas rippling outward across a disc; the pulse rides the ripples
function makeRipples(out, a, b, L, S) {
  const R = S * (L.stacked ? 1.1 : 1.5);
  const k = (TAU * 5) / R;
  for (let i = a; i < b; i++) {
    const r = R * Math.sqrt(Math.random());
    const th = Math.random() * TAU;
    const fall = 1 - (r / R) * 0.6;
    put(
      out,
      i,
      Math.cos(th) * r,
      Math.cos(r * k) * S * 0.09 * fall + gauss() * S * 0.01,
      Math.sin(th) * r,
      r / R,
    );
  }
}

// The opening Milky Way, in the disc's own plane (xz, y up): a warm bulge
// and bar, two major and two minor trailing arms with dust lanes on their
// inner edges, star-forming knots, a faint disc between the arms and a halo.
// Fills pos (xyz) and col (rgb + brightness) for particles 0..N-1.
function makeMilkyWay(pos, col, N, R) {
  const gauss = () => {
    let u = 0;
    while (!u) u = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  };
  const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const CORE = [1.0, 0.94, 0.84];
  const GOLD = [1.0, 0.76, 0.52];
  const ARM_IN = [0.78, 0.72, 1.0];
  const ARM_OUT = [0.4, 0.76, 1.0];
  const PINK = [1.0, 0.42, 0.74];
  const YOUNG = [0.72, 0.86, 1.0];
  const DISC = [0.56, 0.5, 0.96];
  const HALO = [0.7, 0.74, 1.0];

  const barA = 0.45;
  const barL = R * 0.19;
  const pitch = 0.36; // tan of the arms' pitch angle (~20 degrees)
  // [start angle, share]: the two major arms leave the ends of the bar
  const ARMS = [
    [barA, 0.36],
    [barA + Math.PI, 0.36],
    [barA + Math.PI / 2, 0.14],
    [barA + (3 * Math.PI) / 2, 0.14],
  ];
  const pickArm = () => {
    let u = Math.random();
    for (const arm of ARMS) {
      if ((u -= arm[1]) <= 0) return arm;
    }
    return ARMS[0];
  };
  const armAt = (arm, r) => arm[0] + Math.log(r / barL) / pitch;
  const knots = Array.from({ length: 90 }, () => {
    const r = barL + (R - barL) * (0.08 + 0.85 * Math.random());
    const th = armAt(pickArm(), r) + gauss() * 0.04;
    return { x: Math.cos(th) * r, z: Math.sin(th) * r, pink: Math.random() < 0.55 };
  });

  for (let i = 0; i < N; i++) {
    const roll = Math.random();
    let x;
    let y;
    let z;
    let c;
    let w;
    if (roll < 0.14) {
      // Bulge: a squashed, slightly elongated glow along the bar, around a
      // white-hot nucleus
      const s = R * (Math.random() < 0.35 ? 0.025 : 0.07);
      const u = gauss() * s * 1.25;
      const v = gauss() * s;
      x = Math.cos(barA) * u - Math.sin(barA) * v;
      z = Math.sin(barA) * u + Math.cos(barA) * v;
      y = gauss() * s * 0.6;
      c = mix3(CORE, GOLD, Math.min(Math.hypot(x, y, z) / (R * 0.16), 1));
      w = 1.3;
    } else if (roll < 0.22) {
      const along = (Math.random() * 2 - 1) * barL;
      const across = gauss() * R * 0.028;
      x = Math.cos(barA) * along - Math.sin(barA) * across;
      z = Math.sin(barA) * along + Math.cos(barA) * across;
      y = gauss() * R * 0.014;
      c = mix3(GOLD, CORE, 0.35 + 0.4 * Math.random());
      w = 1.0;
    } else if (roll < 0.82) {
      const arm = pickArm();
      const r = barL + (R - barL) * Math.pow(Math.random(), 0.9);
      const rn = r / R;
      const width = R * (0.016 + 0.04 * rn);
      let d = gauss() * width;
      // Dust lane: most stars that would sit on the inner edge are pushed out
      if (d < -0.25 * width && d > -0.8 * width && Math.random() < 0.85) d = -d;
      const rr = r + d;
      const th = armAt(arm, r) + gauss() * 0.03;
      x = Math.cos(th) * rr;
      z = Math.sin(th) * rr;
      y = gauss() * R * 0.01;
      const tone = smoothstep(0.15, 0.95, rn);
      c = mix3(ARM_IN, ARM_OUT, tone);
      if (Math.random() < 0.08) c = YOUNG;
      w = lerp(0.95, 0.7, tone) * (arm[1] < 0.3 ? 0.8 : 1);
    } else if (roll < 0.88) {
      const k = knots[(Math.random() * knots.length) | 0];
      const s = R * 0.009;
      x = k.x + gauss() * s;
      z = k.z + gauss() * s;
      y = gauss() * s * 0.5;
      c = k.pink ? PINK : YOUNG;
      w = 1.25;
    } else if (roll < 0.96) {
      const r = Math.min(-Math.log(1 - Math.random() * 0.98) * R * 0.32, R * 1.15);
      const th = Math.random() * Math.PI * 2;
      x = Math.cos(th) * r;
      z = Math.sin(th) * r;
      y = gauss() * R * 0.015;
      c = DISC;
      w = 0.5;
    } else {
      const r = R * (0.08 + 1.0 * Math.pow(Math.random(), 0.7));
      const ph = Math.random() * Math.PI * 2;
      const ct = Math.random() * 2 - 1;
      const st = Math.sqrt(1 - ct * ct);
      x = Math.cos(ph) * st * r;
      z = Math.sin(ph) * st * r;
      y = ct * r * 0.55;
      c = HALO;
      w = 0.35;
    }
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    col.set([c[0], c[1], c[2], w], i * 4);
  }
}

// Sign-off: back to the galaxy the intro was born from, at its old size
function makeGalaxy(out, a, b, L, S, ctx) {
  const k = 0.8 * ctx.signR / ctx.galR;
  for (let i = a; i < b; i++) {
    const x = ctx.galaxy[i * 3];
    const y = ctx.galaxy[i * 3 + 1];
    const z = ctx.galaxy[i * 3 + 2];
    put(out, i, x * k, y * k, z * k, Math.hypot(x, z) / ctx.galR);
  }
}

// Section ids in page order, each with its formation, motion and palette.
// rot(t) returns Euler angles; alpha is [dark, light].
const JOURNEY = [
  {
    id: "experience",
    make: makeHelix,
    rot: (t, L) => (L.stacked ? [0.25, t * 0.35, 0.15, "XYZ"] : [t * 0.35, 0.22, -0.12, "ZYX"]),
    dark: [0x7dd3fc, 0x818cf8, 0xf472b6],
    light: [0x0284c7, 0x4f46e5, 0xdb2777],
  },
  {
    id: "projects",
    make: makeKnot,
    rot: (t) => [0.5, t * 0.25, 0, "XYZ"],
    dark: [0x818cf8, 0xc084fc, 0x22d3ee],
    light: [0x4338ca, 0x7e22ce, 0x0891b2],
  },
  {
    id: "skill-set",
    make: makeOrbs,
    rot: (t) => [0.42, t * 0.18, 0, "XYZ"],
    dark: [0x38bdf8, 0xa78bfa, 0xf472b6],
    light: [0x0369a1, 0x6d28d9, 0xbe185d],
  },
  {
    id: "achievements",
    make: makeStar,
    rot: (t) => [0.15, t * 0.4, 0, "XYZ"],
    dark: [0xfff7d6, 0xfbbf24, 0xf472b6],
    light: [0xb45309, 0xd97706, 0xbe185d],
  },
  {
    id: "patent",
    make: makeAtom,
    rot: (t) => [0.5, t * 0.3, 0, "XYZ"],
    dark: [0xccfbf1, 0x2dd4bf, 0x818cf8],
    light: [0x0f766e, 0x0d9488, 0x4f46e5],
  },
  {
    id: "education",
    make: makeMobius,
    rot: (t) => [-1.0, 0, t * 0.3, "XYZ"],
    dark: [0xa5b4fc, 0xc084fc, 0x38bdf8],
    light: [0x4338ca, 0x9333ea, 0x0284c7],
  },
  {
    id: "msk-testimony",
    make: makeQuotes,
    rot: (t) => [0.12 * Math.sin(t * 0.5), 0.4 * Math.sin(t * 0.35), 0, "XYZ"],
    dark: [0xf9a8d4, 0xf472b6, 0xa78bfa],
    light: [0xdb2777, 0xbe185d, 0x7c3aed],
  },
  {
    id: "blog-articles",
    make: makeRipples,
    rot: (t) => [0.42, t * 0.08, 0, "XYZ"],
    off: (L) => [0, -L.H * 0.06, 0],
    dark: [0xf0abfc, 0x818cf8, 0x38bdf8],
    light: [0xa21caf, 0x4338ca, 0x0284c7],
    alpha: [0.8, 0.45],
  },
  {
    id: "footer",
    make: makeGalaxy,
    rot: (t) => [-1.05, t * 0.06, 0, "XYZ"],
    off: (L) => [0, L.H * 0.02, 0],
    dark: [0xfff0fa, 0x7c6bff, 0x38c7ff],
    light: [0x6d28d9, 0x4f46e5, 0x0284c7],
  },
].map((def) => ({
  ...def,
  dark: def.dark.map(hexToRgb),
  light: def.light.map(hexToRgb),
  alpha: def.alpha || [0.95, 0.55],
}));

// Career chapters of the cinematic: each company's logo built in particles,
// in its own colours, on the right of the name's plane while the captions
// hold the left (above them on portrait screens)
function logoBox(L) {
  return L.stacked
    ? { x: 0, y: L.H * 0.15, w: L.W * 0.56, h: L.H * 0.24 }
    : { x: L.W * 0.215, y: L.H * 0.01, w: L.W * 0.3, h: L.H * 0.5 };
}

const LOGO_RES = 240;

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Opaque, non-white pixels of a logo in unit-height coordinates (x, y, tone),
// with the outline kept apart so the silhouette can be drawn crisper
function sampleLogo(img, toneOf) {
  const h = LOGO_RES;
  const w = Math.max(1, Math.round((h * img.naturalWidth) / img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const on = new Uint8Array(w * h);
  let x0 = w, x1 = 0, y0 = h, y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const white = data[p] > 232 && data[p + 1] > 232 && data[p + 2] > 232;
      if (data[p + 3] < 128 || white) continue;
      on[y * w + x] = 1;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 <= x0 || y1 <= y0) return null;

  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const cx = (x0 + x1 + 1) / 2;
  const cy = (y0 + y1 + 1) / 2;
  const tones = new Float32Array(w * h);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const p = (y * w + x) * 4;
      tones[y * w + x] = clamp01(
        toneOf(data[p] / 255, data[p + 1] / 255, data[p + 2] / 255, (x - x0) / bw, (y - y0) / bh),
      );
    }
  }

  // Depth into the shape by repeated erosion: 1 on the outline (or where two
  // brand colours meet), growing inward, capped at DEEP
  const DEEP = 6;
  const dist = new Uint8Array(w * h);
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && on[y * w + x];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (!on[i]) continue;
      let rim = false;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (!inside(x + dx, y + dy)) rim = true;
        else if (Math.abs(tones[i] - tones[i + dy * w + dx]) > 0.35) rim = true;
      }
      if (rim) dist[i] = 1;
    }
  }
  for (let d = 2; d <= DEEP; d++) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (!on[i] || dist[i]) continue;
        if (
          dist[i - 1] === d - 1 ||
          dist[i + 1] === d - 1 ||
          dist[i - w] === d - 1 ||
          dist[i + w] === d - 1
        ) dist[i] = d;
      }
    }
  }

  // Outline and bevel draw more particles than the deep interior, so large
  // solid marks stay as legible as thin ones
  const pts = [];
  const cdf = [];
  let total = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (!on[i]) continue;
      const d = dist[i] || DEEP + 1;
      total += d === 1 ? 5 : d <= 3 ? 2.2 : d <= DEEP ? 1.3 : 0.8;
      cdf.push(total);
      pts.push((x - cx) / bh, -(y - cy) / bh, tones[i], d === 1 ? 1 : 0);
    }
  }
  return {
    pts: new Float32Array(pts),
    cdf: new Float32Array(cdf),
    total,
    aspect: bw / bh,
    ink: cdf.length / (bh * bh),
  };
}

function pickWeighted(cdf, total) {
  const r = Math.random() * total;
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < r) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function makeLogo(logo) {
  return (out, a, b, L) => {
    const box = logoBox(L);
    const size = Math.min(box.h, box.w / logo.aspect);
    const depth = size * 0.09;
    const px = 1 / LOGO_RES;
    for (let i = a; i < b; i++) {
      const k = pickWeighted(logo.cdf, logo.total) * 4;
      const rim = logo.pts[k + 3];
      put(
        out,
        i,
        (logo.pts[k] + (Math.random() - 0.5) * px) * size,
        (logo.pts[k + 1] + (Math.random() - 0.5) * px) * size,
        (Math.random() - 0.5) * depth * (rim ? 0.35 : 1),
        logo.pts[k + 2],
      );
    }
    // Inked area each particle has to cover, against the spark's thin spokes
    const perParticle = (logo.ink * size * size) / (b - a);
    return Math.min(Math.max(Math.sqrt(perParticle / (L.H * L.H * 5e-6)), 1), 1.8);
  };
}

// Fallback when a logo image can't load: the name, spelt inside the box
function makeWord(word) {
  return (out, a, b, L) => {
    const box = logoBox(L);
    const s = sampleName([word], box.w, box.h * 0.32);
    const count = s.pts.length / 2;
    for (let i = a; i < b; i++) {
      const k = ((Math.random() * count) | 0) * 2;
      const x = (s.pts[k] + Math.random() - s.cx) * s.scale;
      put(
        out,
        i,
        x,
        -(s.pts[k + 1] + Math.random() - s.cy) * s.scale,
        (Math.random() - 0.5) * 1.2,
        clamp01(x / s.width + 0.5),
      );
    }
  };
}

const COMPANY_DEFS = [
  {
    word: "GRL LABS",
    src: "/images/grl-logo.png",
    dark: [0xbfdbfe, 0x60a5fa, 0xa5b4fc],
    tone: (r, g, b, x) => x,
  },
  {
    word: "CERNER",
    src: "/images/cerner-logo.png",
    dark: [0x38bdf8, 0x5eead4, 0xbef264],
    tone: (r, g, b) => (g - b + 0.3) / 0.9,
  },
  {
    word: "WALMART",
    src: "/images/walmart-logo.png",
    dark: [0xfff7d6, 0xfcd34d, 0xf59e0b],
    tone: (r, g, b, x, y) => Math.hypot(x - 0.5, y - 0.5) * 1.7,
  },
  {
    word: "PAYPAL",
    src: "/images/paypal-icon.png",
    dark: [0x818cf8, 0x60a5fa, 0x38bdf8],
    tone: (r, g, b) => (g - 0.18) / 0.45,
  },
  {
    word: "DISNEY",
    src: "/images/disney/mickey.png",
    dark: [0xe0e7ff, 0xa5b4fc, 0xf0abfc],
    tone: (r, g, b, x, y) => 0.15 + x * 0.55 + y * 0.3,
  },
];

// Samples every logo once; a logo that fails keeps the spelt-name fallback
function loadLogos() {
  return Promise.all(
    COMPANY_DEFS.map(async (def) => {
      if (def.logo !== undefined) return;
      const img = await loadImage(def.src);
      try {
        def.logo = img ? sampleLogo(img, def.tone) : null;
      } catch (err) {
        def.logo = null;
      }
    }),
  );
}

const COMPANIES = COMPANY_DEFS.map((def) => {
  const dark = def.dark.map(hexToRgb);
  return {
    make: (out, a, b, L) => (def.logo ? makeLogo(def.logo) : makeWord(def.word))(out, a, b, L),
    rot: (t) => [0.1 * Math.sin(t * 0.7), 0.34 * Math.sin(t * 0.45), 0.03 * Math.sin(t * 0.5), "XYZ"],
    // Bring the logos forward from the formations' depth to the name's plane
    off: (L) => {
      const box = logoBox(L);
      return [box.x, box.y, -JOURNEY_Z];
    },
    dark,
    light: dark,
    // Held under the name's glow: the marks pack their particles tighter
    alpha: [0.6, 0.6],
  };
});

function hexToRgb(h) {
  return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
}

// Depth of the formations behind the content
const JOURNEY_Z = -8;

class IntroScene {
  constructor({ shell, stage, ui, cinematic, reducedMotion, hooks }) {
    this.shell = shell;
    this.stage = stage;
    this.ui = ui;
    this.reduced = reducedMotion;
    this.hooks = hooks || {};
    this.startCinematic = cinematic && !reducedMotion;
    this.root = document.documentElement;

    this.time = 0;
    this.t = 0;
    this.mode = "rest";
    this.tween = null;
    this.state = { ...REST };
    this.fired = {};
    this.globeSpin = 0;
    this.light = this.isLightTheme() ? 1 : 0;
    this.pointer = new Vector2(0, 0);
    this.pointerSmooth = new Vector2(0, 0);
    this.lowPower =
      window.matchMedia("(pointer: coarse)").matches ||
      (navigator.hardwareConcurrency || 8) <= 4;
    this.frameN = 0;

    // Scroll journey: P is 0 on the intro, then 1 + the section index
    this.journey = false;
    this.P = 0;
    this.stir = 0;
    this.lastScroll = window.scrollY;
    this.slots = [-1, -1];
    this.anchors = [];
    this.euler = new Euler();
    this.m4 = new Matrix4();

    this.tick = this.tick.bind(this);
  }

  isLightTheme() {
    return this.root.getAttribute("data-theme") !== "dark";
  }

  async init() {
    const renderer = new WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;
    this.stage.appendChild(renderer.domElement);

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(FOV, 1, 0.1, 400);
    this.camera.position.set(0, 0, CAM_Z);

    const edge = {
      uEdge: { value: 0 },
      uViewH: { value: window.innerHeight },
      uPR: { value: 1 },
      uClip: { value: [0, 0, 1e5, 1e5] },
    };
    this.edge = edge;

    this.pointsMat = new ShaderMaterial({
      ...BLEND,
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
      uniforms: {
        ...edge,
        uTime: { value: 0 },
        uGalT: { value: 0 },
        uGalIn: { value: 1 },
        uGalTilt: { value: new Vector2(1.05, 0) },
        uToText: { value: 0 },
        uToGlobe: { value: 1 },
        uSize: { value: 2.4 },
        uLight: { value: 0 },
        uSweep: { value: -1 },
        uTextW: { value: 1 },
        uGalR: { value: 1 },
        uWave: { value: [0, 0, 0, -100] },
        uGlobeC: { value: new Vector3() },
        uGlobeS: { value: 1 },
        uGlobeRot: { value: new Vector2(0.38, 0) },
        uJourney: { value: 0 },
        uMorph: { value: 0 },
        uRotA: { value: new Matrix3() },
        uRotB: { value: new Matrix3() },
        uOffA: { value: new Vector3() },
        uOffB: { value: new Vector3() },
        uPalA: { value: [new Vector3(), new Vector3(), new Vector3()] },
        uPalB: { value: [new Vector3(), new Vector3(), new Vector3()] },
        uAlphaAB: { value: new Vector2(0.6, 0.6) },
        uSizeAB: { value: new Vector2(1, 1) },
        uCenter: { value: new Vector3(0, 0, JOURNEY_Z) },
        uStir: { value: 0 },
        uDrama: { value: 0 },
        uDramaW: { value: 10 },
        uScrollW: { value: 0 },
        uWorldH: { value: 1 },
      },
    });
    this.arcsMat = new ShaderMaterial({
      ...BLEND,
      vertexShader: ARCS_VERT,
      fragmentShader: ARCS_FRAG,
      uniforms: {
        ...edge,
        uArcs: { value: 0 },
        uFade: { value: 1 },
        uTime: this.pointsMat.uniforms.uTime,
        uLight: this.pointsMat.uniforms.uLight,
      },
    });
    this.rimMat = new ShaderMaterial({
      ...BLEND,
      vertexShader: RIM_VERT,
      fragmentShader: RIM_FRAG,
      uniforms: {
        ...edge,
        uRim: { value: 0 },
        uLight: this.pointsMat.uniforms.uLight,
      },
    });

    this.globe = new Group();
    this.globe.rotation.order = "XYZ";
    this.scene.add(this.globe);

    const fontReady = waitForFont("800 180px Poppins");
    const logosReady = this.reduced
      ? null
      : Promise.race([loadLogos(), new Promise((resolve) => setTimeout(resolve, 2500))]);
    this.resize(true);
    await Promise.all([fontReady, logosReady]);
    this.build();

    this.bind();
    if (this.startCinematic) this.beginCinematic();
    else if (!this.reduced) this.assemble();
    else this.state = { ...REST };

    this.update(0);
    renderer.render(this.scene, this.camera);
    this.shell.classList.add("has-scene");
    this.stage.classList.add("is-live");
    this.last = performance.now();
    if (!this.reduced) this.raf = requestAnimationFrame(this.tick);
    if (!this.startCinematic) this.queueJourney();
  }

  // ---------- Geometry ----------

  layout() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const aspect = vw / vh;
    const H = 2 * CAM_Z * Math.tan((FOV * Math.PI) / 360);
    const W = H * aspect;
    const stacked = aspect < 1.15;
    const R = Math.min(H * 0.27, W * 0.38);
    const ambientZ = -10;
    const depth = CAM_Z / (CAM_Z - ambientZ);
    let ambC;
    let ambR;
    if (vw >= 992) {
      ambC = new Vector3(W * 0.3, -H * 0.03, ambientZ);
      ambR = (H * 0.42) / depth;
    } else {
      ambC = new Vector3(0, -H * 0.3, ambientZ);
      ambR = (W * 0.55) / depth;
    }
    return {
      vw,
      vh,
      W,
      H,
      stacked,
      R,
      cineC: new Vector3(0, H * 0.05, 0),
      ambC,
      ambS: ambR / R,
    };
  }

  build() {
    const L = this.layout();
    this.L = L;
    this.builtFor = { w: L.vw, stacked: L.stacked };

    const N = L.vw >= 1200 ? 26000 : L.vw >= 768 ? 18000 : 11000;
    const dustN = Math.round(N * 0.18);
    const landN = Math.round((N - dustN) * 0.72);

    this.N = N;
    this.dustN = dustN;
    const galaxy = new Float32Array(N * 3);
    const galC = new Float32Array(N * 4);
    const text = new Float32Array(N * 3);
    const globe = new Float32Array(N * 3);
    const rand = new Float32Array(N * 4);

    // The galaxy fills the frame as the camera holds at about z = 66: its
    // long axis spans the screen's long side (upright on portrait screens)
    // and the tilt fits the short side
    const view = 66 / CAM_Z;
    const long = Math.max(L.W, L.H) * 0.5 * view;
    const short = Math.min(L.W, L.H) * 0.5 * view;
    const galR = long * 0.96;
    const tilt = Math.asin(Math.min(Math.max((short * 1.08) / galR, 0.4), 0.95));
    const roll = (L.H > L.W ? Math.PI / 2 : 0) + 0.1;
    makeMilkyWay(galaxy, galC, N, galR);
    for (let i = 0; i < N; i++) {
      rand[i * 4] = Math.random();
      rand[i * 4 + 1] = Math.random();
      rand[i * 4 + 2] = Math.random();
    }

    // Dust: a starfield filling the view at every depth
    for (let i = 0; i < dustN; i++) {
      const z = -45 + Math.random() * 55;
      const k = ((CAM_Z - z) / CAM_Z) * 0.6;
      const x = (Math.random() * 2 - 1) * L.W * k;
      const y = (Math.random() * 2 - 1) * L.H * k;
      text.set([x, y, z], i * 3);
      globe.set([x, y, z], i * 3);
      rand[i * 4 + 3] = 0;
    }

    // Globe: dense land, sparse ocean
    const landPts = [];
    for (let i = dustN; i < N; i++) {
      let p;
      const onLand = i < dustN + landN;
      if (onLand) {
        do p = randomOnSphere();
        while (!isLand(p[0], p[1], p[2]));
        landPts.push(p);
      } else {
        p = randomOnSphere();
      }
      const rr = L.R * (onLand ? 1 + (Math.random() - 0.5) * 0.012 : 0.995);
      globe.set([p[0] * rr, p[1] * rr, p[2] * rr], i * 3);
      rand[i * 4 + 3] = onLand ? 2 : 1;
    }

    // Name
    const lines = L.stacked ? ["MANOJ", "SATISHKUMAR"] : [NAME];
    const s = sampleName(
      lines,
      L.W * (L.stacked ? 0.86 : 0.8),
      L.H * (L.stacked ? 0.34 : 0.2),
    );
    const count = s.pts.length / 2;
    const order = new Uint32Array(count);
    for (let i = 0; i < count; i++) order[i] = i;
    for (let i = count - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let i = dustN, k = 0; i < N; i++, k++) {
      const idx = order[k % count] * 2;
      const jx = k >= count ? (Math.random() - 0.5) * 2 : 0;
      const jy = k >= count ? (Math.random() - 0.5) * 2 : 0;
      text[i * 3] = (s.pts[idx] + jx + Math.random() - s.cx) * s.scale;
      text[i * 3 + 1] = -(s.pts[idx + 1] + jy + Math.random() - s.cy) * s.scale;
      text[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
    }
    this.textBottom = s.bottom;

    const u = this.pointsMat.uniforms;
    u.uTextW.value = s.width;
    u.uGalR.value = galR;
    u.uGalTilt.value.set(tilt, roll);
    u.uSize.value = L.vw < 768 ? 2.9 : 2.4;
    u.uWorldH.value = L.H;
    this.galaxy = galaxy;
    this.galR = galR;
    this.signR = Math.max(L.W, L.H) * 0.42;

    if (this.points) {
      this.points.geometry.dispose();
      this.scene.remove(this.points);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(galaxy, 3));
    geo.setAttribute("aGalC", new BufferAttribute(galC, 4));
    geo.setAttribute("aText", new BufferAttribute(text, 3));
    geo.setAttribute("aGlobe", new BufferAttribute(globe, 3));
    geo.setAttribute("aRand", new BufferAttribute(rand, 4));
    geo.setAttribute("aA", new BufferAttribute(new Float32Array(N * 4), 4));
    geo.setAttribute("aB", new BufferAttribute(new Float32Array(N * 4), 4));
    this.points = new Points(geo, this.pointsMat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this.buildGlobeExtras(landPts, L.R);
    this.slots = [-1, -1];
    if (!this.reduced) {
      this.logoBox = logoBox(L);
      this.companyShapes = COMPANIES.map((def) => {
        const data = new Float32Array(N * 4);
        def.size = def.make(data, dustN, N, L) || 1;
        return data;
      });
    }
    if (this.journey) this.buildJourney();
  }

  // ---------- Scroll journey ----------

  queueJourney() {
    if (this.reduced || this.journey || this.journeyQueued) return;
    this.journeyQueued = true;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
    idle(() => this.enableJourney(), { timeout: 1500 });
  }

  enableJourney() {
    if (this.disposed || this.journey) return;
    this.journey = true;
    this.buildJourney();
    this.measure();
    this.P = this.journeyTarget();
    this.root.classList.add("page-scene");

    // Sections load lazily and reflow the page; keep their anchors current
    this.bodyObserver = new ResizeObserver(() => {
      cancelAnimationFrame(this.measureRaf);
      this.measureRaf = requestAnimationFrame(() => this.measure());
    });
    this.bodyObserver.observe(document.body);
  }

  buildJourney() {
    const L = this.L;
    const S = Math.min(L.H * 0.42, L.W * 0.46);
    const ctx = { galaxy: this.galaxy, galR: this.galR, signR: this.signR };
    this.shapes = JOURNEY.map((def) => {
      const data = new Float32Array(this.N * 4);
      def.make(data, this.dustN, this.N, L, S, ctx);
      return data;
    });
    this.slots = [-1, -1];
  }

  measure() {
    const y = window.scrollY;
    const vh = window.innerHeight;
    const docH = document.documentElement.scrollHeight;
    this.anchors = JOURNEY.map(({ id }) => {
      const el = document.getElementById(id);
      return el && el.offsetHeight ? el.getBoundingClientRect().top + y : NaN;
    });
    this.maxScroll = Math.max(docH - vh, 0);

    // Each morph spans part of the sections on both sides of its boundary,
    // so even a short section holds its formation for a while
    let prev = this.shell.getBoundingClientRect().top + y;
    this.windows = this.anchors.map((a, k) => {
      if (!Number.isFinite(a)) return 0;
      const next = this.anchors.slice(k + 1).find(Number.isFinite);
      const w = Math.min(vh * 0.34, (a - prev) * 0.35, ((next || docH) - a) * 0.35);
      prev = a;
      return Math.max(w, 40);
    });
  }

  // Sums a smooth step at every section boundary the viewport centre crosses
  journeyTarget() {
    const vh = window.innerHeight;
    const yc = window.scrollY + vh * 0.5;
    let p = 0;
    this.anchors.forEach((anchor, k) => {
      if (!Number.isFinite(anchor)) return;
      const w = this.windows[k];
      // The last boundaries may sit below the furthest reachable centre
      const b = Math.min(anchor, this.maxScroll + vh * 0.5 - w);
      p += span(yc, b - w, b + w);
    });
    return p;
  }

  setSlot(slot, shapes, idx) {
    const key = `${shapes === this.shapes ? "s" : "c"}${idx}`;
    if (this.slots[slot] === key) return;
    this.slots[slot] = key;
    const attr = this.points.geometry.getAttribute(slot ? "aB" : "aA");
    attr.array.set(shapes[idx]);
    attr.needsUpdate = true;
  }

  applySlot(slot, def) {
    const u = this.pointsMat.uniforms;
    const [x, y, z, order] = def.rot(this.time, this.L);
    this.euler.set(x, y, z, order);
    this.m4.makeRotationFromEuler(this.euler);
    (slot ? u.uRotB : u.uRotA).value.setFromMatrix4(this.m4);
    const off = def.off ? def.off(this.L) : [0, 0, 0];
    (slot ? u.uOffB : u.uOffA).value.fromArray(off);
    const pal = (slot ? u.uPalB : u.uPalA).value;
    for (let c = 0; c < 3; c++) {
      const d = def.dark[c];
      const l = def.light[c];
      pal[c].set(
        lerp(d[0], l[0], this.light),
        lerp(d[1], l[1], this.light),
        lerp(d[2], l[2], this.light),
      );
    }
    u.uAlphaAB.value.setComponent(slot, lerp(def.alpha[0], def.alpha[1], this.light));
    u.uSizeAB.value.setComponent(slot, def.size || 1);
  }

  // Morphs between formations A and B of a set; q is the position in it
  showFormations(shapes, defs, q, weight) {
    const u = this.pointsMat.uniforms;
    const n = shapes.length;
    const ia = Math.min(Math.floor(q), n - 1);
    const ib = Math.min(ia + 1, n - 1);
    this.setSlot(0, shapes, ia);
    this.setSlot(1, shapes, ib);
    this.applySlot(0, defs[ia]);
    this.applySlot(1, defs[ib]);
    u.uMorph.value = ia === n - 1 ? 0 : q - ia;
    u.uJourney.value = weight;
  }

  // Returns how far the intro has handed over to the section formations
  updateJourney(dt, s) {
    const u = this.pointsMat.uniforms;
    // The cinematic's career chapters borrow the same machinery
    u.uDrama.value = 0;
    if (s.cj > 0 && this.companyShapes) {
      this.showFormations(this.companyShapes, COMPANIES, s.co, s.cj);
      u.uDrama.value = 1;
      u.uDramaW.value = this.logoBox ? this.logoBox.w * 0.5 : 10;
      return 0;
    }
    if (!this.journey || this.mode === "cine") {
      u.uJourney.value = 0;
      return 0;
    }
    const target = this.journeyTarget();
    this.P = dt ? lerp(this.P, target, 1 - Math.exp(-dt * 6)) : target;
    if (Math.abs(this.P - target) < 1e-4) this.P = target;

    const j = clamp01(this.P);
    this.showFormations(this.shapes, JOURNEY, Math.max(this.P - 1, 0), j);
    return j;
  }

  buildGlobeExtras(landPts, R) {
    this.globe.clear();
    if (this.arcs) this.arcs.geometry.dispose();
    if (this.rim) this.rim.geometry.dispose();

    const ARCS = 26;
    const SEG = 64;
    const pos = new Float32Array(ARCS * SEG * 2 * 3);
    const at = new Float32Array(ARCS * SEG * 2);
    const seed = new Float32Array(ARCS * SEG * 2);
    const a = new Vector3();
    const b = new Vector3();
    const p = new Vector3();
    let v = 0;
    for (let i = 0; i < ARCS; i++) {
      let angle = 0;
      do {
        a.fromArray(landPts[(Math.random() * landPts.length) | 0]);
        b.fromArray(landPts[(Math.random() * landPts.length) | 0]);
        angle = a.angleTo(b);
      } while (angle < 0.5 || angle > 2.2);
      const lift = 0.1 + (0.28 * angle) / Math.PI;
      const sd = Math.random();
      const point = (t) => {
        // Spherical interpolation, lifted off the surface mid-flight
        const s = Math.sin(angle);
        p.copy(a)
          .multiplyScalar(Math.sin((1 - t) * angle) / s)
          .addScaledVector(b, Math.sin(t * angle) / s)
          .normalize()
          .multiplyScalar(R * (1 + lift * Math.sin(Math.PI * t)));
        return p;
      };
      for (let k = 0; k < SEG; k++) {
        for (const t of [k / SEG, (k + 1) / SEG]) {
          point(t).toArray(pos, v * 3);
          at[v] = t;
          seed[v] = sd;
          v++;
        }
      }
    }
    const arcGeo = new BufferGeometry();
    arcGeo.setAttribute("position", new BufferAttribute(pos, 3));
    arcGeo.setAttribute("aT", new BufferAttribute(at, 1));
    arcGeo.setAttribute("aSeed", new BufferAttribute(seed, 1));
    this.arcs = new LineSegments(arcGeo, this.arcsMat);
    this.arcs.frustumCulled = false;

    this.rim = new Mesh(new SphereGeometry(R * 1.03, 64, 48), this.rimMat);
    this.rim.frustumCulled = false;
    this.globe.add(this.rim, this.arcs);
  }

  resize(initial) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.lowPower ? 1.5 : 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(vw, vh, false);
    this.camera.aspect = vw / vh;
    this.camera.updateProjectionMatrix();
    this.edge.uPR.value = pr;
    this.edge.uViewH.value = vh;
    if (initial) return;

    const next = this.layout();
    if (
      next.vw !== this.builtFor.w ||
      next.stacked !== this.builtFor.stacked
    ) {
      this.build();
    } else {
      // Mobile toolbars change only the height: keep the particles, move the globe
      this.L = { ...this.L, ambC: next.ambC, ambS: next.ambS };
    }
    if (this.journey) this.measure();
    if (this.reduced) this.renderOnce();
  }

  // ---------- Modes ----------

  beginCinematic() {
    try {
      sessionStorage.setItem("intro-cine-seen", "1");
    } catch (e) {}
    this.mode = "cine";
    this.t = 0;
    this.fired = {};
    this.state = timeline(0);
    this.shell.classList.add("is-cine");
    this.ui.classList.remove("is-leaving");
    this.ui.querySelectorAll("[data-cue]").forEach((el) => {
      el.classList.remove("is-on", "is-off");
    });
    this.root.classList.add("intro-cine", "intro-cine-live");
    this.bindSkip();
  }

  // Non-cinematic entrance: the galaxy streams into the globe behind the cards
  assemble() {
    this.startTween(
      { ...REST, toGlobe: 0, rim: 0, arcs: 0 },
      REST,
      2.2,
      () => (this.mode = "rest"),
    );
  }

  startTween(from, to, dur, done) {
    this.mode = "tween";
    this.tween = { from, to, dur, k: 0, done };
  }

  skip() {
    if (this.mode !== "cine" || this.t >= CUE.reveal) return;
    this.unbindSkip();
    this.fired = { reveal: true, cards: true, end: true };
    this.ui.querySelectorAll("[data-cue]").forEach((el) => {
      el.classList.toggle("is-off", el.classList.contains("is-on"));
      el.classList.remove("is-on");
    });
    this.ui.classList.add("is-leaving");
    this.root.classList.add("intro-cine-reveal");
    const from = { ...this.state };
    this.startTween(from, { ...REST, toText: from.toText }, 1.3, () =>
      this.finishCinematic(),
    );
    setTimeout(() => this.hooks.enterCards && this.hooks.enterCards(), 250);
  }

  finishCinematic() {
    this.unbindSkip();
    this.mode = "rest";
    this.state = { ...REST, toText: this.state.toText };
    this.shell.classList.remove("is-cine");
    this.root.classList.remove(
      "intro-cine",
      "intro-cine-live",
      "intro-cine-reveal",
    );
    this.queueJourney();
  }

  replay() {
    if (this.reduced || this.mode === "cine" || this.mode === "tween") return;
    if (this.hooks.holdCards) this.hooks.holdCards();
    this.shell.classList.add("is-cine");
    this.ui.classList.remove("is-leaving");
    this.ui.querySelectorAll("[data-cue]").forEach((el) => {
      el.classList.remove("is-on", "is-off");
    });
    // Start the curtain transparent, then let it fade in
    this.root.classList.add("intro-cine", "intro-cine-live", "intro-cine-reveal");
    void getComputedStyle(this.root).opacity;
    this.root.classList.remove("intro-cine-reveal");
    this.bindSkip();
    // Fade everything back into the dark galaxy, then go again
    this.startTween({ ...this.state }, timeline(0), 1.3, () => {
      this.mode = "cine";
      this.t = 0;
      this.fired = {};
    });
  }

  runCues() {
    const t = this.t;
    const fire = (name, fn) => {
      if (!this.fired[name] && t >= CUE[name]) {
        this.fired[name] = true;
        fn();
      }
    };
    fire("reveal", () => {
      this.ui.classList.add("is-leaving");
      this.root.classList.add("intro-cine-reveal");
      this.unbindSkip();
    });
    fire("cards", () => this.hooks.enterCards && this.hooks.enterCards());
    // Each new logo locks in with a shockwave rippling out from its centre
    for (let k = 1; k < 5; k++) {
      const key = `land${k}`;
      if (this.fired[key] || t < coAt(k) - 0.15 || t > coAt(k) + 0.5) continue;
      this.fired[key] = true;
      const box = this.logoBox;
      if (box) this.pointsMat.uniforms.uWave.value = [box.x, box.y, 0, this.time];
    }
    fire("end", () => this.finishCinematic());

    for (const [name, a, b] of CAPTIONS) {
      const el = this.ui.querySelector(`[data-cue="${name}"]`);
      if (!el) continue;
      el.classList.toggle("is-on", t >= a && t < b);
      el.classList.toggle("is-off", t >= b);
    }
    const bar = this.ui.querySelector(".intro-cine-progress");
    if (bar) bar.style.transform = `scaleX(${clamp01(t / CUE.reveal)})`;
  }

  // ---------- Input ----------

  bind() {
    this.onResize = () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => this.resize(false), 120);
    };
    window.addEventListener("resize", this.onResize);

    this.onPointerMove = (e) => {
      this.pointer.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
    };
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });

    this.onSkipClick = () => this.skip();
    const skipBtn = this.ui.querySelector(".intro-cine-skip");
    if (skipBtn) skipBtn.addEventListener("click", this.onSkipClick);

    // Without the frame loop, a still frame is redrawn whenever its clip
    // band or palette can change
    if (this.reduced) {
      this.onScroll = () => {
        cancelAnimationFrame(this.raf);
        this.raf = requestAnimationFrame(() => this.renderOnce());
      };
      window.addEventListener("scroll", this.onScroll, { passive: true });
    }
    this.themeObserver = new MutationObserver(() => {
      if (this.reduced) this.renderOnce();
    });
    this.themeObserver.observe(this.root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }

  bindSkip() {
    if (this.skipBound) return;
    this.skipBound = true;
    const keys = [" ", "Enter", "Escape", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "End", "Home"];
    this.onSkipWheel = (e) => {
      e.preventDefault();
      this.skip();
    };
    this.onSkipKey = (e) => {
      if (keys.includes(e.key)) {
        e.preventDefault();
        this.skip();
      }
    };
    window.addEventListener("wheel", this.onSkipWheel, { passive: false });
    window.addEventListener("touchmove", this.onSkipWheel, { passive: false });
    window.addEventListener("keydown", this.onSkipKey);
  }

  unbindSkip() {
    if (!this.skipBound) return;
    this.skipBound = false;
    window.removeEventListener("wheel", this.onSkipWheel);
    window.removeEventListener("touchmove", this.onSkipWheel);
    window.removeEventListener("keydown", this.onSkipKey);
  }

  // ---------- Frame ----------

  // The band of the viewport the intro may draw in once it is a backdrop
  clip() {
    const vh = window.innerHeight;
    let top = 0;
    document.querySelectorAll(".macos-menubar, .mobile-navbar").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height && r.bottom > top) top = r.bottom;
    });
    let bottom = vh;
    const nav = document.getElementById("mobile-bottom-nav");
    if (nav && nav.offsetHeight) bottom = Math.min(bottom, nav.getBoundingClientRect().top);
    const shell = this.shell.getBoundingClientRect();
    // Held to the intro until the journey takes over the whole viewport
    const open = clamp01(this.P * 2.5);
    bottom = lerp(Math.min(bottom, shell.bottom), bottom, open);
    const introVisible = shell.bottom > top + 10 && shell.top < vh;
    return { top, bottom, open, visible: introVisible || this.P > 0.01 };
  }

  tick(now) {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.time += dt;
    const resting = this.mode === "rest";
    if (resting && this.lowPower && this.frameN++ % 2) return;
    try {
      const c = this.update(dt);
      if (resting && !c.visible) return;
      this.renderer.render(this.scene, this.camera);
    } catch (err) {
      console.error(err);
      this.fail();
    }
  }

  renderOnce() {
    this.update(0);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    let s;
    if (this.mode === "cine") {
      this.t += dt;
      s = timeline(this.t);
      this.runCues();
    } else if (this.mode === "tween" && this.tween) {
      const tw = this.tween;
      tw.k = Math.min(tw.k + dt / tw.dur, 1);
      const e = easeInOut(tw.k);
      s = {};
      for (const key of STATE_KEYS) s[key] = lerp(tw.from[key], tw.to[key], e);
      if (tw.k >= 1) {
        this.tween = null;
        this.mode = "rest";
        tw.done && tw.done();
      }
    } else {
      s = this.state;
    }
    this.state = s;

    const L = this.L;
    const u = this.pointsMat.uniforms;
    const cine = this.mode === "cine";

    this.light = lerp(this.light, this.isLightTheme() ? 1 : 0, dt ? Math.min(dt * 3, 1) : 1);
    const light = s.ambient * this.light;

    u.uTime.value = this.time;
    u.uGalT.value = cine ? this.t : this.time;
    u.uGalIn.value = s.galIn;
    u.uToText.value = s.toText;
    u.uToGlobe.value = s.toGlobe;
    u.uLight.value = light;
    u.uSweep.value = cine ? lerp(-0.2, 1.2, span(this.t, NAME_AT, NAME_AT + 1.0)) : -1;
    const j = this.updateJourney(dt, s);
    this.arcsMat.uniforms.uArcs.value = s.arcs;
    this.arcsMat.uniforms.uFade.value = 1 - j;
    this.rimMat.uniforms.uRim.value = s.rim * (1 - j);
    this.globe.visible = j < 0.999;

    // Fast scrolling stirs the particles
    const sy = window.scrollY;
    const speed = dt ? Math.abs(sy - this.lastScroll) / dt : 0;
    this.lastScroll = sy;
    this.stir = lerp(this.stir, Math.min(speed / 3000, 1), dt ? Math.min(dt * 4, 1) : 1);
    u.uStir.value = this.stir * j;

    // Globe: slides from centre stage to the side once it becomes a backdrop
    this.globeSpin += dt * 0.12;
    const C = u.uGlobeC.value.copy(L.cineC).lerp(L.ambC, s.ambient);
    const S = lerp(1, L.ambS, s.ambient);
    u.uGlobeS.value = S;
    u.uGlobeRot.value.set(0.38, this.globeSpin);
    this.globe.position.copy(C);
    this.globe.scale.setScalar(S);
    this.globe.rotation.set(0.38, -this.globeSpin, 0);

    // Camera: dolly through the scenes, drift with the cursor, lag the scroll
    const k = dt ? Math.min(dt * 2.5, 1) : 1;
    this.pointerSmooth.lerp(this.pointer, k);
    const flight = cine ? coFlight(this.t) : { f: 0, k: 0 };
    const cineZ = 74 - 12 * easeInOut(s.galIn) - 5 * s.toText + 6 * s.toGlobe - 6 * flight.f;
    const camZ = lerp(cineZ, CAM_Z, s.ambient);
    const worldPerPx = L.H / window.innerHeight;
    // Past the intro the camera holds still and the formations come to it
    const lagY = this.journey && Number.isFinite(this.anchors[0])
      ? Math.min(sy, this.anchors[0])
      : sy;
    const scrollShift = -lagY * worldPerPx * 0.35 * s.ambient;
    u.uCenter.value.set(0, scrollShift, JOURNEY_Z);
    u.uScrollW.value = sy * worldPerPx * 0.25;
    let shakeX = 0;
    let shakeY = 0;
    // A jolt as each morphed logo lands
    const landed = Math.floor((this.t - CO_START) / CO_STEP);
    if (cine && landed >= 1 && landed <= 4) {
      const amp = 0.35 * Math.exp(-(this.t - coAt(landed)) * 7);
      shakeX += (Math.random() - 0.5) * amp;
      shakeY += (Math.random() - 0.5) * amp;
    }
    const cam = this.camera;
    cam.position.set(
      this.pointerSmooth.x * lerp(1.2, 2, s.ambient) + shakeX,
      this.pointerSmooth.y * lerp(0.8, 1.2, s.ambient) + scrollShift + shakeY,
      camZ,
    );
    cam.lookAt(0, scrollShift, 0);
    cam.rotateZ(0.035 * flight.f * (flight.k % 2 ? 1 : -1));
    cam.updateMatrixWorld();

    const c = this.clip();
    this.edge.uEdge.value = s.ambient;
    this.edge.uClip.value = [c.top, c.top + 80, c.bottom - lerp(180, 60, c.open), c.bottom];

    if (cine && this.t > NAME_AT - 1.0 && this.t < NAME_AT + 2.4) {
      const sub = this.ui.querySelector('[data-cue="name"]');
      if (sub) sub.style.top = `${Math.round(this.screenY(this.textBottom) + 22)}px`;
    }
    if (cine && this.t > NAME_AT + 1.7 && this.t < CO_END + 0.6) {
      const box = this.logoBox;
      const stacked = this.L.stacked;
      this.ui.classList.toggle("is-stacked", stacked);
      const career = this.ui.querySelector(".intro-cine-career");
      if (career && box) {
        const y = stacked ? this.screenY(box.y - box.h / 2) + 24 : this.screenY(box.y);
        career.style.top = `${Math.round(y)}px`;
      }
    }
    return c;
  }

  // Viewport y of a point on the z = 0 plane, below the centre line
  screenY(worldY) {
    const p = new Vector3(0, worldY, 0).project(this.camera);
    return ((1 - p.y) / 2) * window.innerHeight;
  }

  fail() {
    cancelAnimationFrame(this.raf);
    this.unbindSkip();
    this.shell.classList.remove("is-cine", "has-scene");
    this.root.classList.remove("intro-cine", "intro-cine-live", "intro-cine-reveal", "page-scene");
    this.stage.classList.remove("is-live");
    if (this.hooks.enterCards) this.hooks.enterCards();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.measureRaf);
    this.unbindSkip();
    this.root.classList.remove("page-scene");
    if (this.bodyObserver) this.bodyObserver.disconnect();
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("pointermove", this.onPointerMove);
    if (this.onScroll) window.removeEventListener("scroll", this.onScroll);
    if (this.themeObserver) this.themeObserver.disconnect();
    if (this.points) this.points.geometry.dispose();
    if (this.arcs) this.arcs.geometry.dispose();
    if (this.rim) this.rim.geometry.dispose();
    this.pointsMat.dispose();
    this.arcsMat.dispose();
    this.rimMat.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export async function createIntroScene(options) {
  const scene = new IntroScene(options);
  await scene.init();
  return scene;
}
