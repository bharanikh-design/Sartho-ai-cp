"use client";

import { useEffect, useRef } from "react";
import { generateParticles, packParticles, RIBBON_STRIDE } from "@/lib/landing/ribbon-field";

/*
 * The living ribbon.
 *
 * Thousands of points drawn by the GPU, arranged along a slow double-sine spine
 * down the left of the stage, breathing and flowing so they read as a current
 * of light rather than a decorative image. The arrangement is owned and tested
 * in lib/landing/ribbon-field; this component uploads it once and lets a small
 * vertex shader animate it every frame, which is the only way to move this many
 * points at sixty frames a second without touching the main thread.
 *
 * It is decoration, so it never gets in the way:
 *   - prefers-reduced-motion draws one still frame and starts no loop;
 *   - a hidden tab or a scrolled-away ribbon stops the loop entirely;
 *   - a lost GL context is caught and restored rather than left as a dead canvas;
 *   - if WebGL is unavailable, a CSS gradient stands in (see .fd-ribbon-fallback)
 *     and nothing errors.
 *
 * It also follows the Dark/Light switch: additive light on the dark theme, a
 * softer subtractive ink on the light one, so it supports the page in both.
 */

const VERTEX_SRC = `
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
uniform float u_ampl;

varying float v_alpha;
varying float v_depth;
varying float v_tw;

const float PI = 3.14159265;

void main() {
  // The particle rises up the spine over time and wraps, so the ribbon reads as
  // a current lifting rather than a fixed constellation — upward for hope.
  float t = fract(a_t - u_time * u_flow * a_speed * 0.05);

  // Spine — the double sine mirrored from ribbonSpine() in ribbon-field.ts.
  float sway = sin(u_time * 0.18) * 0.5 + 0.5;
  float spineX = 0.22
    + sin(t * PI * 1.6 + u_time * 0.12) * u_ampl
    + sin(t * PI * 3.1 + u_time * 0.05) * u_ampl * 0.35
    + (sway - 0.5) * 0.04;

  float width = 0.11 * (0.5 + a_depth * 0.9);
  float breathe = 1.0 + sin(u_time * 0.5 + a_phase) * 0.06;
  float nx = spineX + a_across * width * breathe;
  float ny = t;

  // Nearer particles answer the pointer more, which gives the ribbon depth.
  nx += u_pointer.x * 0.016 * (0.2 + a_depth);
  ny += u_pointer.y * 0.010 * (0.2 + a_depth);

  vec2 clip = vec2(nx * 2.0 - 1.0, 1.0 - ny * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = (1.2 + a_depth * 3.6) * u_dpr;

  // Fade at the wrap points so particles never pop in or out at the edges.
  float edge = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.94, t);
  v_alpha = edge * (0.25 + a_depth * 0.75);
  v_depth = a_depth;
  v_tw = a_twinkle;
}
`;

const FRAGMENT_SRC = `
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
  // Premultiplied output so the same shader serves additive and normal blending.
  gl_FragColor = vec4(color * a, a);
}
`;

type Theme = "dark" | "light";

// The ribbon's colours and presence per theme. The dark theme adds light; the
// light theme lays down a soft, low-intensity ink so the ribbon stays visible
// against a white page without shouting. Intensity carries the deliberate
// ~25% step-down in ribbon presence — it supports the content, it does not
// compete with it.
const THEME_SETTINGS: Record<Theme, { colorFar: [number, number, number]; colorNear: [number, number, number]; intensity: number; additive: boolean }> = {
  dark: {
    colorFar: [0.42, 0.36, 0.98], // violet
    colorNear: [0.36, 0.66, 1.0], // blue
    intensity: 0.72,
    additive: true,
  },
  light: {
    colorFar: [0.36, 0.31, 0.86],
    colorNear: [0.28, 0.5, 0.92],
    intensity: 0.5,
    additive: false,
  },
};

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

export function ParticleRibbon({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Fewer points where the screen is small or the GPU is likely modest.
    const coarse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    const small = window.innerWidth < 760;
    const count = small || coarse ? 1400 : 3200;

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
      // No WebGL: let the CSS gradient fallback show and leave quietly.
      canvas.parentElement?.classList.add("fd-ribbon-no-gl");
      return;
    }

    const packed = packParticles(generateParticles(count, 20260925));

    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let raf = 0;
    let running = false;
    let onScreen = true;
    let disposed = false;
    let currentTheme: Theme = readTheme();
    const start = performance.now();

    const locations: {
      attribs: Record<string, number>;
      uniforms: Record<string, WebGLUniformLocation | null>;
    } = { attribs: {}, uniforms: {} };

    function setup(): boolean {
      const context = gl;
      if (!context) return false;
      const vs = compile(context, context.VERTEX_SHADER, VERTEX_SRC);
      const fs = compile(context, context.FRAGMENT_SHADER, FRAGMENT_SRC);
      if (!vs || !fs) return false;

      const prog = context.createProgram();
      if (!prog) return false;
      context.attachShader(prog, vs);
      context.attachShader(prog, fs);
      context.linkProgram(prog);
      if (!context.getProgramParameter(prog, context.LINK_STATUS)) return false;
      context.deleteShader(vs);
      context.deleteShader(fs);
      program = prog;

      buffer = context.createBuffer();
      context.bindBuffer(context.ARRAY_BUFFER, buffer);
      context.bufferData(context.ARRAY_BUFFER, packed, context.STATIC_DRAW);

      for (const name of ["a_t", "a_across", "a_depth", "a_phase", "a_speed", "a_twinkle"]) {
        locations.attribs[name] = context.getAttribLocation(prog, name);
      }
      for (const name of [
        "u_time",
        "u_pointer",
        "u_dpr",
        "u_flow",
        "u_ampl",
        "u_intensity",
        "u_colorFar",
        "u_colorNear",
      ]) {
        locations.uniforms[name] = context.getUniformLocation(prog, name);
      }
      return true;
    }

    function resize() {
      const context = gl;
      // These functions are hoisted above the null-guard on `canvas`, so each
      // re-narrows it locally.
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
      // The centralised pointer controller (usePointerParallax) writes these
      // onto the stage; the canvas inherits them. Reading them here keeps one
      // source of truth for the whole scene's motion.
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
      const time = reduce ? 0 : (now - start) / 1000;

      context.useProgram(program);
      context.disable(context.DEPTH_TEST);
      context.enable(context.BLEND);
      if (theme.additive) context.blendFunc(context.ONE, context.ONE);
      else context.blendFunc(context.ONE, context.ONE_MINUS_SRC_ALPHA);
      context.clearColor(0, 0, 0, 0);
      context.clear(context.COLOR_BUFFER_BIT);

      context.bindBuffer(context.ARRAY_BUFFER, buffer);
      const stride = RIBBON_STRIDE * 4;
      const order = ["a_t", "a_across", "a_depth", "a_phase", "a_speed", "a_twinkle"];
      order.forEach((name, index) => {
        const loc = locations.attribs[name];
        if (loc < 0) return;
        context.enableVertexAttribArray(loc);
        context.vertexAttribPointer(loc, 1, context.FLOAT, false, stride, index * 4);
      });

      const [px, py] = reduce ? [0, 0] : pointer();
      context.uniform1f(locations.uniforms.u_time, time);
      context.uniform2f(locations.uniforms.u_pointer, px, py);
      context.uniform1f(locations.uniforms.u_dpr, dpr);
      context.uniform1f(locations.uniforms.u_flow, 1.0);
      context.uniform1f(locations.uniforms.u_ampl, 0.09);
      context.uniform1f(locations.uniforms.u_intensity, theme.intensity);
      context.uniform3fv(locations.uniforms.u_colorFar, theme.colorFar);
      context.uniform3fv(locations.uniforms.u_colorNear, theme.colorNear);

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
    // Reduced motion gets exactly one frame; everyone else gets the loop.
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
