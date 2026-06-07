// src/io/gridServer.ts — tiny HTTP + WebSocket server for the web visualizer.
//
// Mirrors twistermapper's controlServer: serves one static index.html and speaks a
// JSON { path, args } protocol over WS so the browser and OSC share one vocabulary.
//   browser -> server : { path: "/grid/in/key", args: [x, y, s] }
//   server  -> browser: { path: "/grid/out/leds", args: [w, h, ...levels] }

import { createServer, IncomingMessage, ServerResponse } from "node:http"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { WebSocketServer, WebSocket } from "ws"

export interface GridServer {
	broadcast: (path: string, args: Array<number | string | boolean>) => void
	close: () => void
}

export interface GridServerOptions {
	port: number
	staticFile: string
	onMessage: (path: string, args: any[]) => void
	onConnect?: (send: (path: string, args: Array<number | string | boolean>) => void) => void
}

export function createGridServer(opts: GridServerOptions): GridServer {
	const { port, staticFile, onMessage, onConnect } = opts

	const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
		if (req.method !== "GET") {
			res.writeHead(405).end("Method Not Allowed")
			return
		}
		// favicon.png lives next to the static index; serve it as an image.
		if (req.url === "/favicon.png" || req.url === "/favicon.ico") {
			try {
				const png = readFileSync(join(dirname(staticFile), "favicon.png"))
				res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "max-age=86400" })
				res.end(png)
			} catch {
				res.writeHead(404).end("no favicon")
			}
			return
		}
		try {
			const html = readFileSync(staticFile)
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
			res.end(html)
		} catch (err) {
			res.writeHead(500).end("Failed to read UI file")
			console.error("[UI] could not read", staticFile, err)
		}
	})

	const wss = new WebSocketServer({ server: httpServer })

	wss.on("connection", (ws: WebSocket) => {
		onConnect?.((path, args) => {
			if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ path, args }))
		})
		ws.on("message", (data) => {
			let parsed: unknown
			try {
				parsed = JSON.parse(data.toString())
			} catch {
				return
			}
			if (typeof parsed === "object" && parsed !== null && typeof (parsed as any).path === "string") {
				const path = (parsed as any).path as string
				const args = Array.isArray((parsed as any).args) ? (parsed as any).args : []
				onMessage(path, args)
			}
		})
	})

	wss.on("error", (err) => console.error("[UI] WebSocket error:", err))
	httpServer.on("error", (err) => console.error("[UI] HTTP error:", err))
	httpServer.listen(port, () => console.log(`UI up: http://localhost:${port}`))

	return {
		broadcast(path, args) {
			const msg = JSON.stringify({ path, args })
			for (const client of wss.clients) {
				if (client.readyState === WebSocket.OPEN) client.send(msg)
			}
		},
		close() {
			try { wss.close() } catch {}
			try { httpServer.close() } catch {}
		},
	}
}
