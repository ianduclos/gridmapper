# Nyamaropa (mbira dzavadzimu): research dossier

Status: **drafted, not registered.** `src/data/cells-nyamaropa.ts` exports
`nyamaropaWorld` (id `mbira-nyamaropa`) and the raw tablature. It is not wired into
`cells-hot-worlds.ts`. Verdict at the end.

## 1. Sources

### Accessed and read (the bank rests on this)

**B. Michael Williams, "Getting Started with Mbira dzaVadzimu", *Percussive Notes*,
August 1997, pp.38–49.** Author-hosted PDF:
<https://bmichaelwilliams.com/wp-content/uploads/2013/02/PNGettingStartedMbira.pdf>
(16 PDF pages; PDF page n = printed p.37+n for the article pages).

| # | Item | Printed page | What it gives |
|---|---|---|---|
| 1 | Diagram 1 | p.38 | Letter-name layout of a 24-key instrument (G as tonic, "regular" tuning, no accidentals); octave pairs marked with arrows |
| 2 | Diagram 2 + "Notation" | p.39 | Key numbering from the centre outwards; lines RI, RT, UL, LL; numbers in parentheses optional, (+) alternate starts |
| 3 | Nyamaropa I, Chara I (standard kushaura) | p.43 | Staff notation (4 bars) **and** tablature, 4 sections × 12 pulses |
| 4 | Nyamaropa I, Chara III | p.44 | Tablature only |
| 5 | Nyamaropa II, Chara I (standard kutsinhira) | p.45 | Staff notation (pickup + 4 bars) **and** tablature, columns labelled `12 | 1 … 11` |
| 6 | Nyamaropa II, Chara II | p.45 | Tablature only |
| 7 | Nyamaropa II, Chara III | p.46 | Tablature only |

Text on p.43 says Nyamaropa I is the standard kushaura and Nyamaropa II the
kutsinhira. Both use a "together-left-right-left-together" hand pattern. The
kushaura player hears the downbeat on the first "together", the kutsinhira player on
the first "left". The kutsinhira's first "together" is therefore a pickup, shown as a
dotted vertical line. Williams says the versions correspond to A. Tracey 1970A
pp.13–18 and Berliner 1993 p.76.

The tablature tables are 260×506 px JPEGs embedded at 72 ppi. I extracted them with
`pdfimages`, upscaled them 3× and read every cell. All digits were legible; no cell
needed guessing. The staff notation is vector and was read at 300–400 dpi, with staff
lines located by pixel scan.

### Accessed, used only as a cross-check

**Martin Scherzinger, "Temporal Geometries of an African Music", *MTO* 16.4 (2010),
¶9, Examples 3a/3b.**
<https://www.mtosmt.org/issues/mto.10.16.4/mto.10.16.4.scherzinger.html>
Its Ex. 3a ("a fragment of *Nyamaropa*") is a different realization: 12/8 with a
one-sharp signature and a different right-hand line. It is **not** encoded. It helped
with one question only: its bar-1 left hand ends G–B–D, which agrees with the
tablature's section I bass (LL1 LL1 LL2 LL4 = G G B D). ¶9 also says the second part
"falls one pulse behind the first" (see §4).

### Named but not accessed (secondhand only)

Paul Berliner, *The Soul of Mbira* (1978/1993), p.73, p.76 and the appendix
transcriptions. Andrew Tracey, *How to Play the Mbira (dza vadzimu)* (1970), pp.13–18.
Berliner, *The Art of Mbira* (2020), ch.10 "The Interlocking Aesthetic". I know of
them only through Williams's citations and search listings. Nothing in the bank
depends on them. Williams's claim that his versions "correspond to" Tracey/Berliner is
**not verified by me**.

## 2. The transcription as read

Every string below is 12 columns; `.` = no stroke, digit = key number (Diagram 2).
Kushaura columns are pulses 1…12. Kutsinhira columns are printed `12 | 1 … 11`, so
column 0 is the pickup (pulse 12 of the previous section). No parenthesized
(optional) keys or (+) marks appear in any Nyamaropa table.

**Kushaura Chara I (p.43)**, which is printed identically as **Kutsinhira Chara I
(p.45)** except for the column labels:

```
      RI            RT            UL            LL
I   ......4.4...  2.2.2.....3.  1..1..5..2..  .1..1..2..4.
II  ......4...4.  2.2.2...2...  1..1..5..4..  .1..1..2..5.
III ......5.5.4.  2.2.2.......  1..1..3..4..  .1..1..3..5.
IV  ......5.5.4.  3.3.3.......  4..4..3..4..  .7..7..3..5.
```

**Kushaura Chara III (p.44)**
```
I   ..6.4.4.4...  2.........3.  1..1..5..2..  .1..1..2..4.
II  ..9.9.9.8.7.  2...........  1..1..5..4..  .1..1..2..5.
III 6.6.7.6.5.4.  ............  1..1..3..4..  .1..1..3..5.
IV  4...6.5.5.4.  ..3.........  4..4..3..4..  .7..7..3..5.
```

**Kutsinhira Chara II (p.45)**, in which RI and RT sometimes strike together:
```
I   6.6.4.4.6.6.  2.2.....3.3.  1..1..5..2..  .1..1..2..4.
II  6.6.4.4...4.  2.2.....2...  1..1..5..4..  .1..1..2..5.
III 6.6.6.6.5.4.  2.2.2.2.2...  1..2..3..4..  .1..2..3..5.
IV  4...5.5.5.4.  ..3.2.2.2...  4..4..3..4..  .7..5..3..5.
```

**Kutsinhira Chara III (p.46)**
```
I   ..6.4.4.4.3.  2...........  1..1..5..2..  .1..1..2..4.
II  ..9.9.9.8.7.  2...........  1..1..5..4..  .1..1..2..5.
III 9.8.7.6.5.4.  ............  1..2..3..4..  .1..2..3..5.
IV  4...5.5.5.4.  ..3.........  4..4..3..4..  .7..5..3..5.
```
Section I column 10 prints key **3** on the **RI** line, though p.39 says keys 1–3 are
thumb keys. It is kept on the RI row as printed (token `RI3`).

**Nyamaropa I, Chara II (kushaura) is not in the accessible PDF.** The Nhemamusasa
Chara II table appears where it would be expected (p.44). I did not invent a
substitute.

### Key → pitch

Letter names come from Diagram 1. Octaves were read off the p.43/p.45 staves where
the key is used there. Steps are ordinal heptatonic degrees with G2 = 0:

| Key | Letter | Step | Evidence |
|---|---|---|---|
| LL1 LL2 LL3 LL4 LL5 LL7 | G2 B2 C3 D3 E3 A3 | 0 2 3 4 5 8 | Diagram 1 + staff (LL4 see below) |
| UL1 UL2 UL3 UL4 UL5 | G3 D4 C4 E4 F4 | 7 11 10 12 13 | Diagram 1 + staff |
| RT2 RT3 (and RI3) | G4 A4 | 14 15 | Diagram 1 + staff |
| RI4 RI5 | B4 C5 | 16 17 | Diagram 1 + staff |
| RI6 RI7 RI8 RI9 | D5 E5 F5 G5 | 18 19 20 21 | Diagram 1 ascending order only; no staff for the variations |

The UL2/UL3 inversion (D above C) is as drawn in Diagram 1 and confirmed by the staff
(p.43 bar 1 pulse 10 = D4; bar 3 pulse 7 = C4).

### Staff vs tablature discrepancies (both resolved in favour of the tablature)

1. **Kushaura staff, bar 1 pulse 11 (p.43)** prints the bass note on the F3 line.
   The tablature says LL4, which Diagram 1 makes D3. D3 is supported three times: by
   the kutsinhira tablature, by the kutsinhira staff (p.45, bar 1, label 10, on the D3
   line), and by Scherzinger's independent Ex. 3a. **Encoded: D3.**
2. **Kutsinhira staff, bar 1 label 1 (p.45)** prints the downbeat bass a step above
   the G2 line (A2). The tablature says LL1 (G2), and bar 2 of the same staff prints
   G2 at the same place. **Encoded: G2.**

All other staff notes checked (bars 1–4 of both staves, every hand) match
tablature + Diagram 1.

## 3. Six-row allocation and every adaptation

| Row | Role | Choice 0 | Choice 1 | Choice 2 |
|---|---|---|---|---|
| 0 | Kushaura right index (RI) | Chara I | Chara III | Chara I §I–II loop (24) |
| 1 | Kushaura right thumb (RT) | Chara I | Chara III | Chara I §I–II loop (24) |
| 2 | Kushaura left thumb (UL+LL) | Chara I | Chara III | Chara I §I–II loop (24) |
| 3 | Kutsinhira right index | Chara I | Chara II | Chara III |
| 4 | Kutsinhira right thumb | Chara I | Chara II | Chara III |
| 5 | Kutsinhira left thumb (UL+LL) | Chara I | Chara II | Chara III |

- **One row per playing digit** is a workshop allocation. It follows the instrument,
  not an ensemble convention. The left thumb plays both UL and LL (p.39), and in every
  printed table those lines never coincide, so each row is monophonic. Right thumb and
  right index do coincide in Kutsinhira Chara II, and here they sit on separate rows.
  No stroke is dropped, merged or split beyond this. The union of rows 0–2 (or 3–5)
  for any choice equals the printed chara exactly (tested).
- **Kutsinhira alignment:** the printed `12 | 1…11` labels are taken as shared
  ensemble pulses. Kutsinhira column 0 of section *s* lands at pulse 12·s − 1, and
  section I's pickup lands at pulse 47. The two standard parts are then the same key
  sequence with the kutsinhira one pulse *earlier*, and together they fill all 48
  pulses. This is the only reading under which both players' felt downbeats coincide
  (kushaura on its "together", kutsinhira on its "left", as p.43 describes). However,
  Williams p.39 and Scherzinger ¶9 both describe the kutsinhira as falling one pulse
  *behind*. That wording could mean the literal "+1 pulse" placement, which would
  change which sections sound against each other. **This is the main uncertainty.**
  See §5.
- **Kushaura choice 2** (the first 24 pulses of Chara I looped) is a workshop excerpt,
  on the Chakwi precedent. It is not a traditional phrase, and it stands in for the
  missing Chara II.
- **Presets:** "Standard pair" (both Chara I) is the printed pair. "Kutsinhira Chara
  II" (standard kushaura under the kutsinhira variation) and "Chara III pair" are
  workshop pairings; Williams does not say which charas are played against which.
  Choosing the kushaura as the fixed foundation (rows 0–2) and letting the kutsinhira
  evolve reflects Williams's remark, citing Berliner p.73, that the kushaura varies
  less. The implementation is still a design choice.
- **Designed, not sourced:** 0.9-pulse durations; gains (kushaura 0.42/0.42/0.46,
  kutsinhira 0.38/0.38/0.42); the grouping into three pulses per beat (the tablature
  counts pulses, not beats); the idealized seven-tone tuning (Williams: heptatonic,
  "Nyamaropa tuning" ≈ major with flat 7th, with wide variation between instruments).

Cycle: every cell is 48 or 24 pulses. The LCM is 48 pulses = 16 beats at 3 pulses per
beat, which is exactly the limit.

## 4. Limitations

- One secondary pedagogical source (a 1997 magazine article), not Berliner's or
  Tracey's own transcription. Williams says these are "not intended to be note-for-note
  renditions of particular performances" (p.40).
- Onsets are an isochronous pulse grid. No microtiming, dynamics, buzz, or hosho/voice
  parts are in the source, and none were added.
- Pitch is relative letter names from a "regular" tuning drawing. No measured
  intonation. Octaves of RI6–RI9 are inferred from key order, not a staff.
- The kutsinhira-alignment question above.
- Kushaura Chara II is missing from the PDF.

## 5. Verdict

**Ready to register, pending Ian's listening on one point.** The attack-level data
is fully source-derived: five printed charas, every stroke, with key-to-pitch checked
against two staves. The designed parts are declared.

Before registering, Ian should listen to "Standard pair". If the two parts do not
sound like a Nyamaropa kushaura/kutsinhira pair, the fix is one line in `tabEvents`:
change the kutsinhira offset from `col − 1` to `col + 1`. That would confirm the
"one pulse behind" reading. To register it, add `worlds[nyamaropaWorld.id] =
nyamaropaWorld` in `cells-hot-worlds.ts`, and add a ledger entry in `cells-sources.md`
condensed from this file.
