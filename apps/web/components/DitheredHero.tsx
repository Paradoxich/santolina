'use client'

import { useEffect, useRef } from 'react'

/**
 * A still image drawn through a WebGL fragment shader that owns both the slow
 * Ken Burns orbit and a screen-locked ordered (Bayer) dither.
 *
 * The photo drifts in UV space (u_time), while the Bayer threshold is sampled
 * from an 8x8 matrix indexed by gl_FragCoord, so the dither grid stays pinned
 * to the screen as the image moves underneath. Each colour channel is quantised
 * to `levels` steps with the threshold spreading the rounding, so the photo
 * keeps its real colour and only gains a fine grain (higher levels = subtler).
 *
 * A cursor lens adds an interactive flourish (reveal / organic / magnify /
 * coarsen / spotlight); its position eases in with a critically damped weight
 * so a heavy setting glides smoothly rather than springing.
 *
 * The Bayer matrix rides in as an 8x8 texture (unit 1) rather than a GLSL
 * array: large local arrays with computed indices are a portability trap in
 * GLSL ES 1.00 and silently misbehave on some drivers.
 *
 * This knows nothing about gardens and is a candidate to lift into
 * @paradoxui/ui as a generic <DitheredImage> primitive.
 */

type DitheredHeroProps = {
  src: string
  /**
   * Quantisation steps per colour channel. Higher = subtler (keeps the photo's
   * real colour, just a fine dither grain); lower = heavier posterisation.
   */
  levels?: number
  /** Dither cell size in CSS pixels. Larger = chunkier. */
  cell?: number
  /**
   * Radius in CSS pixels of the cursor lens. 0 disables the interaction.
   */
  revealRadius?: number
  /** Lens edge feather, 0 (hard edge) to 1 (very soft). */
  softness?: number
  /**
   * How much mass the lens has: 0 follows the cursor instantly (weightless),
   * 1 lags and glides with momentum and smears along its motion (viscous).
   */
  weight?: number
  /**
   * What the lens does under the cursor:
   * - reveal: dissolve the dither back to the clean photo (soft circle)
   * - organic: same reveal with a torn, wobbling edge
   * - magnify: bulge the photo toward the cursor and reveal it (a loupe)
   * - coarsen: grow the dots into chunky blocks under the cursor
   * - spotlight: brighten and saturate the photo inside the lens
   */
  hoverMode?: 'reveal' | 'organic' | 'magnify' | 'coarsen' | 'spotlight'
}

const HOVER_MODES = {
  reveal: 0,
  organic: 1,
  magnify: 2,
  coarsen: 3,
  spotlight: 4,
} as const

// 8x8 ordered-dither (Bayer) matrix, values 0..63.
const BAYER_8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36,
  14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
  61, 29, 53, 21,
]

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;

uniform sampler2D u_image;
uniform sampler2D u_bayer;
uniform vec2 u_resolution;      // canvas size, device px
uniform vec2 u_imageSize;       // natural image size
uniform float u_time;           // seconds
uniform float u_cell;           // dither cell size, device px
uniform float u_levels;         // quantisation steps per channel
uniform vec2 u_mouse;           // cursor, device px (gl_FragCoord space)
uniform float u_radius;         // lens radius, device px
uniform float u_hover;          // lens strength 0..1 (fades on enter/leave)
uniform float u_soft;           // edge feather 0 (hard) .. 1 (very soft)
uniform float u_mode;           // 0 reveal, 1 organic, 2 magnify, 3 coarsen, 4 spotlight
uniform vec2 u_velocity;        // lens velocity, device px/frame (for the smear)
uniform float u_weight;         // 0 weightless .. 1 heavy/viscous

void main() {
  // Velocity-stretched distance: while the lens moves it elongates along the
  // motion axis and thins across it (a droplet smearing through liquid), then
  // relaxes to a circle at rest. Combined with the spring lag on u_mouse, this
  // gives the lens a sense of mass — moving through something, not over it.
  vec2 off = gl_FragCoord.xy - u_mouse;
  float speed = length(u_velocity);
  vec2 dir = speed > 0.001 ? u_velocity / speed : vec2(1.0, 0.0);
  float para = dot(off, dir);
  float perp = dot(off, vec2(-dir.y, dir.x));
  float stretch = clamp(speed * u_weight * 0.05, 0.0, 1.4);
  para /= (1.0 + stretch);
  perp *= (1.0 + stretch * 0.25);
  float dist = length(vec2(para, perp));
  float core = 1.0 - smoothstep(0.0, u_radius, dist); // hard proximity 0..1

  // Lens edge. Organic mode wobbles the radius by angle (a torn-paper edge).
  float radius = u_radius;
  if (u_mode > 0.5 && u_mode < 1.5) {
    float ang = atan(gl_FragCoord.y - u_mouse.y, gl_FragCoord.x - u_mouse.x);
    radius *= 1.0 + 0.18 * sin(ang * 5.0 + u_time * 0.6)
                  + 0.10 * sin(ang * 9.0 - u_time * 0.4);
  }
  float lens = (1.0 - smoothstep(radius * (1.0 - u_soft), radius, dist)) * u_hover;

  // Screen position feeding the photo sample. Magnify pulls it toward the
  // cursor so the photo bulges (a loupe). The dither stays on real gl_FragCoord.
  vec2 pos = gl_FragCoord.xy;
  if (u_mode > 1.5 && u_mode < 2.5) {
    pos = mix(pos, u_mouse, core * 0.35 * u_hover);
  }

  // object-cover fit of the image into the canvas.
  vec2 uv = pos / u_resolution;
  uv.y = 1.0 - uv.y;
  float canvasAspect = u_resolution.x / u_resolution.y;
  float imageAspect = u_imageSize.x / u_imageSize.y;
  vec2 scale = canvasAspect > imageAspect
    ? vec2(1.0, imageAspect / canvasAspect)
    : vec2(canvasAspect / imageAspect, 1.0);
  vec2 cover = (uv - 0.5) * scale + 0.5;

  // Ken Burns orbit: breathing zoom + quarter-period-offset x/y drift, so the
  // loop closes on itself with no cut. Slack comes from the >1 zoom.
  float t = u_time * 0.157; // ~40s period
  float zoom = 1.2 + 0.1 * sin(t);
  vec2 drift = vec2(0.11 * sin(t), 0.06 * sin(t - 1.5708));
  vec2 img = (cover - 0.5) / zoom + 0.5 + drift;

  vec3 c = texture2D(u_image, img).rgb;

  // Screen-locked ordered dither. Coarsen mode grows the cell toward the cursor
  // so the dots swell into chunky blocks under the pointer.
  float cell = u_cell;
  if (u_mode > 2.5 && u_mode < 3.5) {
    cell = u_cell * (1.0 + 6.0 * core * u_hover);
  }
  vec2 cellCoord = floor(gl_FragCoord.xy / cell);
  float threshold = texture2D(u_bayer, (cellCoord + 0.5) / 8.0).r;

  // Colour-preserving ordered dither: quantise each channel to u_levels steps,
  // using the Bayer threshold to spread the rounding.
  float steps = max(u_levels - 1.0, 1.0);
  vec3 dithered = floor(c * steps + threshold) / steps;

  vec3 outColor = dithered;
  if (u_mode < 2.5) {
    // reveal (0), organic (1), magnify (2): dissolve to the clean photo inside.
    outColor = mix(dithered, c, lens);
  } else if (u_mode < 3.5) {
    // coarsen (3): the chunky dots are the effect; nothing to reveal.
    outColor = dithered;
  } else {
    // spotlight (4): brighten + saturate the photo inside the lens.
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    vec3 boosted = clamp(mix(vec3(l), c, 1.5) * 1.15, 0.0, 1.0);
    outColor = mix(dithered, boosted, lens);
  }

  gl_FragColor = vec4(outColor, 1.0);
}
`

// Critically-damped smoothing (Game Programming Gems 4 / Unity SmoothDamp).
// Eases `current` toward `target` over roughly `smoothTime` seconds without
// ever overshooting or oscillating — the key to a heavy move reading as smooth
// rather than springy. Framerate-independent via real `dt`. Returns the new
// position and velocity (units/second).
function smoothDamp(
  current: number,
  target: number,
  vel: number,
  smoothTime: number,
  dt: number
): [number, number] {
  const omega = 2 / smoothTime
  const x = omega * dt
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = current - target
  const temp = (vel + omega * change) * dt
  const newVel = (vel - omega * temp) * exp
  return [target + (change + temp) * exp, newVel]
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error(
      '[DitheredHero] shader compile failed:',
      gl.getShaderInfoLog(sh)
    )
    gl.deleteShader(sh)
    return null
  }
  return sh
}

export function DitheredHero({
  src,
  levels = 6,
  cell = 2,
  revealRadius = 130,
  softness = 0.45,
  weight = 0.5,
  hoverMode = 'reveal',
}: DitheredHeroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Read tuning through refs so live changes (e.g. the /dither-lab sliders)
  // apply on the next animation frame without tearing down the GL context.
  const levelsRef = useRef(levels)
  const cellRef = useRef(cell)
  const revealRadiusRef = useRef(revealRadius)
  const softnessRef = useRef(softness)
  const weightRef = useRef(weight)
  const modeRef = useRef(HOVER_MODES[hoverMode])
  levelsRef.current = levels
  cellRef.current = cell
  revealRadiusRef.current = revealRadius
  softnessRef.current = softness
  weightRef.current = weight
  modeRef.current = HOVER_MODES[hoverMode]
  const requestRenderRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', {
      antialias: false,
      premultipliedAlpha: false,
    })
    if (!gl) {
      console.warn('[DitheredHero] no WebGL; leaving fallback image visible')
      return
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[DitheredHero] link failed:', gl.getProgramInfoLog(prog))
      return
    }
    gl.useProgram(prog)

    // Full-screen triangle.
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    )
    const aPos = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const u = {
      image: gl.getUniformLocation(prog, 'u_image'),
      bayer: gl.getUniformLocation(prog, 'u_bayer'),
      resolution: gl.getUniformLocation(prog, 'u_resolution'),
      imageSize: gl.getUniformLocation(prog, 'u_imageSize'),
      time: gl.getUniformLocation(prog, 'u_time'),
      cell: gl.getUniformLocation(prog, 'u_cell'),
      levels: gl.getUniformLocation(prog, 'u_levels'),
      mouse: gl.getUniformLocation(prog, 'u_mouse'),
      radius: gl.getUniformLocation(prog, 'u_radius'),
      hover: gl.getUniformLocation(prog, 'u_hover'),
      soft: gl.getUniformLocation(prog, 'u_soft'),
      mode: gl.getUniformLocation(prog, 'u_mode'),
      velocity: gl.getUniformLocation(prog, 'u_velocity'),
      weight: gl.getUniformLocation(prog, 'u_weight'),
    }
    gl.uniform1i(u.image, 0)
    gl.uniform1i(u.bayer, 1)

    // Unit 1: the 8x8 Bayer matrix as a LUMINANCE texture, tiled with REPEAT.
    const bayerTex = gl.createTexture()
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, bayerTex)
    const bayerPx = new Uint8Array(64)
    for (let i = 0; i < 64; i++) {
      bayerPx[i] = Math.round((((BAYER_8[i] ?? 0) + 0.5) / 64) * 255)
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      8,
      8,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      bayerPx
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)

    // Unit 0: the photo. Starts as a 1x1 black placeholder until it loads.
    const tex = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255])
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    let imgW = 1
    let imgH = 1
    let loaded = false
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      imgW = image.naturalWidth
      imgH = image.naturalHeight
      loaded = true
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
      render(performance.now())
    }
    image.src = src

    const dpr = () => Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const r = dpr()
      const w = Math.round(canvas.clientWidth * r)
      const h = Math.round(canvas.clientHeight * r)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }

    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    const start = performance.now()

    // Cursor reveal lens. Targets are set by pointer events; the smoothed
    // values trail them so the lens glides (and fades) instead of snapping.
    // Coordinates are in gl_FragCoord space (device px, origin bottom-left).
    let targetX = 0
    let targetY = 0
    let smoothX = 0
    let smoothY = 0
    let velX = 0 // smoothing velocity, device px/second
    let velY = 0
    let lastMs = start
    let targetHover = 0
    let smoothHover = 0

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const r = dpr()
      targetX = (e.clientX - rect.left) * r
      targetY = canvas.height - (e.clientY - rect.top) * r
      targetHover = 1
      if (reduced) render(performance.now())
    }
    const onPointerLeave = () => {
      targetHover = 0
      if (reduced) render(performance.now())
    }
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerleave', onPointerLeave)

    const render = (now: number) => {
      resize()
      if (canvas.width === 0 || canvas.height === 0) return
      // Critically-damped glide toward the cursor. Heavier weight = longer
      // smoothTime, so the lens lags and eases in slowly, but never overshoots
      // or oscillates (that ringing was what read as "jumpy"). Real frame dt
      // keeps it smooth across frame rates. Reduced motion snaps (no rAF loop).
      const dt = Math.min((now - lastMs) / 1000, 0.05)
      lastMs = now
      if (reduced || dt <= 0) {
        smoothX = targetX
        smoothY = targetY
        velX = 0
        velY = 0
      } else {
        const w = Math.min(Math.max(weightRef.current, 0), 1)
        const smoothTime = 0.03 + 0.32 * w // seconds to catch up: light..heavy
        ;[smoothX, velX] = smoothDamp(smoothX, targetX, velX, smoothTime, dt)
        ;[smoothY, velY] = smoothDamp(smoothY, targetY, velY, smoothTime, dt)
      }
      smoothHover += (targetHover - smoothHover) * (reduced ? 1 : 0.12)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(u.resolution, canvas.width, canvas.height)
      gl.uniform2f(u.imageSize, imgW, imgH)
      gl.uniform1f(u.cell, Math.max(1, cellRef.current * dpr()))
      gl.uniform1f(u.levels, levelsRef.current)
      gl.uniform2f(u.mouse, smoothX, smoothY)
      gl.uniform1f(u.radius, Math.max(1, revealRadiusRef.current * dpr()))
      gl.uniform1f(u.hover, revealRadiusRef.current > 0 ? smoothHover : 0)
      gl.uniform1f(u.soft, softnessRef.current)
      gl.uniform1f(u.mode, modeRef.current)
      // velX/velY are px/second; the shader smear expects ~px/frame, so scale.
      gl.uniform2f(u.velocity, velX / 60, velY / 60)
      gl.uniform1f(u.weight, weightRef.current)
      gl.uniform1f(u.time, reduced ? 0 : (now - start) / 1000)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    // Animate continuously unless the user prefers reduced motion, in which
    // case we render on demand (resize / image load) to a static frame.
    let raf = 0
    const loop = (now: number) => {
      render(now)
      raf = requestAnimationFrame(loop)
    }
    if (reduced) {
      render(performance.now())
    } else {
      raf = requestAnimationFrame(loop)
    }

    const ro = new ResizeObserver(() => {
      if (reduced) render(performance.now())
    })
    ro.observe(canvas)
    if (loaded) render(performance.now())

    // Let the reduced-motion path repaint on demand when tuning changes.
    requestRenderRef.current = () => render(performance.now())

    return () => {
      requestRenderRef.current = null
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      cancelAnimationFrame(raf)
      ro.disconnect()
      gl.deleteTexture(tex)
      gl.deleteTexture(bayerTex)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [src])

  // When motion is off, the rAF loop isn't running, so nudge a repaint after a
  // tuning change (harmless while animating).
  useEffect(() => {
    requestRenderRef.current?.()
  }, [levels, cell, revealRadius, softness, weight, hoverMode])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden
    />
  )
}
