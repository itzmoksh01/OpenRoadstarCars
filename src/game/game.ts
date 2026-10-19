import * as THREE from 'three'
import type { Audio } from '../engine/audio'
import type { Input } from '../engine/input'
import { Physics, RAPIER } from '../engine/physics'
import type { Renderer } from '../engine/renderer'
import type { Quality } from '../engine/save'
import { FollowCamera } from './camera'
import { Collectibles } from './collectibles'
import { CONFIG, type VehicleMode } from './config'
import { Effects } from './fx'
import { Player, type PlayerEvent } from './player'
import { collect, createRun, damage, tick, type RunState } from './rules'
import { World } from './world'

export type Mode = 'attract' | 'playing' | 'paused' | 'ended'
export type Hint = 'move' | 'look' | 'jump' | 'dash' | 'cores'
export type Compass = { angle: number; distance: number; rise: number }
export type GameHooks = {
  popup(text: string, screen: { x: number; y: number }, kind: 'score' | 'hurt'): void
  hurt(): void
  hint(hint: Hint | null): void
  tutorialDone(): void
  end(run: RunState): void
}

export class Game {
  mode: Mode = 'attract'
  run: RunState
  reducedMotion = false
  vehicleMode: VehicleMode = 'performance'
  private readonly physics: Physics
  private readonly world: World
  private readonly player: Player
  private readonly cam: FollowCamera
  private readonly cores: Collectibles
  private readonly fx = new Effects()
  private simTime = 0
  private time = 0
  private tutorial: Hint | null = null
  private tutorialStart = new THREE.Vector3()
  private readonly down = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly audio: Audio,
    private readonly hooks: GameHooks,
  ) {
    this.physics = new Physics(CONFIG.player.gravity)
    this.world = new World(this.physics, renderer.shadowMapSize)
    this.player = new Player(this.physics, this.world.spawn)
    this.cam = new FollowCamera(this.physics, this.player.collider)
    this.cores = new Collectibles(this.world.coreSpots)
    this.world.scene.add(this.player.root, this.player.shadowMesh, this.cores.group, this.fx.mesh)
    this.run = createRun(this.cores.total)
    this.cam.reset(this.world.spawn, 0)
  }

  get camera(): THREE.PerspectiveCamera { return this.cam.camera }

  setVehicleMode(mode: VehicleMode): void {
    this.vehicleMode = mode
    this.player.setMode(mode)
  }

  start(tutorial: boolean): void {
    this.cores.reset()
    this.fx.clear()
    this.player.setMode(this.vehicleMode)
    this.player.teleport(this.world.spawn)
    this.player.facing = 0
    this.cam.pitch = 0.3
    this.cam.reset(this.world.spawn, 0)
    this.run = { ...createRun(this.cores.total), mode: this.vehicleMode }
    this.mode = 'playing'
    this.input.endFrame()
    this.input.takeLook()
    this.tutorial = tutorial ? 'move' : null
    this.tutorialStart.copy(this.world.spawn)
    this.hooks.hint(this.tutorial)
  }

  pause(): void { if (this.mode === 'playing') this.mode = 'paused' }
  resume(): void {
    if (this.mode !== 'paused') return
    this.mode = 'playing'
    this.input.endFrame()
    this.input.takeLook()
  }
  toTitle(): void { this.mode = 'attract'; this.hooks.hint(null) }

  setQuality(quality: Quality): void {
    this.renderer.applyQuality(quality)
    const shadow = this.world.sun.shadow
    shadow.map?.dispose()
    shadow.map = null
    shadow.mapSize.set(this.renderer.shadowMapSize, this.renderer.shadowMapSize)
    this.world.scene.traverse(obj => {
      const material = (obj as THREE.Mesh).material
      for (const m of Array.isArray(material) ? material : material ? [material] : []) m.needsUpdate = true
    })
  }

  step(dt: number): void {
    this.simTime += dt
    const jumpPressed = this.input.consume('jump')
    const dashPressed = this.input.consume('dash')
    const playing = this.mode === 'playing'
    const events: PlayerEvent[] = []
    this.world.stepMovers(this.simTime)
    if (playing) {
      this.player.step(dt, {
        moveX: this.input.move.x,
        moveY: this.input.move.y,
        sprint: this.input.held('sprint'),
        jumpPressed,
        jumpHeld: this.input.held('jump'),
        dashPressed,
      }, this.cam.yaw, events)
    }
    this.physics.step(dt)
    if (!playing) return

    this.run = { ...this.run, speed: this.player.speed, airborne: this.player.airborne, boostReady: this.player.boosting ? 0 : 1 }
    const pos = this.player.position
    for (const e of events) this.onPlayerEvent(e, pos)
    for (const at of this.cores.collect(pos, CONFIG.player.radius + 1.05)) {
      const result = collect(this.run)
      this.run = { ...result.state, mode: this.vehicleMode }
      this.audio.play('pickup')
      this.fx.burst(at, this.vehicleMode === 'rocket' ? '#ff5cd6' : this.vehicleMode === 'thrust' ? '#ffb347' : '#61f6ff', 30, 8)
      const combo = this.run.combo > 1 ? ` ×${this.run.combo}` : ''
      this.hooks.popup(`CHECKPOINT +${result.points}${combo}`, this.project(at), 'score')
    }

    if (pos.y < CONFIG.run.killY) {
      const result = damage(this.run, true)
      this.run = result.state
      this.onHurt(pos)
      if (this.run.phase === 'playing') this.player.teleport(this.player.safe)
    }
    this.run = tick(this.run, dt)
    this.updateTutorial(pos)
    if (this.run.phase !== 'playing') {
      this.mode = 'ended'
      this.hooks.hint(null)
      this.audio.play(this.run.phase === 'won' ? 'win' : 'lose')
      if (this.run.phase === 'won') this.fx.burst(pos.clone().setY(pos.y + 1), '#61f6ff', 80, 12)
      this.hooks.end(this.run)
    }
  }

  render(alpha: number, frameSeconds: number): void {
    this.time += frameSeconds
    this.physics.sync(alpha)
    const target = this.player.root.position
    if (this.mode === 'attract') {
      const t = this.time * 0.08
      const cam = this.cam.camera
      cam.position.set(Math.sin(t) * 46, 22 + Math.sin(this.time * 0.3) * 2, Math.cos(t) * 46)
      cam.lookAt(0, 0.5, 0)
    } else {
      const look = this.mode === 'playing' ? this.input.takeLook() : { x: 0, y: 0 }
      this.cam.update(target, look, frameSeconds, false, this.reducedMotion)
    }
    this.player.animate(frameSeconds, this.time, this.run.invulnerable > 0 && this.mode === 'playing', this.groundBelow(target))
    this.cores.animate(frameSeconds)
    this.fx.update(frameSeconds)
    this.world.update(frameSeconds, target)
    this.renderer.render(this.world.scene, this.cam.camera)
  }

  compass(): Compass | null {
    const pos = this.player.root.position
    let best: THREE.Vector3 | undefined
    let bestD = Infinity
    for (const c of this.cores.remaining()) {
      const d = c.distanceToSquared(pos)
      if (d < bestD) { bestD = d; best = c }
    }
    if (!best) return null
    const toCore = Math.atan2(-(best.x - pos.x), -(best.z - pos.z))
    let angle = toCore - this.cam.yaw
    angle = Math.atan2(Math.sin(angle), Math.cos(angle))
    return { angle, distance: Math.sqrt(bestD), rise: best.y - pos.y }
  }

  project(world: THREE.Vector3): { x: number; y: number } {
    const v = world.clone().project(this.cam.camera)
    return { x: ((v.x + 1) / 2) * this.renderer.canvas.clientWidth, y: ((1 - v.y) / 2) * this.renderer.canvas.clientHeight }
  }

  private onPlayerEvent(e: PlayerEvent, pos: THREE.Vector3): void {
    if (e.type === 'jump') {
      this.audio.play('jump')
      this.fx.puff(pos.clone().setY(pos.y - 0.35), this.vehicleMode === 'rocket' ? 2 : 1)
      if (this.tutorial === 'jump') this.advanceTutorial('dash')
    } else if (e.type === 'land') {
      this.audio.play('land')
      this.fx.puff(pos.clone().setY(pos.y - 0.4), e.impact + 0.4)
      if (e.impact > 0.5) this.cam.addShake(e.impact * 0.55)
    } else {
      this.audio.play('dash')
      const color = this.vehicleMode === 'rocket' ? '#ff5cd6' : this.vehicleMode === 'thrust' ? '#ffb347' : '#61f6ff'
      this.fx.burst(pos, color, 18, 4)
      if (this.tutorial === 'dash') this.advanceTutorial('cores')
    }
  }

  private onHurt(pos: THREE.Vector3): void {
    this.audio.play('hurt')
    this.cam.addShake(0.8)
    this.fx.burst(pos, '#ff315d', 36, 8)
    this.hooks.hurt()
    this.hooks.popup('-1 LIFE', this.project(pos.clone().setY(pos.y + 1)), 'hurt')
  }
  private updateTutorial(pos: THREE.Vector3): void {
    if (this.tutorial === 'move' && pos.distanceTo(this.tutorialStart) > 3) this.advanceTutorial(this.input.method === 'touch' ? 'jump' : 'look')
  }
  private advanceTutorial(next: Hint | null): void { this.tutorial = next; this.hooks.hint(next) }
  private groundBelow(p: THREE.Vector3): number | null {
    this.down.origin = { x: p.x, y: p.y, z: p.z }
    const hit = this.physics.world.castRay(this.down, 30, true, undefined, undefined, this.player.collider)
    return hit ? p.y - hit.timeOfImpact : null
  }
}
