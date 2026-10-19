import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RAPIER, type Physics } from '../engine/physics'
import { CONFIG, type VehicleMode } from './config'
import type { MovingPlatform } from './world'
import { tuning } from './tuning'

export type PlayerIntent = { moveX: number; moveY: number; sprint: boolean; jumpPressed: boolean; jumpHeld: boolean; dashPressed: boolean }
export type PlayerEvent = { type: 'jump' } | { type: 'land'; impact: number } | { type: 'dash' }

const UP = new THREE.Vector3(0, 1, 0)

/** A lightweight kinematic stunt car. Rapier handles the track collision; this class owns grip, lift, boost and presentation. */
export class Player {
  readonly root = new THREE.Group()
  readonly body: RAPIER.RigidBody
  readonly collider: RAPIER.Collider
  readonly velocity = new THREE.Vector3()
  readonly safe = new THREE.Vector3()
  grounded = false
  facing = 0
  mode: VehicleMode = 'performance'
  private readonly controller: RAPIER.KinematicCharacterController
  private readonly model = new THREE.Group()
  private readonly wheels: THREE.Mesh[] = []
  private readonly aero = new THREE.Group()
  private readonly thrusters = new THREE.Group()
  private readonly proceduralParts: THREE.Object3D[] = []
  private readonly shadow: THREE.Mesh
  private coyote = 0
  private dashTime = 0
  private dashCooldown = 0
  private safeTimer = 0
  private previousYVelocity = 0
  private wheelSpin = 0

  constructor(private readonly physics: Physics, spawn: THREE.Vector3, _movers: MovingPlatform[] = []) {
    const p = CONFIG.player
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z))
    this.collider = physics.world.createCollider(RAPIER.ColliderDesc.capsule(p.halfHeight, p.radius).setFriction(0.15), this.body)
    this.controller = physics.world.createCharacterController(0.03)
    this.controller.enableAutostep(0.55, 0.28, false)
    this.controller.enableSnapToGround(0.3)
    this.controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(48))
    this.controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(32))
    this.safe.copy(spawn)
    this.root.position.copy(spawn)
    this.buildModel()
    this.loadGeneratedBase()
    this.root.add(this.model)
    physics.bind(this.body, this.root)
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.9, 32),
      new THREE.MeshBasicMaterial({ color: '#020510', transparent: true, opacity: 0.42, depthWrite: false }),
    )
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.renderOrder = 1
  }

  get shadowMesh(): THREE.Mesh { return this.shadow }
  get position(): THREE.Vector3 { const t = this.body.translation(); return new THREE.Vector3(t.x, t.y, t.z) }
  get speed(): number { return Math.hypot(this.velocity.x, this.velocity.z) }
  get boosting(): boolean { return this.dashTime > 0 }
  get airborne(): boolean { return !this.grounded }

  setMode(mode: VehicleMode): void {
    this.mode = mode
    this.aero.visible = mode === 'performance'
    this.thrusters.visible = mode !== 'performance'
    const accent = mode === 'performance' ? '#7ef9ff' : mode === 'thrust' ? '#ffb347' : '#ff5cd6'
    this.model.traverse(obj => {
      const material = (obj as THREE.Mesh).material
      if (material && !Array.isArray(material) && (material as THREE.MeshStandardMaterial).userData?.accent) {
        ;(material as THREE.MeshStandardMaterial).color.set(accent)
        ;(material as THREE.MeshStandardMaterial).emissive?.set(accent)
      }
    })
  }

  step(dt: number, intent: PlayerIntent, cameraYaw: number, events: PlayerEvent[]): void {
    const stats = CONFIG.vehicle[this.mode]
    const forward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw))
    const right = new THREE.Vector3().crossVectors(forward, UP)
    const wish = new THREE.Vector3().addScaledVector(right, intent.moveX).addScaledVector(forward, intent.moveY)
    const wishLen = Math.min(1, wish.length())
    if (wishLen > 0.01) wish.normalize()

    this.coyote = this.grounded ? 0.14 : Math.max(0, this.coyote - dt)
    this.dashCooldown = Math.max(0, this.dashCooldown - dt)
    if (intent.dashPressed && this.dashCooldown <= 0) {
      tuning.activate('dash')
      const dir = wishLen > 0.01 ? wish : new THREE.Vector3(-Math.sin(this.facing), 0, -Math.cos(this.facing))
      this.facing = Math.atan2(-dir.x, -dir.z)
      const tunedBoost = this.mode === 'performance' ? CONFIG.player.dashSpeed : stats.boostSpeed
      this.velocity.x = dir.x * tunedBoost
      this.velocity.z = dir.z * tunedBoost
      this.dashTime = this.mode === 'performance' ? CONFIG.player.dashTime : stats.boostDuration
      this.dashCooldown = this.mode === 'performance' ? CONFIG.player.dashCooldown : stats.boostCooldown
      if (this.mode === 'rocket') this.velocity.y = Math.max(this.velocity.y, 7)
      events.push({ type: 'dash' })
    }

    const control = this.grounded ? 1 : stats.airControl
    const tunedTopSpeed = stats.topSpeed + (CONFIG.player.walkSpeed - 7)
    const targetSpeed = (intent.sprint ? tunedTopSpeed * 1.08 : tunedTopSpeed) * wishLen
    const target = wish.clone().multiplyScalar(targetSpeed)
    if (this.dashTime <= 0) {
      const horizontal = new THREE.Vector3(this.velocity.x, 0, this.velocity.z)
      horizontal.lerp(target, 1 - Math.exp(-stats.grip * control * dt))
      this.velocity.x = horizontal.x
      this.velocity.z = horizontal.z
    }

    if (wishLen > 0.08 && this.dashTime <= 0) {
      const targetYaw = Math.atan2(-wish.x, -wish.z)
      this.facing = dampAngle(this.facing, targetYaw, stats.steering, dt)
    }

    if (this.dashTime > 0) {
      this.dashTime = Math.max(0, this.dashTime - dt)
      if (this.mode !== 'performance') this.velocity.y += stats.thrusterLift * dt
    } else if (this.mode === 'rocket' && intent.jumpHeld) {
      this.velocity.y = Math.min(11, this.velocity.y + stats.thrusterLift * dt)
    }

    if (intent.jumpPressed && (this.coyote > 0 || this.mode !== 'performance')) {
      tuning.activate('jump')
      this.velocity.y = this.mode === 'rocket' ? 12 : this.mode === 'thrust' ? 10 : CONFIG.player.jumpSpeed
      this.grounded = false
      this.coyote = 0
      events.push({ type: 'jump' })
    }
    const gravity = this.mode === 'rocket' && intent.jumpHeld ? -6 : CONFIG.player.gravity
    this.velocity.y = Math.max(-34, this.velocity.y + gravity * dt)

    const desired = this.velocity.clone().multiplyScalar(dt)
    this.controller.computeColliderMovement(this.collider, desired)
    const moved = this.controller.computedMovement()
    const wasGrounded = this.grounded
    this.grounded = this.controller.computedGrounded()
    if (this.velocity.y > 0 && moved.y < desired.y - 1e-3) this.velocity.y = 0
    if (this.grounded) {
      if (!wasGrounded && this.previousYVelocity < -5) events.push({ type: 'land', impact: Math.min(1, -this.previousYVelocity / 24) })
      if (this.velocity.y < 0) this.velocity.y = -1
    }
    this.previousYVelocity = this.velocity.y

    const cur = this.body.translation()
    const next = { x: cur.x + moved.x, y: cur.y + moved.y, z: cur.z + moved.z }
    this.body.setNextKinematicTranslation(next)
    if (this.grounded) {
      this.safeTimer += dt
      if (this.safeTimer > 0.5) this.safe.set(next.x, next.y + 0.3, next.z)
    } else this.safeTimer = 0
  }

  teleport(to: THREE.Vector3): void {
    this.body.setTranslation(to, true)
    this.body.setNextKinematicTranslation(to)
    this.velocity.set(0, 0, 0)
    this.root.position.copy(to)
    this.physics.snap(this.body)
  }

  animate(frameSeconds: number, time: number, invulnerable: boolean, ground: number | null): void {
    this.model.rotation.y = this.facing
    this.model.rotation.x = THREE.MathUtils.damp(this.model.rotation.x, THREE.MathUtils.clamp(-this.velocity.y / 65, -0.18, 0.18), 8, frameSeconds)
    this.wheelSpin += this.speed * frameSeconds * 1.4
    for (const wheel of this.wheels) wheel.rotation.x = this.wheelSpin
    this.model.visible = !invulnerable || Math.floor(time * 18) % 2 === 0
    const pulse = 1 + Math.sin(time * 10) * 0.08
    this.thrusters.scale.setScalar(this.boosting ? pulse : 1)
    if (ground === null) this.shadow.visible = false
    else {
      const height = Math.max(0, this.root.position.y - 0.6 - ground)
      const k = THREE.MathUtils.clamp(1 - height / 18, 0.18, 1)
      this.shadow.visible = height < 18
      this.shadow.position.set(this.root.position.x, ground + 0.04, this.root.position.z)
      this.shadow.scale.setScalar(k)
      ;(this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.44 * k
    }
  }

  private buildModel(): void {
    const shell = new THREE.MeshStandardMaterial({ color: '#dce9f4', metalness: 0.82, roughness: 0.2 })
    const glass = new THREE.MeshPhysicalMaterial({ color: '#0b1628', metalness: 0.2, roughness: 0.1, transmission: 0.25, transparent: true, opacity: 0.9 })
    const dark = new THREE.MeshStandardMaterial({ color: '#050914', metalness: 0.75, roughness: 0.22 })
    const accent = new THREE.MeshStandardMaterial({ color: '#7ef9ff', emissive: '#7ef9ff', emissiveIntensity: 2.6, toneMapped: false })
    accent.userData.accent = true

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 4.6), shell)
    body.scale.set(1, 1, 0.92)
    body.position.y = 0.52
    body.castShadow = true
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.18, 1.55, 6), shell)
    nose.rotation.x = Math.PI / 2
    nose.scale.y = 1.55
    nose.position.set(0, 0.52, -2.42)
    nose.castShadow = true
    const canopy = new THREE.Mesh(new THREE.CapsuleGeometry(0.82, 1.22, 6, 16), glass)
    canopy.rotation.y = Math.PI / 2
    canopy.scale.set(1, 0.55, 1.35)
    canopy.position.set(0, 0.98, 0.15)
    canopy.castShadow = true
    const belt = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.08, 1.7), dark)
    belt.position.set(0, 0.72, 0.1)

    for (const x of [-1.23, 1.23]) for (const z of [-1.45, 1.45]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.22, 20), dark)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(x, 0.42, z)
      wheel.castShadow = true
      this.wheels.push(wheel)
      this.model.add(wheel)
    }
    const light = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.08), accent)
    light.position.set(0, 0.61, -3.13)
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.08), accent)
    tail.position.set(0, 0.65, 2.24)

    const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 1.25), accent)
    const wingR = wingL.clone()
    wingL.position.set(-1.27, 0.78, 0.05)
    wingR.position.set(1.27, 0.78, 0.05)
    this.aero.add(wingL, wingR)
    this.aero.position.y = 0.1

    for (const [x, z] of [[-1.18, 1.86], [1.18, 1.86], [-1.18, -1.92], [1.18, -1.92]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.055, 8, 18), accent)
      ring.rotation.x = Math.PI / 2
      ring.position.set(x, 0.52, z)
      this.thrusters.add(ring)
    }
    this.thrusters.visible = false

    this.model.add(body, nose, canopy, belt, light, tail, this.aero, this.thrusters)
    this.proceduralParts.push(body, nose, canopy, belt, light, tail, ...this.wheels)
    this.setMode('performance')
  }

  private loadGeneratedBase(): void {
    if (typeof window === 'undefined') return
    const loader = new GLTFLoader()
    loader.load('/models/roadster-base.glb', gltf => {
      const base = gltf.scene
      const bounds = new THREE.Box3().setFromObject(base)
      const size = bounds.getSize(new THREE.Vector3())
      const scale = 4.7 / Math.max(size.x, size.z, 0.01)
      base.scale.setScalar(scale)
      base.rotation.y = Math.PI
      const fitted = new THREE.Box3().setFromObject(base)
      base.position.y = 0.4 - fitted.min.y
      base.traverse(obj => {
        const mesh = obj as THREE.Mesh
        mesh.castShadow = true
        mesh.receiveShadow = true
      })
      for (const part of this.proceduralParts) part.visible = false
      this.model.add(base)
    }, undefined, () => undefined)
  }
}

function dampAngle(from: number, to: number, lambda: number, dt: number): number {
  let delta = (to - from) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return from + delta * (1 - Math.exp(-lambda * dt))
}
