// src/util/perlin.ts — Ken Perlin's improved 3D gradient noise, dependency-free.
//
// noise3(x, y, z) returns a smooth value in roughly [-1, 1]. We use z as a slow time
// axis to get an evolving 2D field. The permutation table is built once from a seeded
// PRNG so we don't paste 256 magic numbers (deterministic across runs).

const p = new Uint8Array(512)
;(function initPermutation(seed = 1337) {
	const src = Array.from({ length: 256 }, (_v, i) => i)
	let s = seed >>> 0
	const rand = () => {
		s = (s * 1664525 + 1013904223) >>> 0
		return s / 4294967296
	}
	for (let i = 255; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1))
		;[src[i], src[j]] = [src[j], src[i]]
	}
	for (let i = 0; i < 512; i++) p[i] = src[i & 255]
})()

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (t: number, a: number, b: number) => a + t * (b - a)

function grad(hash: number, x: number, y: number, z: number): number {
	const h = hash & 15
	const u = h < 8 ? x : y
	const v = h < 4 ? y : h === 12 || h === 14 ? x : z
	return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
}

export function noise3(x: number, y: number, z: number): number {
	const X = Math.floor(x) & 255
	const Y = Math.floor(y) & 255
	const Z = Math.floor(z) & 255
	x -= Math.floor(x)
	y -= Math.floor(y)
	z -= Math.floor(z)
	const u = fade(x)
	const v = fade(y)
	const w = fade(z)
	const A = p[X] + Y
	const AA = p[A] + Z
	const AB = p[A + 1] + Z
	const B = p[X + 1] + Y
	const BA = p[B] + Z
	const BB = p[B + 1] + Z
	return lerp(
		w,
		lerp(
			v,
			lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)),
			lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z))
		),
		lerp(
			v,
			lerp(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)),
			lerp(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1))
		)
	)
}
