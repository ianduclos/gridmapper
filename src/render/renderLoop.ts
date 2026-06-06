/* Render loop: a fixed-rate clock that drives LED output — the SINGLE output path.
 *
 * Same idea as twistermapper: tick at a fixed rate and push the *current* desired
 * frame once per frame. The reconciler diffs, so an unchanged frame sends nothing;
 * because it keeps a last-sent cache and recomputes from the latest desired each
 * push, the loop is its own self-drain. Only LED output is frame-gated here — OSC
 * out still happens immediately inside pages.
 *
 * serialosc is far more forgiving than the Twister firmware, so we batch per quadrant
 * instead of rate-limiting bursts. The grid's serialosc redraw default is 60fps; we
 * run a hair under it (FRAME_FPS) so we never out-run the device's refresh cadence.
 */

/** App-wide loop rate: just under the grid's 60fps serialosc redraw default. */
export const FRAME_FPS = 58

export interface RenderLoop {
	start(): void
	stop(): void
	readonly running: boolean
	readonly intervalMs: number
}

export interface RenderLoopOptions {
	/** Target frames per second (clamped to 1..120). Default FRAME_FPS (58). */
	fps?: number
	/** Called once per frame while running. */
	onFrame: () => void
}

export function createRenderLoop(opts: RenderLoopOptions): RenderLoop {
	const fps = clampFps(opts.fps ?? FRAME_FPS)
	const intervalMs = 1000 / fps
	let timer: ReturnType<typeof setInterval> | null = null

	return {
		start() {
			if (timer) return
			timer = setInterval(() => {
				try {
					opts.onFrame()
				} catch (err) {
					console.error("[RenderLoop] frame error:", err)
				}
			}, intervalMs)
		},
		stop() {
			if (!timer) return
			clearInterval(timer)
			timer = null
		},
		get running() {
			return timer !== null
		},
		get intervalMs() {
			return intervalMs
		},
	}
}

function clampFps(fps: number): number {
	if (!Number.isFinite(fps) || fps <= 0) return FRAME_FPS
	return Math.max(1, Math.min(120, fps))
}
