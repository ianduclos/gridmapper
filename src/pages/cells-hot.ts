/* Cells Hot — six independent hocket cells for hotelier slot b.
 *
 * Rows 0–5 select one of each role's three source-bank cells (cols 1–3), mute its
 * voice (col 4), or move only that voice's phase by -/+ one pulse (cols 5/6).
 * Bottom: col 1 starts the selected pulse rate, col 2 stops, cols 4–6 select one of
 * three starting ensembles.  It emits exactly one JSON string per /cells packet.
 */
import { type KeyEvent, type LedFrame, type Page, type PageContext, makeFrame, ledIndex } from "../core/types.js"
import type { PageModule, SettingSpec } from "../core/pageModule.js"
import { bool, int, isRecord, num } from "../util/restoreGuards.js"
import { drawSelector, selectorKey } from "../util/pageSelector.js"

export const PULSE_RATE = 12 / 1.66
const BUFFER_MS = 100
const VOICES = 6
const DEFAULT_ROOT_HZ = 55
const ROLES = ["ground", "knock", "low", "high", "reply", "splinter"] as const
type Event = { at: number; dur: number; gain: number; cents?: number }
type Cell = { id: string; length: number; events: Event[] }
const c = (id: string, length: number, events: Event[]): Cell => ({ id, length, events })
// The 18 cells are the paired horn-hocket starter bank, carried here so a deployed
// Gridmapper has no cross-project runtime file dependency.
const BANK: Cell[][] = [
	[c("ground-root",12,[{at:1.5,dur:1.7,gain:.92}]),c("ground-pair",24,[{at:1.5,dur:1.7,gain:.92},{at:13.5,dur:1.7,gain:.92},{at:20.5,dur:.9,gain:.48}]),c("ground-space",48,[{at:1.5,dur:2.5,gain:.9},{at:13.5,dur:2.5,gain:.9},{at:25.5,dur:2.5,gain:.9}])],
	[c("knock-offbeat",12,[{at:3,dur:.6,gain:.65},{at:10.5,dur:.5,gain:.48}]),c("knock-answer",24,[{at:3,dur:.6,gain:.65},{at:15,dur:.6,gain:.65},{at:22,dur:.5,gain:.5}]),c("knock-gap",12,[{at:3,dur:.6,gain:.65}])],
	[c("low-seed",12,[{at:.571084,dur:3.715663,gain:.75},{at:7.575904,dur:1.640964,gain:.62}]),c("low-held",24,[{at:.571084,dur:5,gain:.75},{at:12.571084,dur:3.7,gain:.72},{at:19.575904,dur:1.64,gain:.52}]),c("low-space",24,[{at:.571084,dur:3.715663,gain:.75},{at:12.571084,dur:3.715663,gain:.75},{at:19.575904,dur:1.640964,gain:.62}])],
	[c("high-seed",12,[{at:.354217,dur:1.460241,gain:.75},{at:7.474699,dur:1.387952,gain:.62}]),c("high-sparse",24,[{at:.354217,dur:1.46,gain:.75},{at:7.474699,dur:1.388,gain:.62},{at:19.474699,dur:1.388,gain:.62}]),c("high-turn",48,[{at:.354217,dur:1.46,gain:.7},{at:7.474699,dur:1.46,gain:.7},{at:12.354217,dur:1.46,gain:.7},{at:24.354217,dur:1.46,gain:.7},{at:31.474699,dur:1.46,gain:.7},{at:43.474699,dur:1.46,gain:.7}])],
	[c("reply-seed",12,[{at:4.279518,dur:3.079518,gain:.75},{at:9.426506,dur:2.428916,gain:.62}]),c("reply-late",24,[{at:4.279518,dur:3.08,gain:.75},{at:9.426506,dur:2.43,gain:.62},{at:17.279518,dur:2.7,gain:.75},{at:21.426506,dur:2,gain:.55}]),c("reply-arc",48,[{at:4.28,dur:3.08,gain:.75},{at:9.43,dur:2.43,gain:.6},{at:16.28,dur:3.08,gain:.75},{at:29.28,dur:2.7,gain:.7},{at:33.43,dur:2,gain:.55},{at:40.28,dur:3.08,gain:.75}])],
	[c("splinter-sparse",48,[{at:17.3,dur:.65,gain:.45},{at:41.8,dur:.65,gain:.45}]),c("splinter-pair",48,[{at:17.3,dur:.65,gain:.45},{at:18.4,dur:.5,gain:.32,cents:43},{at:41.8,dur:.65,gain:.45},{at:43,dur:.5,gain:.3,cents:-61}]),c("splinter-return",48,[{at:5.3,dur:.65,gain:.35},{at:29.3,dur:.65,gain:.4,cents:-91},{at:41.8,dur:.65,gain:.45},{at:46.2,dur:.5,gain:.3,cents:43}])],
]
const ENSEMBLES = [[0,0,0,0,0,0],[1,1,1,1,1,1],[2,2,2,2,2,2]]

export const settings: SettingSpec[] = [
	{ key: "tuningHz", label: "Tuning", type: "number", min: 400, max: 480, step: 1, default: 432 },
	{ key: "rootHz", label: "Root Hz", type: "number", min: 20, max: 440, step: .1, default: DEFAULT_ROOT_HZ },
	{ key: "lane", label: "Clock lane", type: "number", min: 0, max: 3, step: 1, default: 0 },
	{ key: "humanizeMs", label: "Humanize ms", type: "number", min: 0, max: 4, step: 1, default: 4 },
]
export class CellsHotPage implements Page {
	private selected = new Array(VOICES).fill(0); private muted = new Array(VOICES).fill(false)
	private phase = new Array(VOICES).fill(0); private tuningHz = 432; private rootHz = DEFAULT_ROOT_HZ; private lane = 0; private humanizeMs = 4
	private pulse = 0; private running = false; private session = ""; private serial = 0
	init(ctx: PageContext) { this.announce(ctx) }
	onFocus(ctx: PageContext) { this.announce(ctx) }
	onBlur(_ctx: PageContext) {}
	dispose(ctx: PageContext) { if (this.running) this.stop(ctx) }
	onClock(state: Readonly<PageContext["clock"]>, ctx: PageContext) { if (state.running && !this.running) this.start(ctx); if (!state.running && this.running) this.stop(ctx) }
	onTick(tick: number, lane: number, ctx: PageContext) { if (lane !== this.lane || !this.running) return; this.pulse = tick; const now=Date.now(); this.emit(ctx, { type: "sync", now, periodMs: 1000 / PULSE_RATE, humanizeMs: this.humanizeMs, events: this.events(now + BUFFER_MS, tick, 1) }) }
	onKey(ev: KeyEvent, ctx: PageContext) {
		if (selectorKey(ev, ctx)) return
		if (!ev.s) return
		if (ev.y < VOICES) {
			if (ev.x >= 1 && ev.x <= 3) { this.selected[ev.y] = ev.x - 1; this.replace(ctx, ev.y) }
			else if (ev.x === 4) { this.muted[ev.y] = !this.muted[ev.y]; this.replace(ctx, ev.y) }
			else if (ev.x === 5 || ev.x === 6) { this.phase[ev.y] += ev.x === 5 ? -1 : 1; this.replace(ctx, ev.y) }
			ctx.setDirty(); return
		}
		if (ev.y === 7 && ev.x === 1) { ctx.clockControl?.setRate(PULSE_RATE); this.start(ctx); ctx.clockControl?.start() }
		if (ev.y === 7 && ev.x === 2) { ctx.clockControl?.stop(); this.stop(ctx) }
		if (ev.y === 7 && ev.x >= 4 && ev.x <= 6) { this.selected = [...ENSEMBLES[ev.x - 4]]; for (let v=0;v<VOICES;v++) this.replace(ctx,v); ctx.setDirty() }
	}
	onOsc(path: string, args: any[], ctx: PageContext) { const m=/^\/setting\/(tuningHz|rootHz|lane|humanizeMs)$/.exec(path); if (!m) return; const key=m[1]; if(key==="tuningHz")this.tuningHz=num(args[0],this.tuningHz,400,480); if(key==="rootHz")this.rootHz=num(args[0],this.rootHz,20,440); if(key==="lane")this.lane=int(args[0],this.lane,0,3); if(key==="humanizeMs")this.humanizeMs=int(args[0],this.humanizeMs,0,4); this.announce(ctx) }
	render(ctx: PageContext): LedFrame { const f=makeFrame(ctx.size); drawSelector(f,ctx); for(let y=0;y<VOICES;y++){ for(let x=1;x<=3;x++)f[ledIndex(ctx.size,x,y)]=this.selected[y]===x-1?12:2; f[ledIndex(ctx.size,4,y)]=this.muted[y]?3:8; f[ledIndex(ctx.size,5,y)]=2; f[ledIndex(ctx.size,6,y)]=2 } f[ledIndex(ctx.size,1,7)]=this.running?15:5; f[ledIndex(ctx.size,2,7)]=this.running?5:2; for(let x=4;x<=6;x++)f[ledIndex(ctx.size,x,7)]=6; return f }
	serialize() { return { selected:[...this.selected], muted:[...this.muted], phase:[...this.phase], tuningHz:this.tuningHz,rootHz:this.rootHz,lane:this.lane,humanizeMs:this.humanizeMs } }
	restore(raw: unknown, ctx: PageContext) { if(!isRecord(raw))return; this.selected=this.selected.map((d,i)=>int((raw.selected as any)?.[i],d,0,2)); this.muted=this.muted.map((d,i)=>bool((raw.muted as any)?.[i],d)); this.phase=this.phase.map((d,i)=>int((raw.phase as any)?.[i],d,-96,96)); this.tuningHz=num(raw.tuningHz,this.tuningHz,400,480); this.rootHz=num(raw.rootHz,this.rootHz,20,440); this.lane=int(raw.lane,this.lane,0,3); this.humanizeMs=int(raw.humanizeMs,this.humanizeMs,0,4); this.announce(ctx) }
	private announce(ctx: PageContext) { ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/type`,"cells-hot") }
	private start(ctx: PageContext) { if(this.running)return; this.running=true; this.session=`cells-${Date.now()}-${++this.serial}`; this.emit(ctx,{type:"start",session:this.session}) }
	private stop(ctx: PageContext) { if(!this.running)return; this.emit(ctx,{type:"stop",session:this.session}); this.running=false }
	private replace(ctx: PageContext, voice: number) { if(!this.running)return; const cutoffMs=Date.now()+BUFFER_MS; this.emit(ctx,{type:"replace",session:this.session,voice:voice+1,cutoffMs,events:this.muted[voice]?[]:this.events(cutoffMs,this.pulse,2,voice)}) }
	private events(baseMs:number, pulse:number, span:number, only?:number) { const out:any[]=[]; const period=1000/PULSE_RATE; for(let v=0;v<VOICES;v++){ if(only!==undefined&&v!==only||this.muted[v])continue; const cell=BANK[v][this.selected[v]]; for(const e of cell.events){ let p=e.at+this.phase[v]; while(p<pulse)p+=cell.length; while(p>=pulse+span)p-=cell.length; if(p>=pulse&&p<pulse+span){ const onsetMs=Math.max(baseMs,baseMs+(p-pulse)*period+this.jitter(v,p)); const hz=this.rootHz*(this.tuningHz/432)*Math.pow(2,(e.cents??0)/1200); out.push({id:`${this.session}-${v+1}-${Math.round(p*1000)}`,voice:v+1,hz,gain:e.gain,onsetMs,durationMs:e.dur*period}) } } } return out }
	private jitter(v:number,p:number) { if(!this.humanizeMs)return 0; return (((v+1)*73+Math.round(p*1000)*19)%((this.humanizeMs*2)+1))-this.humanizeMs }
	private emit(ctx: PageContext, payload: Record<string,unknown>) { ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/cells`,JSON.stringify(payload)) }
}
export const page: PageModule = { name:"cells-hot", label:"Cells Hot", settings, create:()=>new CellsHotPage() }
