"use client";

import { useEffect, useRef } from "react";
import { generateParticles, packParticles, RIBBON_STRIDE } from "@/lib/landing/ribbon-field";

/*
 * The living ribbon — twisted silk, with light rising through it.
 *
 * Two GPU layers share one left-anchored spine:
 *   1. A twisted fabric ribbon: three overlapping strands drawn as triangle
 *      strips whose cross-section rotates along their length and travels over
 *      time, so they fold and catch light like flowing silk.
 *   2. A dusting of particles rising up the same spine, for the sense of lift.
 *
 * The particle field's arrangement is owned and tested in lib/landing/ribbon-field;
 * the fabric is a parametric strip animated entirely in its vertex shader. Both
 * move on the GPU, so the whole scene runs at sixty frames a second without
 * touching the main thread.
 *
 * It is decoration, so it never gets in the way:
 *   - prefers-reduced-motion draws one still frame and starts no loop;
 *   - a hidden tab or a scrolled-away ribbon stops the loop entirely;
 *   - a lost GL context is caught and restored rather than left as a dead canvas;
 *   - if WebGL is unavailable, a CSS gradient stands in (see .fd-ribbon-no-gl)
 *     and nothing errors.
 *
 * It follows the Dark/Light switch: additive light on the dark theme, a softer
 * ink on the light one, so it supports the page in both.
 */

// The spine both layers ride, so the silk and the particles share one path down
// the left of the stage. Injected into both vertex shaders.
const SPINE_GLSL = `
const float PI = 3.14159265;
float spineX(float v, float time) {
  return 0.15
    + sin(v * PI * 2.2 + time * 0.5) * 0.038
    + sin(v * PI * 4.1 - time * 0.32) * 0.014;
}
`;

const FABRIC_VS = `
precision highp float;
attribute float a_v;
attribute float a_u;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_phase;
uniform float u_xoff;
varying float v_v;
varying float v_u;
varying float v_shade;
${SPINE_GLSL}
void main() {
  float v = a_v;
  float t = u_time + u_phase;
  float sx = spineX(v, t) + u_xoff + u_pointer.x * 0.012;
  // The cross-section twists along the length, and the twist travels over time —
  // this is what makes the strand read as folding silk rather than a flat band.
  float th = v * PI * 3.0 + t * 0.9;
  float halfWidth = 0.078 * (0.55 + 0.45 * sin(v * PI));
  float x = sx + a_u * halfWidth * cos(th);      // narrows to a bright edge when side-on
  float y = v + u_pointer.y * 0.008;
  gl_Position = vec4(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  v_v = v;
  v_u = a_u;
  v_shade = 0.5 + 0.5 * sin(th + a_u * 0.6);      // folds catching light
}
`;

const FABRIC_FS = `
precision highp float;
uniform float u_intensity;
uniform vec3 u_colorFar;
uniform vec3 u_colorNear;
varying float v_v;
varying float v_u;
varying float v_shade;
void main() {
  vec3 color = mix(u_colorFar, u_colorNear, v_v);
  color *= (0.45 + v_shade);                       // sheen from the folds
  float edge = smoothstep(0.0, 0.4, 1.0 - abs(v_u));
  float ends = smoothstep(0.0, 0.12, v_v) * smoothstep(1.0, 0.86, v_v);
  float a = edge * ends * u_intensity;
  gl_FragColor = vec4(color * a, a);               // premultiplied — serves both blends
}
`;

const PARTICLE_VS = `
precision highp float;
attribute float a_t;
attribute float a_across;
attribute float a_depth;
attribute float a_phase;
attribute float a_speed;
attribute float a_twinkle;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_dpr;
uniform float u_flow;
varying float v_alpha;
varying float v_depth;
varying float v_tw;
${SPINE_GLSL}
void main() {
  // Rises up the spine over time and wraps — a current lifting, for hope.
  float t = fract(a_t - u_time * u_flow * a_speed * 0.05);
  float sx = spineX(t, u_time);
  float width = 0.09 * (0.5 + a_depth * 0.9);
  float breathe = 1.0 + sin(u_time * 0.5 + a_phase) * 0.06;
  float nx = sx + a_across * width * breathe;
  float ny = t;
  nx += u_pointer.x * 0.016 * (0.2 + a_depth);
  ny += u_pointer.y * 0.010 * (0.2 + a_depth);
  gl_Position = vec4(nx * 2.0 - 1.0, 1.0 - ny * 2.0, 0.0, 1.0);
  gl_PointSize = (1.0 + a_depth * 3.2) * u_dpr;
  float edge = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.94, t);
  v_alpha = edge * (0.22 + a_depth * 0.75);
  v_depth = a_depth;
  v_tw = a_twinkle;
}
`;

const PARTICLE_FS = `
precision highp float;
uniform float u_time;
uniform float u_intensity;
uniform vec3 u_colorFar;
uniform vec3 u_colorNear;
varying float v_alpha;
varying float v_depth;
varying float v_tw;
void main() {
  vec2 pc = gl_PointCoord - 0.5;
  float mask = smoothstep(0.5, 0.0, length(pc));
  float tw = 0.82 + 0.18 * sin(u_time * 1.7 + v_tw * 6.2831);
  vec3 color = mix(u_colorFar, u_colorNear, v_depth);
  float a = mask * v_alpha * tw * u_intensity;
  gl_FragColor = vec4(color * a, a);
}
`;

type Theme = "dark" | "light";

// Colour and presence per theme. Dark adds light; light lays a softer ink so the
// ribbon stays visible on a white page without shouting. `intensity` drives the
// particles; `fabricScale` keeps the silk a touch quieter than the sparks.
const THEME_SETTINGS: Record<
  Theme,
  {
    colorFar: [number, number, number];
    colorNear: [number, number, number];
    intensity: number;
    fabricScale: number;
    additive: boolean;
  }
> = {
  dark: {
    colorFar: [0.42, 0.36, 0.98], // violet
    colorNear: [0.36, 0.66, 1.0], // blue
    intensity: 0.72,
    fabricScale: 1.0,
    additive: true,
  },
  light: {
    colorFar: [0.34, 0.28, 0.82],
    colorNear: [0.2, 0.44, 0.9],
    intensity: 0.5,
    fabricScale: 1.05,
    additive: false,
  },
};

// Three silk strands: [time phase, horizontal offset, base weight]. Overlapping
// at different phases gives the woven depth of fabric rather than one flat band.
const STRANDS: Array<[number, number, number]> = [
  [0.0, 0.0, 0.62],
  [1.7, 0.03, 0.42],
  [3.4, -0.025, 0.3],
];

// A pleasant, well-twisted pose for the reduced-motion still frame.
const STILL_TIME = 5.0;

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function link(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  return program;
}

export function ParticleRibbon({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const coarse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    const small = window.innerWidth < 760;
    // The silk carries the look now, so the dusting is lighter than before.
    const count = small || coarse ? 900 : 1700;

    const gl =
      (canvas.getContext("webgl", {
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
        depth: false,
        powerPreference: "low-power",
      }) as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);

    if (!gl) {
      canvas.parentElement?.classList.add("fd-ribbon-no-gl");
      return;
    }

    const particleData = packParticles(generateParticles(count, 20260925));

    // Fabric geometry: a triangle strip of (v, u) pairs down the ribbon.
    const SEGMENTS = 160;
    const fabricData = new Float32Array((SEGMENTS + 1) * 2 * 2);
    for (let i = 0; i <= SEGMENTS; i += 1) {
      const v = i / SEGMENTS;
      const o = i * 4;
      fabricData[o] = v;
      fabricData[o + 1] = -1;
      fabricData[o + 2] = v;
      fabricData[o + 3] = 1;
    }
    const fabricVertCount = (SEGMENTS + 1) * 2;

    let fabricProgram: WebGLProgram | null = null;
    let particleProgram: WebGLProgram | null = null;
    let fabricBuf: WebGLBuffer | null = null;
    let particleBuf: WebGLBuffer | null = null;
    let raf = 0;
    let running = false;
    let onScreen = true;
    let disposed = false;
    let currentTheme: Theme = readTheme();
    const start = performance.now();

    const fabricLoc = {
      a_v: -1,
      a_u: -1,
      u: {} as Record<string, WebGLUniformLocation | null>,
    };
    const particleLoc = {
      attribs: {} as Record<string, number>,
      u: {} as Record<string, WebGLUniformLocation | null>,
    };

    function setup(): boolean {
      const context = gl;
      if (!context) return false;

      fabricProgram = link(context, FABRIC_VS, FABRIC_FS);
      particleProgram = link(context, PARTICLE_VS, PARTICLE_FS);
      if (!fabricProgram || !particleProgram) return false;

      fabricBuf = context.createBuffer();
      context.bindBuffer(context.ARRAY_BUFFER, fabricBuf);
      context.bufferData(context.ARRAY_BUFFER, fabricData, context.STATIC_DRAW);
      fabricLoc.a_v = context.getAttribLocation(fabricProgram, "a_v");
      fabricLoc.a_u = context.getAttribLocation(fabricProgram, "a_u");
      for (const name of ["u_time", "u_pointer", "u_phase", "u_xoff", "u_intensity", "u_colorFar", "u_colorNear"]) {
        fabricLoc.u[name] = context.getUniformLocation(fabricProgram, name);
      }

      particleBuf = context.createBuffer();
      context.bindBuffer(context.ARRAY_BUFFER, particleBuf);
      context.bufferData(context.ARRAY_BUFFER, particleData, context.STATIC_DRAW);
      for (const name of ["a_t", "a_across", "a_depth", "a_phase", "a_speed", "a_twinkle"]) {
        particleLoc.attribs[name] = context.getAttribLocation(particleProgram, name);
      }
      for (const name of ["u_time", "u_pointer", "u_dpr", "u_flow", "u_intensity", "u_colorFar", "u_colorNear"]) {
        particleLoc.u[name] = context.getUniformLocation(particleProgram, name);
      }
      return true;
    }

    function resize() {
      const context = gl;
      // Hoisted above the null-guard on `canvas`, so re-narrow it locally.
      if (!context || !canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      context.viewport(0, 0, canvas.width, canvas.height);
    }

    function pointer(): [number, number] {
      // usePointerParallax writes these onto the stage; the canvas inherits them,
      // so the whole scene shares one motion source.
      if (!canvas) return [0, 0];
      const style = getComputedStyle(canvas);
      const px = parseFloat(style.getPropertyValue("--fd-px")) || 0;
      const py = parseFloat(style.getPropertyValue("--fd-py")) || 0;
      return [px, py];
    }

    function draw(now: number) {
      const context = gl;
      if (!context || !fabricProgram || !particleProgram || disposed) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const theme = THEME_SETTINGS[currentTheme];
      const time = reduce ? STILL_TIME : (now - start) / 1000;
      const [px, py] = reduce ? [0, 0] : pointer();

      context.disable(context.DEPTH_TEST);
      context.enable(context.BLEND);
      if (theme.additive) context.blendFunc(context.ONE, context.ONE);
      else context.blendFunc(context.ONE, context.ONE_MINUS_SRC_ALPHA);
      context.clearColor(0, 0, 0, 0);
      context.clear(context.COLOR_BUFFER_BIT);

      // 1. Silk strands, back to front.
      context.useProgram(fabricProgram);
      context.bindBuffer(context.ARRAY_BUFFER, fabricBuf);
      if (fabricLoc.a_v >= 0) {
        context.enableVertexAttribArray(fabricLoc.a_v);
        context.vertexAttribPointer(fabricLoc.a_v, 1, context.FLOAT, false, 16, 0);
      }
      if (fabricLoc.a_u >= 0) {
        context.enableVertexAttribArray(fabricLoc.a_u);
        context.vertexAttribPointer(fabricLoc.a_u, 1, context.FLOAT, false, 16, 4);
      }
      context.uniform1f(fabricLoc.u.u_time, time);
      context.uniform2f(fabricLoc.u.u_pointer, px, py);
      context.uniform3fv(fabricLoc.u.u_colorFar, theme.colorFar);
      context.uniform3fv(fabricLoc.u.u_colorNear, theme.colorNear);
      for (const [phase, xoff, weight] of STRANDS) {
        context.uniform1f(fabricLoc.u.u_phase, phase);
        context.uniform1f(fabricLoc.u.u_xoff, xoff);
        context.uniform1f(fabricLoc.u.u_intensity, weight * theme.fabricScale);
        context.drawArrays(context.TRIANGLE_STRIP, 0, fabricVertCount);
      }

      // 2. Rising particle dusting.
      context.useProgram(particleProgram);
      context.bindBuffer(context.ARRAY_BUFFER, particleBuf);
      const stride = RIBBON_STRIDE * 4;
      ["a_t", "a_across", "a_depth", "a_phase", "a_speed", "a_twinkle"].forEach((name, index) => {
        const loc = particleLoc.attribs[name];
        if (loc < 0) return;
        context.enableVertexAttribArray(loc);
        context.vertexAttribPointer(loc, 1, context.FLOAT, false, stride, index * 4);
      });
      context.uniform1f(particleLoc.u.u_time, time);
      context.uniform2f(particleLoc.u.u_pointer, px, py);
      context.uniform1f(particleLoc.u.u_dpr, dpr);
      context.uniform1f(particleLoc.u.u_flow, 1.0);
      context.uniform1f(particleLoc.u.u_intensity, theme.intensity);
      context.uniform3fv(particleLoc.u.u_colorFar, theme.colorFar);
      context.uniform3fv(particleLoc.u.u_colorNear, theme.colorNear);
      context.drawArrays(context.POINTS, 0, count);
    }

    function loop(now: number) {
      if (!running || disposed) return;
      draw(now);
      raf = requestAnimationFrame(loop);
    }

    function play() {
      if (reduce || running || disposed || !onScreen || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(loop);
    }

    function pause() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function handleContextLost(event: Event) {
      event.preventDefault();
      pause();
    }

    function handleContextRestored() {
      if (disposed) return;
      if (setup()) {
        resize();
        if (reduce) draw(performance.now());
        else play();
      }
    }

    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              onScreen = entries.some((entry) => entry.isIntersecting);
              if (onScreen) play();
              else pause();
            },
            { threshold: 0 },
          )
        : null;

    const themeObserver =
      typeof MutationObserver === "function"
        ? new MutationObserver(() => {
            currentTheme = readTheme();
            if (reduce) draw(performance.now());
          })
        : null;

    const onVisibility = () => {
      if (document.hidden) pause();
      else play();
    };
    const onResize = () => {
      resize();
      if (reduce) draw(performance.now());
    };

    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", handleContextRestored, false);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    observer?.observe(canvas);
    themeObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    if (!setup()) {
      canvas.parentElement?.classList.add("fd-ribbon-no-gl");
      return () => {
        canvas.removeEventListener("webglcontextlost", handleContextLost);
        canvas.removeEventListener("webglcontextrestored", handleContextRestored);
        window.removeEventListener("resize", onResize);
        document.removeEventListener("visibilitychange", onVisibility);
        observer?.disconnect();
        themeObserver?.disconnect();
      };
    }

    resize();
    if (reduce) draw(performance.now());
    else play();

    return () => {
      disposed = true;
      pause();
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
      themeObserver?.disconnect();
      if (fabricBuf) gl.deleteBuffer(fabricBuf);
      if (particleBuf) gl.deleteBuffer(particleBuf);
      if (fabricProgram) gl.deleteProgram(fabricProgram);
      if (particleProgram) gl.deleteProgram(particleProgram);
    };
  }, []);

  return (
    <div className={`fd-ribbon${className ? ` ${className}` : ""}`} aria-hidden="true">
      <canvas ref={canvasRef} className="fd-ribbon-canvas" />
    </div>
  );
}
