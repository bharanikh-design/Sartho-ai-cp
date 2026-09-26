"use client";

import { useEffect, useRef } from "react";

/*
 * The living ribbon — a flowing band of light.
 *
 * A single field of fine particles arranged on a gently twisting ribbon that
 * sweeps down the left of the stage. It reads as an airy stream of light rather
 * than a solid sheet: the ribbon is only implied by where the points fall, so it
 * stays elegant and calm instead of heavy. Blue leads, with a violet undertone
 * on the turned-away face. Everything moves on the GPU in one draw call.
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

// Each particle: v (0..1 along the ribbon), u (-1..1 across it), seed (0..1).
const RIBBON_STRIDE = 3;

const VS = `
precision highp float;
attribute float a_v;
attribute float a_u;
attribute float a_seed;
uniform float u_time;
uniform float u_dpr;
uniform vec2 u_pointer;
uniform float u_flow;
varying float v_alpha;
varying float v_depth;
varying float v_tw;
const float PI = 3.14159265;
void main() {
  // Particles drift slowly along the ribbon's length and wrap, so the band flows.
  float v = fract(a_v + u_time * u_flow * (0.008 + a_seed * 0.014));
  // A spine that sweeps diagonally from the top-left down and to the right, with
  // a slow travelling wave, so the ribbon reads as flowing across the corner.
  float sx = 0.07 + v * 0.20 + sin(v * PI * 1.5 + u_time * 0.16) * 0.05;
  // The cross-section twists along the length and the twist travels over time,
  // so the flat band of points reads as a ribbon turning in space.
  float th = v * PI * 1.9 + u_time * 0.3;
  float width = 0.125 * (0.4 + 0.6 * sin(v * PI));     // bulging in the middle
  float across = a_u * width * cos(th);
  float depth = a_u * sin(th);                          // -1 far .. +1 near face
  float x = sx + across + u_pointer.x * 0.012;
  float y = v + u_pointer.y * 0.008;
  gl_Position = vec4(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  float d = depth * 0.5 + 0.5;                          // 0 far .. 1 near
  // Finer points so the band reads as a smooth stream, not scattered dots.
  gl_PointSize = (0.5 + d * 2.0 + a_seed * 0.9) * u_dpr;
  // A brighter core down the centre of the band gives the ribbon a defined line
  // of light, with particles fanning out and dimming toward the edges.
  float core = smoothstep(0.55, 0.0, abs(a_u));
  // Fade the ends so the ribbon dissolves into the dark rather than cutting off.
  float ends = smoothstep(0.0, 0.08, v) * smoothstep(1.0, 0.9, v);
  v_alpha = ends * (0.12 + d * 0.5 + core * 0.42);
  v_depth = d;
  v_tw = a_seed;
}
`;

const FS = `
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
  float mask = smoothstep(0.5, 0.0, length(pc));       // soft round point
  float tw = 0.85 + 0.15 * sin(u_time * 1.4 + v_tw * 6.2831);
  vec3 color = mix(u_colorFar, u_colorNear, v_depth);  // violet far, blue near
  float a = mask * v_alpha * tw * u_intensity;
  gl_FragColor = vec4(color * a, a);                    // premultiplied
}
`;

type Theme = "dark" | "light";

const THEME_SETTINGS: Record<
  Theme,
  { colorFar: [number, number, number]; colorNear: [number, number, number]; intensity: number; additive: boolean }
> = {
  dark: {
    colorFar: [0.42, 0.4, 0.98], // violet undertone
    colorNear: [0.46, 0.8, 1.0], // bright blue lead
    intensity: 1.05,
    additive: true,
  },
  light: {
    colorFar: [0.34, 0.28, 0.82],
    colorNear: [0.2, 0.46, 0.9],
    intensity: 0.6,
    additive: false,
  },
};

const STILL_TIME = 4.0;

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function buildParticles(count: number, seed: number): Float32Array {
  // A small deterministic PRNG so the field is identical every render.
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const data = new Float32Array(count * RIBBON_STRIDE);
  for (let i = 0; i < count; i += 1) {
    const o = i * RIBBON_STRIDE;
    data[o] = i / count;              // even spread along the length
    // Denser toward the core of the band, thinner at the edges.
    data[o + 1] = (rand() * 2 - 1) * Math.sqrt(rand());
    data[o + 2] = rand();
  }
  return data;
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
    const count = small || coarse ? 3200 : 6500;

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

    const particleData = buildParticles(count, 20260925);

    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let raf = 0;
    let running = false;
    let onScreen = true;
    let disposed = false;
    let currentTheme: Theme = readTheme();
    const start = performance.now();

    const loc = {
      attribs: {} as Record<string, number>,
      u: {} as Record<string, WebGLUniformLocation | null>,
    };

    function setup(): boolean {
      const context = gl;
      if (!context) return false;
      program = link(context, VS, FS);
      if (!program) return false;
      buffer = context.createBuffer();
      context.bindBuffer(context.ARRAY_BUFFER, buffer);
      context.bufferData(context.ARRAY_BUFFER, particleData, context.STATIC_DRAW);
      for (const name of ["a_v", "a_u", "a_seed"]) {
        loc.attribs[name] = context.getAttribLocation(program, name);
      }
      for (const name of ["u_time", "u_dpr", "u_pointer", "u_flow", "u_intensity", "u_colorFar", "u_colorNear"]) {
        loc.u[name] = context.getUniformLocation(program, name);
      }
      return true;
    }

    function resize() {
      const context = gl;
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
      if (!canvas) return [0, 0];
      const style = getComputedStyle(canvas);
      const px = parseFloat(style.getPropertyValue("--fd-px")) || 0;
      const py = parseFloat(style.getPropertyValue("--fd-py")) || 0;
      return [px, py];
    }

    function draw(now: number) {
      const context = gl;
      if (!context || !program || disposed) return;
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

      context.useProgram(program);
      context.bindBuffer(context.ARRAY_BUFFER, buffer);
      const stride = RIBBON_STRIDE * 4;
      ["a_v", "a_u", "a_seed"].forEach((name, index) => {
        const attrib = loc.attribs[name];
        if (attrib < 0) return;
        context.enableVertexAttribArray(attrib);
        context.vertexAttribPointer(attrib, 1, context.FLOAT, false, stride, index * 4);
      });
      context.uniform1f(loc.u.u_time, time);
      context.uniform1f(loc.u.u_dpr, dpr);
      context.uniform2f(loc.u.u_pointer, px, py);
      context.uniform1f(loc.u.u_flow, 1.0);
      context.uniform1f(loc.u.u_intensity, theme.intensity);
      context.uniform3fv(loc.u.u_colorFar, theme.colorFar);
      context.uniform3fv(loc.u.u_colorNear, theme.colorNear);
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
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    };
  }, []);

  return (
    <div className={`fd-ribbon${className ? ` ${className}` : ""}`} aria-hidden="true">
      <canvas ref={canvasRef} className="fd-ribbon-canvas" />
    </div>
  );
}
