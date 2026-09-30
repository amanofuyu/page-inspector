export interface MeshGradientRenderer {
  resize: (width: number, height: number, pixelRatio: number) => void
  setPalette: (style: Pick<CSSStyleDeclaration, 'getPropertyValue'>) => void
  draw: (time: number) => boolean
  dispose: () => void
}

type Color = [number, number, number, number]

// 配色沿用页面的十六进制和 rgb/rgba 主题变量，不另建一套深浅色常量。
export function parseMeshColor(value: string): Color {
  const hex = value.trim().match(/^#([\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})$/i)?.[1]
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map(part => part.repeat(2)).join('') : hex
    return [Number.parseInt(full.slice(0, 2), 16) / 255, Number.parseInt(full.slice(2, 4), 16) / 255, Number.parseInt(full.slice(4, 6), 16) / 255, full.length === 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1]
  }
  if (/^rgba?\(/i.test(value.trim())) {
    const parts = value.match(/[\d.]+%?/g)
    if (parts && (parts.length === 3 || parts.length === 4)) {
      const channels = parts.map((part, index) => Math.min(1, Math.max(0, Number.parseFloat(part) / (part.endsWith('%') ? 100 : index < 3 ? 255 : 1))))
      return [channels[0]!, channels[1]!, channels[2]!, channels[3] ?? 1]
    }
  }
  throw new Error('无法读取网格渐变的主题颜色')
}

// 模糊背景限制在约 72 万像素、最长边 1280px，避免高分屏重复消耗填充率。
export function meshBufferSize(width: number, height: number, pixelRatio: number) {
  if (![width, height, pixelRatio].every(Number.isFinite) || width <= 0 || height <= 0 || pixelRatio <= 0)
    return [4, 4] as const
  const scale = Math.min(1, pixelRatio, 1280 / Math.max(width, height), Math.sqrt(720000 / (width * height)))
  return [Math.max(4, Math.floor(width * scale / 4) * 4), Math.max(4, Math.floor(height * scale / 4) * 4)] as const
}

const vertexSource = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`

// 恢复宽阔的弧形浓度网格，较淡区域与光带连续衔接。
const redCoverage = [
  [1, 0.88, 0.52, 0.20, 0.08],
  [0.84, 1, 0.88, 0.52, 0.20],
  [0.36, 0.68, 0.96, 1, 0.68],
  [0.16, 0.36, 0.68, 0.96, 1],
  [0.28, 0.52, 0.88, 1, 0.84],
].flat()

// 浓度网格随坐标形变流动，明暗波沿光带错峰传播，避免整页同时闪烁。
const fragmentSource = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 out_color;
uniform vec3 u_base;
uniform vec4 u_red;
uniform float u_coverage[25];
uniform float u_time;

float control(ivec2 p) {
  p = clamp(p, ivec2(0), ivec2(4));
  return u_coverage[p.y * 5 + p.x];
}

float cubic(float a, float b, float c, float d, float t) {
  return b + 0.5 * t * (c - a + t * (2.0 * a - 5.0 * b + 4.0 * c - d + t * (3.0 * (b - c) + d - a)));
}

float row(ivec2 cell, float t) {
  return cubic(control(cell + ivec2(-1, 0)), control(cell), control(cell + ivec2(1, 0)), control(cell + ivec2(2, 0)), t);
}

void main() {
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  float envelope = sin(uv.x * 3.14159265) * sin(uv.y * 3.14159265);
  vec2 flow = vec2(
    sin(uv.y * 6.2 + u_time * 0.52) + 0.45 * cos(uv.x * 4.8 - u_time * 0.40),
    cos(uv.x * 5.6 - u_time * 0.46) + 0.45 * sin(uv.y * 5.2 + u_time * 0.34)
  );
  vec2 grid = clamp(uv + flow * 0.14 * envelope, 0.0, 1.0) * 4.0;
  ivec2 cell = ivec2(floor(grid));
  vec2 t = fract(grid);
  float density = cubic(row(cell + ivec2(0, -1), t.x), row(cell, t.x), row(cell + ivec2(0, 1), t.x), row(cell + ivec2(0, 2), t.x), t.y);
  float lightWave = 0.82 + 0.28 * sin(uv.y * 5.2 - u_time * 0.62) + 0.16 * cos(uv.x * 3.4 + uv.y * 2.0 + u_time * 0.41);
  float coverage = clamp(pow(clamp(density, 0.0, 1.0), 1.2) * lightWave, 0.0, 1.2);
  vec3 color = mix(u_base, u_red.rgb, coverage * u_red.a);
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  out_color = vec4(clamp(color + dither / 255.0, 0.0, 1.0), 1.0);
}`

export function createMeshGradientRenderer(canvas: HTMLCanvasElement): MeshGradientRenderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, depth: false, stencil: false, powerPreference: 'low-power' })
  if (!gl)
    return null
  const shaders: WebGLShader[] = []
  let program: WebGLProgram | null = null
  let disposed = false
  const dispose = () => {
    if (disposed)
      return
    disposed = true
    for (const shader of shaders)
      gl.deleteShader(shader)
    if (program)
      gl.deleteProgram(program)
  }
  try {
    program = gl.createProgram()
    if (!program)
      throw new Error('无法创建网格渐变程序')
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
      const shader = gl.createShader(type)
      if (!shader)
        throw new Error('无法创建网格渐变着色器')
      shaders.push(shader)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(`网格渐变编译失败：${gl.getProgramInfoLog(program)}`)
    const baseLocation = gl.getUniformLocation(program, 'u_base')
    const redLocation = gl.getUniformLocation(program, 'u_red')
    const coverageLocation = gl.getUniformLocation(program, 'u_coverage[0]')
    const timeLocation = gl.getUniformLocation(program, 'u_time')
    if (baseLocation === null || redLocation === null || coverageLocation === null || timeLocation === null)
      throw new Error('网格渐变参数不可用')
    gl.useProgram(program)
    gl.uniform1fv(coverageLocation, redCoverage)

    return {
      resize(width, height, pixelRatio) {
        const [bufferWidth, bufferHeight] = meshBufferSize(width, height, pixelRatio)
        if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
          canvas.width = bufferWidth
          canvas.height = bufferHeight
          gl.viewport(0, 0, bufferWidth, bufferHeight)
        }
      },
      setPalette(style) {
        const base = parseMeshColor(style.getPropertyValue('--color-base-100'))
        const red = parseMeshColor(style.getPropertyValue('--ambient-red'))
        gl.uniform3fv(baseLocation, base.slice(0, 3))
        gl.uniform4fv(redLocation, red)
      },
      draw(time) {
        if (disposed || gl.isContextLost())
          return false
        gl.uniform1f(timeLocation, time)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        return true
      },
      dispose,
    }
  }
  catch {
    dispose()
    return null
  }
}
