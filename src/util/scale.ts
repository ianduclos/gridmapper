export const clamp = (n: number, lo: number, hi: number) =>
	Math.max(lo, Math.min(hi, n))

/** Round + clamp to the grid's varibright LED range (0..15). */
export const toLevel = (n: number) => clamp(Math.round(n), 0, 15)

export const toFixedN = (x: number, dp = 5) => Number(x.toFixed(dp))
