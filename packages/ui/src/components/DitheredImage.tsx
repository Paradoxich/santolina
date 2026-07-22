'use client'

import { useEffect, useRef } from 'react'
import { cn } from '../utils/cn'

/**
 * An image drawn through a WebGL fragment shader that owns both a slow Ken
 * Burns orbit and a screen-locked ordered (Bayer) dither, with an optional
 * interactive cursor lens.
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
 * The component owns its box: it renders a plain <img> (the fallback shown
 * when WebGL or JavaScript is unavailable, and while the texture loads) with
 * the shader canvas painted over it. Size and style it via `className`.
 *
 * With `videoSrc` the texture is live footage instead of a still: every frame
 * of the loop re-uploads the current video frame, the Ken Burns orbit turns
 * off (the footage brings its own motion; the dither grid stays screen-locked
 * on top of it), and `src` serves as the poster — what reduced-motion users,
 * `motion={false}`, autoplay refusals, and failed loads see, dithered, static.
 *
 * The Bayer matrix rides in as an 8x8 texture (unit 1) rather than a GLSL
 * array: large local arrays with computed indices are a portability trap in
 * GLSL ES 1.00 and silently misbehave on some drivers.
 */

export interface DitheredImageProps {
  /**
   * Image URL. For a WebGL texture from another origin it must be CORS-enabled.
   * When `videoSrc` is set this is the poster: the fallback element, the
   * static frame for reduced-motion users, and what remains if the video
   * fails to load or autoplay.
   */
  src: string
  /**
   * Video URL (same CORS caveat). Plays muted, looping, inline, feeding the
   * shader a live frame each tick. Disables the Ken Burns orbit — the footage
   * supplies the motion, and the dither stays screen-locked over it.
   */
  videoSrc?: string
  /** Alt text for the fallback image. Defaults to '' (decorative). */
  alt?: string
  /** Classes for the root box (sizing, radius, background). */
  className?: string
  /**
   * Quantisation steps per colour channel. Higher = subtler (keeps the image's
   * real colour, just a fine dither grain); lower = heavier posterisation.
   */
  levels?: number
  /** Dither cell size in CSS pixels. Larger = chunkier. */
  cell?: number
  /** Radius in CSS pixels of the cursor lens. 0 disables the interaction. */
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
   * - reveal: dissolve the dither back to the clean image (soft circle)
   * - organic: same reveal with a torn, wobbling edge
   * - magnify: bulge the image toward the cursor and reveal it (a loupe)
   * - coarsen: grow the dots into chunky blocks under the cursor
   * - spotlight: brighten and saturate the image inside the lens
   */
  hoverMode?: 'reveal' | 'organic' | 'magnify' | 'coarsen' | 'spotlight'
  /**
   * Whether the image drifts (the Ken Burns orbit). `false` keeps the dither
   * and renders one static frame, which also stops the animation loop — worth
   * reaching for when several instances share a page. With `videoSrc` it
   * gates playback instead: `false` leaves the video untouched and shows the
   * dithered poster. Users who prefer reduced motion always get the static
   * frame regardless of this setting.
   */
  motion?: boolean
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
uniform float u_orbit;          // 1 Ken Burns orbit, 0 plain cover fit (video)
uniform float u_corner;         // rounded-corner radius, device px (0 = square)

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

  // Screen position feeding the image sample. Magnify pulls it toward the
  // cursor so the image bulges (a loupe). The dither stays on real gl_FragCoord.
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
  // loop closes on itself with no cut. Slack comes from the >1 zoom. Video
  // sources set u_orbit to 0 for a plain cover fit — the footage moves on
  // its own, and stacking a drift on top would read as swimming.
  float t = u_time * 0.157; // ~40s period
  float zoom = mix(1.0, 1.2 + 0.1 * sin(t), u_orbit);
  vec2 drift = vec2(0.11 * sin(t), 0.06 * sin(t - 1.5708)) * u_orbit;
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
    // reveal (0), organic (1), magnify (2): dissolve to the clean image inside.
    outColor = mix(dithered, c, lens);
  } else if (u_mode < 3.5) {
    // coarsen (3): the chunky dots are the effect; nothing to reveal.
    outColor = dithered;
  } else {
    // spotlight (4): brighten + saturate the image inside the lens.
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    vec3 boosted = clamp(mix(vec3(l), c, 1.5) * 1.15, 0.0, 1.0);
    outColor = mix(dithered, boosted, lens);
  }

  // Rounded corners baked into the pixels. Some compositors (Firefox
  // WebRender on certain configs) ignore both border-radius and clip-path on
  // an accelerated canvas layer, but no compositor can ignore alpha that was
  // never drawn: outside the rounded rect we output transparent, with a
  // ~1.5px feather as anti-aliasing.
  float aCorner = 1.0;
  if (u_corner > 0.0) {
    vec2 halfRes = u_resolution * 0.5;
    vec2 q = abs(gl_FragCoord.xy - halfRes) - (halfRes - vec2(u_corner));
    float dCorner = length(max(q, 0.0)) - u_corner;
    aCorner = 1.0 - smoothstep(-0.75, 0.75, dCorner);
  }

  gl_FragColor = vec4(outColor, aCorner);
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
      '[DitheredImage] shader compile failed:',
      gl.getShaderInfoLog(sh)
    )
    gl.deleteShader(sh)
    return null
  }
  return sh
}

export function DitheredImage({
  src,
  videoSrc,
  alt = '',
  className,
  levels = 6,
  cell = 2,
  revealRadius = 130,
  softness = 0.45,
  weight = 0.5,
  hoverMode = 'reveal',
  motion = true,
}: DitheredImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Firefox's GPU compositor (seen on 153, macOS) ignores border-radius on
  // accelerated layers — the WebGL canvas and the video paint square corners
  // no matter where the radius sits, wrapper or the elements themselves.
  // clip-path is applied by the compositor and does clip those layers, so
  // mirror whatever radius the wrapper was given into an equivalent
  // inset(0 round …). Runs before the canvas ever paints (the shader only
  // draws from the GL effect below), so nothing flashes square; the SSR'd
  // <img> fallback is a plain layer that border-radius already clips.
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const s = window.getComputedStyle(el)
    const corners = [
      s.borderTopLeftRadius,
      s.borderTopRightRadius,
      s.borderBottomRightRadius,
      s.borderBottomLeftRadius,
    ]
    if (corners.some((r) => r && r !== '0px')) {
      el.style.clipPath = `inset(0 round ${corners.join(' ')})`
    }
  }, [className])

  // Read tuning through refs so live changes (e.g. a controls panel) apply on
  // the next animation frame without tearing down the GL context.
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
      console.warn('[DitheredImage] no WebGL; leaving fallback image visible')
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
      console.error('[DitheredImage] link failed:', gl.getProgramInfoLog(prog))
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
      orbit: gl.getUniformLocation(prog, 'u_orbit'),
      corner: gl.getUniformLocation(prog, 'u_corner'),
    }
    gl.uniform1i(u.image, 0)
    gl.uniform1i(u.bayer, 1)
    // The orbit exists to animate a still; footage moves on its own. Off for
    // video even when the video itself ends up not playing (poster stays put).
    gl.uniform1f(u.orbit, videoSrc ? 0 : 1)

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

    // CSS-pixel corner radius of the wrapper, fed to the shader mask. Read
    // from computed style so it tracks whatever radius class the consumer
    // passed; re-read on resize in case a breakpoint changes it.
    let cornerCss = 0
    const readCorner = () => {
      const parent = canvas.parentElement
      if (!parent) return
      cornerCss =
        parseFloat(window.getComputedStyle(parent).borderTopLeftRadius) || 0
    }
    readCorner()

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
    // A caller opting out of motion takes the same path as a reader who has
    // asked for less of it: one static frame, no animation loop. For video
    // that means the footage never plays — the dithered poster stands in.
    const still = reduced || !motion
    const start = performance.now()

    // Live footage. The element carries `autoplay` and lives in the DOM below
    // the canvas: muted autoplay is only reliable declaratively, since an
    // imperative play() on load has no user activation behind it, and a
    // detached element is "video-only background media" Chrome power-saves.
    // A reader who asked for less motion gets it stopped here instead —
    // prefers-reduced-motion can't be known at render time, only now.
    const video: HTMLVideoElement | null = still ? null : videoRef.current
    if (still && videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
    // Belt and braces: some engines honour the attribute, others the call.
    // Either way a refusal is survivable — the dithered poster stands in.
    video?.play().catch(() => {})

    // Cursor lens. Targets are set by pointer events; the smoothed values trail
    // them so the lens glides (and fades) instead of snapping. Coordinates are
    // in gl_FragCoord space (device px, origin bottom-left).
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
      if (still) render(performance.now())
    }
    const onPointerLeave = () => {
      targetHover = 0
      if (still) render(performance.now())
    }
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerleave', onPointerLeave)

    const render = (now: number) => {
      resize()
      if (canvas.width === 0 || canvas.height === 0) return
      // Video frames overwrite the poster once actual frame data exists.
      if (video && video.readyState >= video.HAVE_CURRENT_DATA) {
        imgW = video.videoWidth
        imgH = video.videoHeight
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          video
        )
      }
      // Critically-damped glide toward the cursor. Heavier weight = longer
      // smoothTime, so the lens lags and eases in slowly, but never overshoots
      // or oscillates (that ringing was what read as "jumpy"). Real frame dt
      // keeps it smooth across frame rates. Reduced motion snaps (no rAF loop).
      const dt = Math.min((now - lastMs) / 1000, 0.05)
      lastMs = now
      if (still || dt <= 0) {
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
      smoothHover += (targetHover - smoothHover) * (still ? 1 : 0.12)
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
      gl.uniform1f(u.time, still ? 0 : (now - start) / 1000)
      gl.uniform1f(u.corner, cornerCss * (window.devicePixelRatio || 1))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    // Animate continuously unless motion is off — either by prop or because
    // the user prefers reduced motion — in which case we render on demand
    // (resize / image load / pointer) to a static frame.
    let raf = 0
    const loop = (now: number) => {
      render(now)
      raf = requestAnimationFrame(loop)
    }
    if (still) {
      render(performance.now())
    } else {
      raf = requestAnimationFrame(loop)
    }

    const ro = new ResizeObserver(() => {
      readCorner()
      if (still) render(performance.now())
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
      video?.pause()
      gl.deleteTexture(tex)
      gl.deleteTexture(bayerTex)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
    // `motion` is a dependency rather than a ref: it decides whether the rAF
    // loop exists at all, so it has to rebuild rather than be read per frame.
    // `videoSrc` likewise owns a per-effect resource (the video element).
  }, [src, videoSrc, motion])

  // When motion is off, the rAF loop isn't running, so nudge a repaint after a
  // tuning change (harmless while animating).
  useEffect(() => {
    requestRenderRef.current?.()
  }, [levels, cell, revealRadius, softness, weight, hoverMode])

  // rounded-[inherit] on every layer, not just overflow-hidden on the box:
  // Firefox does not clip a hardware-accelerated canvas (or video) through an
  // ancestor's border-radius, so the wrapper's radius must land on the
  // painted elements themselves. Inherit keeps the component agnostic — pass
  // any radius via className and all three layers follow it.
  return (
    <div ref={wrapperRef} className={cn('relative overflow-hidden', className)}>
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full rounded-[inherit] object-cover"
      />
      {videoSrc && (
        // In the DOM so Chrome keeps playing it (detached video-only media is
        // power-save paused), under the canvas so the shader is what shows.
        // Playback starts from the effect, never here — reduced motion and
        // motion={false} leave it paused behind the dithered poster.
        // opacity-0, not hidden: it is purely a texture source for the
        // shader, and its accelerated layer is exactly the kind Firefox
        // refuses to round — invisible, it can't betray a square corner
        // through the canvas's transparent ones.
        <video
          ref={videoRef}
          src={videoSrc}
          autoPlay={motion}
          muted
          loop
          playsInline
          crossOrigin="anonymous"
          className="absolute inset-0 h-full w-full rounded-[inherit] object-cover opacity-0"
          aria-hidden
        />
      )}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full rounded-[inherit]"
        aria-hidden
      />
    </div>
  )
}

export default DitheredImage
