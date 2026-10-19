import type { Audio } from '../engine/audio'
import type { I18n } from '../engine/i18n'
import type { Input } from '../engine/input'
import { insertScore, type Locale, type Quality, type SaveData, type SaveStore } from '../engine/save'
import { CONFIG, type VehicleMode } from '../game/config'
import type { Compass, Hint } from '../game/game'
import { formatClock, stars, type RunState } from '../game/rules'

export type Screen = 'boot' | 'title' | 'hud' | 'pause' | 'settings' | 'leaderboard' | 'results'
export type UiActions = {
  play(): void
  resume(): void
  restart(): void
  quit(): void
  selectMode(mode: VehicleMode): void
  settings(patch: Partial<SaveData>): void
}

const GLYPH = {
  keyboard: { move: '<kbd>WASD</kbd>', jump: '<kbd>Space</kbd>', boost: '<kbd>F</kbd>', select: '<kbd>Enter</kbd>', back: '<kbd>Esc</kbd>' },
  gamepad: { move: '<kbd class="round">L</kbd>', jump: '<kbd class="round a">A</kbd>', boost: '<kbd class="round x">X</kbd>', select: '<kbd class="round a">A</kbd>', back: '<kbd class="round b">B</kbd>' },
}

export class Ui {
  screen: Screen = 'boot'
  vehicleMode: VehicleMode = 'performance'
  private readonly root: HTMLElement
  private readonly stack: Screen[] = []
  private lastRun?: RunState
  private navRepeat = 0

  constructor(private readonly i18n: I18n, private readonly save: SaveStore, private readonly audio: Audio, private readonly input: Input, private readonly actions: UiActions) {
    this.root = document.getElementById('ui')!
    this.root.innerHTML = this.template()
    this.root.addEventListener('click', e => this.onClick(e))
    this.root.addEventListener('input', e => this.onInput(e))
    window.addEventListener('keydown', e => { if (e.code === 'Escape' && !e.repeat && this.screen !== 'title') this.back() })
    window.addEventListener('game:mode', e => this.selectMode((e as CustomEvent<VehicleMode>).detail))
    i18n.onChange(() => this.translate())
    this.translate()
    this.refreshSettings()
  }

  show(screen: Screen): void { this.stack.length = 0; this.setScreen(screen) }
  push(screen: Screen): void { this.stack.push(this.screen); this.setScreen(screen) }
  back(): void { const prev = this.stack.pop(); if (prev) this.setScreen(prev); else if (this.screen === 'pause') this.actions.resume() }
  setBootProgress(progress: number): void { this.q<HTMLElement>('.boot-bar i').style.transform = `scaleX(${Math.max(0.04, Math.min(1, progress))})` }

  updateHud(run: RunState, compass: Compass | null): void {
    this.setText('score', run.score.toLocaleString(this.i18n.locale))
    this.setText('clock', formatClock(run.timeLeft))
    this.setText('checkpoints', `${run.collected}/${run.total}`)
    this.setText('speed', `${Math.round((run.speed ?? 0) * 13.2)} km/h`)
    this.setText('airtime', run.airborne ? 'AIRBORNE' : 'TRACKED')
    this.setText('boost', run.boostReady ? 'READY' : 'CHARGING')
    this.setText('mode', this.label(this.vehicleMode))
    const combo = this.q<HTMLElement>('.hud-combo')
    combo.classList.toggle('is-active', run.combo > 1)
    this.setText('combo', run.combo > 1 ? `×${run.combo}` : '')
    const compassEl = this.q<HTMLElement>('.hud-compass')
    compassEl.classList.toggle('is-hidden', !compass)
    if (compass) this.q<HTMLElement>('.hud-compass-arrow').style.transform = `rotate(${-compass.angle}rad)`
    for (const [i, life] of this.qa('.life').entries()) life.classList.toggle('is-empty', i >= run.lives)
  }

  popup(text: string, at: { x: number; y: number }, kind: 'score' | 'hurt'): void {
    const el = document.createElement('div')
    el.className = `popup popup-${kind}`
    el.textContent = text
    el.style.left = `${at.x}px`
    el.style.top = `${at.y}px`
    this.q('.popups').append(el)
    el.addEventListener('animationend', () => el.remove())
  }
  hurt(): void { const v = this.q('.hurt-vignette'); v.classList.remove('flash'); void v.clientWidth; v.classList.add('flash') }
  hint(hint: Hint | null): void {
    const el = this.q('.hint')
    if (!hint) { el.classList.remove('is-active'); return }
    const g = this.input.method === 'gamepad' ? GLYPH.gamepad : GLYPH.keyboard
    const copy = hint === 'move' ? `${g.move} ${this.i18n.t('hint.move')}` : hint === 'look' ? this.i18n.t('hint.look') : hint === 'jump' ? `${g.jump} ${this.i18n.t('hint.jump')}` : hint === 'dash' ? `${g.boost} ${this.i18n.t('hint.boost')}` : this.i18n.t('hint.checkpoints')
    el.querySelector('span')!.innerHTML = copy
    el.classList.add('is-active')
  }

  showResults(run: RunState): void {
    this.lastRun = run
    const won = run.phase === 'won'
    this.q<HTMLElement>('.results-title').textContent = won ? this.i18n.t('results.won') : run.loseReason === 'time' ? this.i18n.t('results.lost.time') : this.i18n.t('results.lost.lives')
    this.q('.results-mode').textContent = this.label(run.mode ?? this.vehicleMode)
    this.q('.results-score').textContent = run.score.toLocaleString(this.i18n.locale)
    this.q('.results-checkpoints').textContent = `${run.collected} / ${run.total}`
    this.q('.results-time').textContent = formatClock(run.elapsed)
    this.q('.results-stars').textContent = '◆'.repeat(stars(run)) + '◇'.repeat(3 - stars(run))
    this.q<HTMLInputElement>('.results-name').value = this.save.data.playerName
    this.show('results')
  }

  refreshSettings(): void {
    const d = this.save.data
    for (const name of ['musicVolume', 'sfxVolume', 'sensitivity']) this.q<HTMLInputElement>(`[name="${name}"]`).value = String(d[name as keyof SaveData])
    for (const t of this.qa<HTMLButtonElement>('.toggle')) { const on = d[t.dataset.setting as 'muted' | 'invertY' | 'reducedMotion'] === true; t.setAttribute('aria-pressed', String(on)); t.querySelector('span')!.textContent = on ? this.i18n.t('settings.on') : this.i18n.t('settings.off') }
    for (const b of this.qa<HTMLButtonElement>('.seg button')) { const key = b.parentElement!.dataset.setting as 'quality' | 'locale'; b.setAttribute('aria-pressed', String(b.dataset.value === (key === 'locale' ? this.i18n.locale : d.quality))) }
  }

  frame(dt: number): void {
    this.navRepeat = Math.max(0, this.navRepeat - dt)
    if (!this.root.querySelector('.screen.is-active [data-nav]:focus')) return
    if (this.input.consume('confirm')) (document.activeElement as HTMLElement)?.click()
  }

  private selectMode(mode: VehicleMode): void {
    this.vehicleMode = mode
    for (const card of this.qa<HTMLElement>('[data-mode]')) card.classList.toggle('is-selected', card.dataset.mode === mode)
    this.actions.selectMode(mode)
  }
  private onClick(e: MouseEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action], [data-mode], .toggle, .seg button')
    if (!target) return
    this.audio.unlock()
    if (target.dataset.mode) { this.selectMode(target.dataset.mode as VehicleMode); return }
    if (target.matches('.toggle')) { const key = target.dataset.setting as 'muted' | 'invertY' | 'reducedMotion'; this.actions.settings({ [key]: !this.save.data[key] }); this.refreshSettings(); return }
    if (target.matches('.seg button')) { const key = target.parentElement!.dataset.setting; if (key === 'quality') this.actions.settings({ quality: target.dataset.value as Quality }); if (key === 'locale') this.actions.settings({ locale: target.dataset.value as Locale }); this.refreshSettings(); return }
    switch (target.dataset.action) {
      case 'play': this.actions.play(); break
      case 'resume': this.actions.resume(); break
      case 'restart': this.actions.restart(); break
      case 'quit': this.actions.quit(); break
      case 'settings': this.push('settings'); break
      case 'leaderboard': this.push('leaderboard'); this.renderLeaderboard(); break
      case 'back': this.back(); break
      case 'save-score': this.saveScore(); break
      case 'pause': window.dispatchEvent(new CustomEvent('game:pause')); break
    }
  }
  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement
    if (!t.name) return
    const value = Number(t.value)
    this.actions.settings({ [t.name]: value } as Partial<SaveData>)
    t.style.setProperty('--fill', `${((value - Number(t.min)) / (Number(t.max) - Number(t.min))) * 100}%`)
  }
  private saveScore(): void {
    if (!this.lastRun || this.lastRun.unranked) return
    const name = this.q<HTMLInputElement>('.results-name').value.trim().slice(0, 16) || this.save.data.playerName
    const { board, rank } = insertScore(this.save.data.leaderboard, { name, score: this.lastRun.score, seconds: Math.round(this.lastRun.elapsed), at: Date.now() })
    this.save.update({ leaderboard: board, playerName: name }); this.q('.results-rank').textContent = rank >= 0 ? `#${rank + 1}` : ''; this.renderLeaderboard()
  }
  private renderLeaderboard(): void {
    const list = this.q('.board'); const board = this.save.data.leaderboard
    list.innerHTML = board.length ? board.map((e, i) => `<li><b>${i + 1}</b><span class="board-name"></span><span>${formatClock(e.seconds)}</span><em>${e.score.toLocaleString(this.i18n.locale)}</em></li>`).join('') : `<li class="board-empty">${this.i18n.t('leaderboard.empty')}</li>`
    list.querySelectorAll('.board-name').forEach((el, i) => (el.textContent = board[i].name))
  }
  private setScreen(screen: Screen): void {
    this.screen = screen
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-screen]')) { const active = el.dataset.screen === screen; el.classList.toggle('is-active', active); el.setAttribute('aria-hidden', String(!active)) }
    this.root.dataset.activeScreen = screen
    requestAnimationFrame(() => this.root.querySelector<HTMLElement>(`[data-screen="${screen}"] [data-nav]`)?.focus())
  }
  private translate(): void { for (const el of this.root.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = this.i18n.t(el.dataset.i18n!); document.documentElement.lang = this.i18n.locale; document.title = this.i18n.t('game.title'); this.refreshSettings() }
  private label(mode: VehicleMode): string { return this.i18n.t(`mode.${mode}`) }
  private setText(slot: string, text: string): void { const el = this.root.querySelector(`[data-slot="${slot}"]`); if (el && el.textContent !== text) el.textContent = text }
  private q<T extends HTMLElement = HTMLElement>(sel: string): T { return this.root.querySelector<T>(sel)! }
  private qa<T extends HTMLElement = HTMLElement>(sel: string): T[] { return [...this.root.querySelectorAll<T>(sel)] }

  private template(): string {
    const range = (name: string, label: string, min: number, max: number, step: number) => `<label class="row"><span data-i18n="${label}"></span><input data-nav type="range" name="${name}" min="${min}" max="${max}" step="${step}"></label>`
    const toggle = (setting: string, label: string) => `<div class="row"><span data-i18n="${label}"></span><button data-nav class="toggle" data-setting="${setting}" aria-pressed="false"><i></i><span></span></button></div>`
    const card = (mode: VehicleMode, title: string, copy: string, stat: string) => `<button data-nav data-mode="${mode}" class="mode-card ${mode === 'performance' ? 'is-selected' : ''}"><span class="mode-index">0${mode === 'performance' ? 1 : mode === 'thrust' ? 2 : 3}</span><strong data-i18n="${title}"></strong><small data-i18n="${copy}"></small><b data-i18n="${stat}"></b></button>`
    return `
<section class="screen screen-boot is-active" data-screen="boot"><div class="boot-mark">R/03</div><div class="boot-logo" data-i18n="game.title"></div><div class="boot-bar"><i></i></div><div class="boot-label" data-i18n="boot.loading"></div></section>
<section class="screen screen-title" data-screen="title"><div class="title-grid"></div><div class="title-block"><p class="eyebrow" data-i18n="game.eyebrow"></p><h1 class="logo-text" data-i18n="game.title"></h1><p class="tagline" data-i18n="game.tagline"></p><div class="mode-grid">${card('performance','mode.performance','mode.performance.copy','mode.performance.stat')}${card('thrust','mode.thrust','mode.thrust.copy','mode.thrust.stat')}${card('rocket','mode.rocket','mode.rocket.copy','mode.rocket.stat')}</div><nav class="menu menu-row"><button data-nav class="btn btn-primary" data-action="play"><span data-i18n="menu.drive"></span></button><button data-nav class="btn" data-action="leaderboard"><span data-i18n="menu.leaderboard"></span></button><button data-nav class="btn" data-action="settings"><span data-i18n="menu.settings"></span></button></nav></div><div class="title-foot"><span data-i18n="game.disclaimer"></span><span class="prompts"></span></div></section>
<section class="screen screen-hud" data-screen="hud"><div class="hurt-vignette"></div><div class="popups"></div><div class="hud-top"><div><span class="hud-label" data-i18n="hud.mode"></span><b data-slot="mode"></b></div><div><span class="hud-label" data-i18n="hud.checkpoints"></span><b data-slot="checkpoints"></b></div><div><span class="hud-label" data-i18n="hud.score"></span><b data-slot="score"></b></div><div><span class="hud-label" data-i18n="hud.time"></span><b data-slot="clock"></b></div></div><div class="hud-speed"><b data-slot="speed"></b><span data-slot="airtime"></span></div><div class="hud-bottom"><div class="hud-boost"><span data-i18n="hud.boost"></span><b data-slot="boost"></b></div><div class="hud-compass"><i class="hud-compass-arrow">⌄</i><span data-i18n="hud.next"></span></div><div class="hud-lives">${'<i class="life"></i>'.repeat(CONFIG.run.lives)}</div><button class="hud-pause" data-action="pause" data-i18n="touch.pause">Ⅱ</button></div><div class="hud-combo"><b data-slot="combo"></b><span data-i18n="hud.combo"></span></div><div class="hint"><span></span></div><div class="touch"><div class="touch-stick"><i></i></div><button class="touch-btn touch-dash" data-touch="dash"><span data-i18n="touch.boost"></span></button><button class="touch-btn touch-jump" data-touch="jump"><span data-i18n="touch.lift"></span></button></div></section>
<section class="screen screen-pause screen-modal" data-screen="pause"><div class="modal"><p class="eyebrow">R/03 // RUN CONTROL</p><h2 class="modal-title" data-i18n="pause.title"></h2><nav class="menu"><button data-nav class="btn btn-primary" data-action="resume"><span data-i18n="menu.continue"></span></button><button data-nav class="btn" data-action="restart"><span data-i18n="menu.restart"></span></button><button data-nav class="btn" data-action="settings"><span data-i18n="menu.settings"></span></button><button data-nav class="btn" data-action="quit"><span data-i18n="menu.quit"></span></button></nav></div></section>
<section class="screen screen-settings screen-modal" data-screen="settings"><div class="modal modal-wide"><p class="eyebrow">R/03 // CONFIG</p><h2 class="modal-title" data-i18n="settings.title"></h2><div class="settings-grid"><fieldset><legend data-i18n="settings.audio"></legend>${range('musicVolume','settings.music',0,1,0.05)}${range('sfxVolume','settings.sfx',0,1,0.05)}${toggle('muted','settings.mute')}</fieldset><fieldset><legend data-i18n="settings.controls"></legend>${range('sensitivity','settings.sensitivity',0.2,3,0.1)}${toggle('invertY','settings.invertY')}</fieldset><fieldset><legend data-i18n="settings.display"></legend><div class="row"><span data-i18n="settings.quality"></span><div class="seg" data-setting="quality"><button data-nav data-value="low" data-i18n="settings.quality.low"></button><button data-nav data-value="medium" data-i18n="settings.quality.medium"></button><button data-nav data-value="high" data-i18n="settings.quality.high"></button></div></div>${toggle('reducedMotion','settings.reducedMotion')}<div class="row"><span data-i18n="settings.language"></span><div class="seg" data-setting="locale"><button data-nav data-value="en">English</button><button data-nav data-value="zh-CN">简体中文</button></div></div></fieldset></div><button data-nav class="btn btn-small" data-action="back"><span data-i18n="menu.back"></span></button></div></section>
<section class="screen screen-leaderboard screen-modal" data-screen="leaderboard"><div class="modal"><p class="eyebrow">R/03 // RECORDS</p><h2 class="modal-title" data-i18n="leaderboard.title"></h2><div class="board-head"><b>#</b><span></span><span data-i18n="leaderboard.time"></span><em data-i18n="leaderboard.score"></em></div><ol class="board"></ol><button data-nav class="btn btn-small" data-action="back"><span data-i18n="menu.back"></span></button></div></section>
<section class="screen screen-results screen-modal" data-screen="results"><div class="modal"><p class="eyebrow">R/03 // RUN COMPLETE</p><div class="results-stars"></div><h2 class="results-title modal-title"></h2><p class="results-mode"></p><div class="results-grid"><span data-i18n="results.checkpoints"></span><b class="results-checkpoints"></b><span data-i18n="results.time"></span><b class="results-time"></b><span data-i18n="results.score"></span><b class="results-score"></b></div><div class="results-save"><input data-nav class="results-name" type="text" maxlength="16" autocomplete="off" spellcheck="false" data-i18n-placeholder="results.name"><button data-nav class="btn btn-small" data-action="save-score"><span data-i18n="results.save"></span></button><span class="results-rank"></span></div><nav class="menu menu-row"><button data-nav class="btn btn-primary" data-action="restart"><span data-i18n="results.retry"></span></button><button data-nav class="btn" data-action="quit"><span data-i18n="results.title"></span></button></nav></div></section>`
  }
}
