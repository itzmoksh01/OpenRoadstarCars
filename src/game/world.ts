import * as THREE from 'three'
import type { Physics } from '../engine/physics'
import { RAPIER } from '../engine/physics'

export type Island = { x: number; z: number; top: number; r: number; cores: number; decor?: boolean }
export const ISLANDS: Island[] = [{ x: 0, z: 0, top: 0, r: 20, cores: 8, decor: true }]
export type DroneRoute = { center: THREE.Vector3; radius: number; phase: number; dir: 1 | -1 }
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function planStones(a: Island, b: Island): { x: number; z: number; top: number }[] {
  const d = Math.hypot(b.x - a.x, b.z - a.z)
  const gap = Math.max(0, d - a.r - b.r)
  const n = Math.max(0, Math.ceil(gap / 2.3) - 1)
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / (n + 1)
    return { x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t), top: THREE.MathUtils.lerp(a.top, b.top, t) }
  })
}

export type MovingPlatform = { mesh: THREE.Mesh; body: RAPIER.RigidBody; from: THREE.Vector3; to: THREE.Vector3; period: number; phase: number; delta: THREE.Vector3; half: THREE.Vector3 }

const NEON_CYAN = new THREE.Color('#61f6ff')
const NEON_MAGENTA = new THREE.Color('#ff4dd8')
const ASPHALT = new THREE.Color('#101522')

export class World {
  readonly scene = new THREE.Scene()
  readonly sun: THREE.DirectionalLight
  readonly spawn = new THREE.Vector3(0, 1.2, 25)
  readonly coreSpots: THREE.Vector3[] = []
  readonly movers: MovingPlatform[] = []
  private readonly animated: THREE.Object3D[] = []

  constructor(private readonly physics: Physics, shadowMapSize: number) {
    this.scene.background = new THREE.Color('#07111f')
    this.scene.fog = new THREE.Fog('#07111f', 70, 190)
    this.scene.add(this.makeSky())
    this.scene.add(new THREE.HemisphereLight('#b6dcff', '#050711', 1.25))
    this.sun = new THREE.DirectionalLight('#d8f6ff', 2.8)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize)
    const camera = this.sun.shadow.camera
    camera.left = camera.bottom = -55
    camera.right = camera.top = 55
    camera.near = 1
    camera.far = 130
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.04
    this.scene.add(this.sun, this.sun.target)

    this.addArena()
    this.addTrack()
    this.addRamps()
    this.addCheckpointGates()
    this.addScenery()
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.sun.position.set(focus.x + 28, focus.y + 46, focus.z + 18)
    this.sun.target.position.copy(focus)
    for (const item of this.animated) item.rotation.y += dt * (item.userData.spin as number ?? 0.4)
  }

  stepMovers(_elapsed: number): void { /* kept for the starter loop contract; this track has no moving platforms */ }

  private addArena(): void {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(110, 1, 110), new THREE.MeshStandardMaterial({ color: '#070b14', metalness: 0.35, roughness: 0.8 }))
    floor.position.y = -0.55
    floor.receiveShadow = true
    this.scene.add(floor)
    this.physics.addStaticBox(floor.position, new THREE.Vector3(110, 1, 110))

    const center = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 0.18, 64), new THREE.MeshStandardMaterial({ color: '#121a2d', metalness: 0.65, roughness: 0.32 }))
    center.position.y = 0.02
    center.receiveShadow = true
    this.scene.add(center)
    this.physics.addStaticCylinder(new THREE.Vector3(0, -0.05, 0), 18, 0.18)

    for (const x of [-52, 52]) for (const z of [-52, 52]) {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 8, 10), new THREE.MeshStandardMaterial({ color: '#16243a', emissive: '#0b1c36', emissiveIntensity: 0.8 }))
      pylon.position.set(x, 4, z)
      pylon.castShadow = true
      this.scene.add(pylon)
    }
  }

  private addTrack(): void {
    const segments: Array<{ x: number; z: number; w: number; d: number; neon: THREE.Color }> = [
      { x: 0, z: 24, w: 14, d: 34, neon: NEON_CYAN },
      { x: 24, z: 0, w: 34, d: 14, neon: NEON_MAGENTA },
      { x: 0, z: -24, w: 14, d: 34, neon: NEON_CYAN },
      { x: -24, z: 0, w: 34, d: 14, neon: NEON_MAGENTA },
    ]
    for (const segment of segments) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(segment.w, 0.16, segment.d), new THREE.MeshStandardMaterial({ color: ASPHALT, metalness: 0.5, roughness: 0.72 }))
      road.position.set(segment.x, 0.08, segment.z)
      road.receiveShadow = true
      this.scene.add(road)
      this.physics.addStaticBox(road.position, new THREE.Vector3(segment.w, 0.16, segment.d))
      const edgeMat = new THREE.MeshStandardMaterial({ color: segment.neon, emissive: segment.neon, emissiveIntensity: 2.6, toneMapped: false })
      const railA = new THREE.Mesh(new THREE.BoxGeometry(segment.w + 0.6, 0.12, 0.08), edgeMat)
      const railB = railA.clone()
      railA.position.set(segment.x, 0.22, segment.z - segment.d / 2 + 0.4)
      railB.position.set(segment.x, 0.22, segment.z + segment.d / 2 - 0.4)
      if (segment.w > segment.d) { railA.rotation.z = Math.PI / 2; railB.rotation.z = Math.PI / 2; railA.position.set(segment.x - segment.w / 2 + 0.4, 0.22, segment.z); railB.position.set(segment.x + segment.w / 2 - 0.4, 0.22, segment.z) }
      this.scene.add(railA, railB)
    }
    for (const z of [25, 8, -8, -25]) this.coreSpots.push(new THREE.Vector3(0, 1.25, z))
    for (const x of [25, 8, -8, -25]) this.coreSpots.push(new THREE.Vector3(x, 1.25, 0))
  }

  private addRamps(): void {
    this.addRamp(new THREE.Vector3(0, 1.1, -14), 11, 0.35, NEON_CYAN)
    this.addRamp(new THREE.Vector3(14, 0.9, 0), 10, -0.3, NEON_MAGENTA, true)
    this.addRamp(new THREE.Vector3(-14, 1.1, 0), 10, 0.3, NEON_MAGENTA, true)
    this.addRamp(new THREE.Vector3(0, 1.1, 14), 9, -0.3, NEON_CYAN)

    const loop = new THREE.Mesh(new THREE.TorusGeometry(7, 0.55, 10, 64, Math.PI * 1.4), new THREE.MeshStandardMaterial({ color: '#25344f', metalness: 0.45, roughness: 0.42 }))
    loop.rotation.z = Math.PI / 2
    loop.position.set(0, 4.6, -27)
    loop.castShadow = true
    this.scene.add(loop)
  }

  private addRamp(position: THREE.Vector3, length: number, angle: number, color: THREE.Color, sideways = false): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sideways ? length : 4.8, 0.5, sideways ? 4.8 : length), new THREE.MeshStandardMaterial({ color: '#253049', metalness: 0.7, roughness: 0.38 }))
    mesh.position.copy(position)
    mesh.rotation.set(sideways ? 0 : angle, 0, sideways ? angle : 0)
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.scene.add(mesh)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z))
    this.physics.addStaticBox(mesh.position, new THREE.Vector3(sideways ? length : 4.8, 0.5, sideways ? 4.8 : length), q)
    const strip = new THREE.Mesh(new THREE.BoxGeometry(sideways ? length * 0.86 : 0.12, 0.08, sideways ? 0.12 : length * 0.86), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2, toneMapped: false }))
    strip.position.copy(position)
    strip.position.y += 0.28
    strip.rotation.copy(mesh.rotation)
    this.scene.add(strip)
  }

  private addCheckpointGates(): void {
    for (const [i, spot] of this.coreSpots.entries()) {
      const group = new THREE.Group()
      const color = i % 2 ? NEON_MAGENTA : NEON_CYAN
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.6, toneMapped: false })
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.4, 0.16), mat)
      const right = left.clone()
      left.position.set(-3.4, 1.7, 0)
      right.position.set(3.4, 1.7, 0)
      const top = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.16, 0.16), mat)
      top.position.y = 3.35
      group.add(left, right, top)
      group.position.copy(spot)
      if (Math.abs(spot.x) > Math.abs(spot.z)) group.rotation.y = Math.PI / 2
      this.scene.add(group)
    }
  }

  private addScenery(): void {
    const ringMat = new THREE.MeshStandardMaterial({ color: '#30415f', emissive: '#1c6e9c', emissiveIntensity: 1.6, metalness: 0.8, roughness: 0.24 })
    for (let i = 0; i < 18; i += 1) {
      const angle = (i / 18) * Math.PI * 2
      const r = 40 + (i % 3) * 4
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4 + (i % 2), 0.12, 8, 24), ringMat)
      ring.position.set(Math.cos(angle) * r, 2 + (i % 3) * 1.6, Math.sin(angle) * r)
      ring.rotation.x = Math.PI / 2
      ring.userData.spin = 0.18 + (i % 4) * 0.05
      this.animated.push(ring)
      this.scene.add(ring)
    }
    for (let i = 0; i < 28; i += 1) {
      const a = (i / 28) * Math.PI * 2
      const r = 34 + (i % 5) * 3
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2 + (i % 4), 8), new THREE.MeshBasicMaterial({ color: i % 2 ? NEON_MAGENTA : NEON_CYAN }))
      beacon.position.set(Math.cos(a) * r, 1.2, Math.sin(a) * r)
      this.scene.add(beacon)
    }
  }

  private makeSky(): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: new THREE.Color('#050914') }, horizon: { value: new THREE.Color('#173c65') } },
      vertexShader: `varying vec3 v; void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 v; void main(){float h=max(v.y,0.0);vec3 c=mix(horizon,top,pow(h,0.45));float stars=step(0.997,fract(sin(dot(v.xy,vec2(12.9898,78.233)))*43758.5453));c+=stars*vec3(0.5,0.8,1.0);gl_FragColor=vec4(c,1.0);}`,
    })
    const sky = new THREE.Mesh(new THREE.SphereGeometry(360, 32, 16), mat)
    sky.renderOrder = -1
    return sky
  }
}
