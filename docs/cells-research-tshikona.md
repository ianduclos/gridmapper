# Tshikona — research dossier

**Verdict: needs Ian's listening, then ready to register.** The attack-level source is
open access, and I read it directly. Onsets, pipe pairings and relative pitch are
encoded from the printed figures. The row allocation, register, gains and durations
are designed. Data: `src/data/cells-tshikona.ts`. Tests: `test/cellsTshikona.test.ts`.
Not registered in `cells-hot-worlds.ts`.

## Sources

### Accessed and verified by me

Andrew Tracey & Laina Gumboreshumba, "Transcribing the Venda *tshikona* reedpipe
dance", *African Music* 9(3), 2013, pp.25–39. It is open access at
[journal.ru.ac.za/…/view/1909](https://journal.ru.ac.za/index.php/africanmusic/article/view/1909)
([PDF](https://journal.ru.ac.za/index.php/africanmusic/article/download/1909/984/991)).
I rendered the page images at 400–600 dpi and read the notation visually. I did not
rely on OCR for the figures.

- **Fig.2 (p.25), "Luimbo lwa tshikona".** A 12-pulse cycle on a five-line
  "Tshikona clef", with Pipe 1 written as top-line F. Thungwa beats are the heavy
  lines on pulses 1, 4, 7 and 10 (average 90 MM). There are two simultaneous
  descending scales: white notes with large numbers, and black notes with small
  numbers. I checked every pitch: each pipe sits on the same staff step in both
  scales. Pipe 1 is F, the top line, and Pipes 2–7 step down to G, the second line.
- **Fig.5 (p.31).** The text-set grid of the same pattern. I copied it verbatim
  into `tshikonaFigure5`:

  | # | pulse | large (starting scale) | small (secondary scale) |
  |---|---|---|---|
  | 1 | 1 | 2 | 6 |
  | 2 | 3 | 3 | 7 |
  | 3 | 5 | 4 | 1 |
  | 4 | 7 | 5 | 2 |
  | 5 | 8 | 6 | 3 |
  | 6 | 9½ | 7 | 4 |
  | 7 | 11 | 1 | 5 |

  The caption says "Pipes 7 and 4 play between pulses 9 and 10". The text (pp.33–34)
  argues that Pipe 7 falls on 9½, which halves the space between Pipe 6 (pulse 8) and
  Pipe 1 (pulse 11), and that the murumba drum supports it.
- **Fig.10 (p.35).** Each of the seven parts on its own staff. I measured the note
  positions against the pulse grid:
  - Pipe 1 is at 5 and 11.
  - Pipe 2 is at 1 and 7.
  - Pipe 3 is at 3 and 8.
  - Pipe 4 is at 5 and 9½.
  - Pipe 5 is at 7 and 11.
  - Pipe 6 is at 1 and 8.
  - Pipe 7 is at 3 and 9½.

  These agree with figs.2 and 5.
- **Fig.11 (p.39).** Hz estimates for eight groups, measured with the ILAM tuning
  forks. They confirm that Pipe 1 is the highest pipe, that the pipes descend 1 → 7,
  and that the next Pipe 1 is an octave below (for example Sundani runs 260 … 144,
  then 130 Hz).
- **Text, p.29.** "Two pipes always sound together". Each pipe plays twice per cycle.
  Neither scale is predominant. The two scales sound "a fourth and a fifth apart".
- **Text, p.33.** The two alternative readings of the "hazy" second half:
  - **A)** four equal 1½-pulse beats on 7, 8½, 10, 11½.
  - **B)** double strokes on 7–8 and 10–11.

  The authors hear both sometimes but reject both as the main reading.

### Not accessed (secondhand only)

- **Blacking.** I did not read *Venda Children's Songs* (1967), *How Musical Is Man?*
  (1973), "Deep and Surface Structures" (1972) or "Tonal Organization" (1970). My
  only knowledge of them is the article's own summary. It says that Blacking is the
  only earlier transcriber, that his rhythm was "impressionistic", that it is unclear
  whether his *phala* is Pipe 1 or Pipe 2, and that he placed it at G, A or B♭
  (pp.28, 33). Nothing in the bank depends on Blacking.
- **Kirby (1934).** Tracey says Kirby's reedpipe transcription cannot be positively
  identified as tshikona: it is labelled *mathangwa* and set in 2/4 (p.28, note 6).
  I did not read it.
- **Gumboreshumba's doctoral thesis** was still in preparation when the article
  appeared, and I did not locate it.
- **Kruger (1988)** and the 2022 Harrop-Allin & Salant chapter were not consulted.

## Discrepancy found in the source

The spacing labels printed on fig.10 for Pipes 4 and 7 look swapped. Pipe 4 is
labelled "5½–6½", but its notes at 5 and 9½ give 4½ + 7½. Pipe 7 is labelled
"4½–7½", but its notes at 3 and 9½ give 6½ + 5½. The note positions agree across
three figures: fig.2 (notation), fig.5 (grid) and fig.10 (noteheads). The bank
therefore follows the positions, and the labels are treated as a typesetting slip.

## Encoding

- **Time.** Each source pulse is 2 design pulses. One cell is 24 design pulses,
  which is one 12-pulse cycle. `pulsesPerBeat = 6`, so one performance beat is one
  thungwa beat. This makes the printed 9½ the integer onset 17, so no fractional
  `atPulse` is used. The world cycle is 4 beats, shorter than the other banks' 8–16,
  so the gesture loopers get a 4-beat quantum.
- **Pitch.** `pitchStep = (7 − pipe) + 7`, with `degreeCount = 7`. This is the
  single octave printed in fig.2: Pipe 1 = 13, down to Pipe 7 = 7. It is relative
  scale-step data. The real ensemble doubles every pipe across about four octaves
  plus a few *phalana* (p.26), and that doubling is not modelled.
- **Tokens.** `sourceToken` is `pipe<n>:large` or `pipe<n>:small`, which retains the
  scale each attack belongs to.
- **Tuning.** The recommended tuning is `heptatonic-model`. The basis is fig.11 and
  the p.28 remark that the Sundani intervals cluster near 171.4 cents
  (equiheptatonic). It is an idealization, not a group's measured tuning.

## Six-row allocation and adaptations

| Row | Content | Status |
|---|---|---|
| 0 | Pipes 1 + 7 | **Workshop merge.** Seven pipes need six rows. Pipes 7 and 1 never coincide, and 7 → 1 is the turnaround of the descending scale. Pipe 7 cannot merge with 3 or 4, which sound with it. |
| 1 | Pipe 2 | One pipe per row, one pitch. |
| 2 | Pipe 3 | One pipe per row, one pitch. |
| 3 | Pipe 4 | One pipe per row, one pitch. |
| 4 | Pipe 5 | One pipe per row, one pitch. |
| 5 | Pipe 6 | One pipe per row, one pitch. |

The three choices are the same in every row:

- **Choice 0: fig.5 as printed.** The union of the six rows is exactly the 14-attack
  composite, which is tested.
- **Choice 1: reading A** (7, 8½, 10, 11½), as described in the text. It is not a
  traditional variant. Fig.10 draws the alternatives for Pipes 3, 4, 6, 7 and 1, but
  **draws none for Pipe 5**, although the text says every pipe except Pipe 2 has one.
  I moved Pipe 5's pulse-11 note to 11½ with Pipe 1, following the p.29 rule that
  pairs always sound together. This is my inference.
- **Choice 2: reading B** (Pipes 7 and 4 move from 9½ to 10), as described in the
  text. Fig.10's dots at pulse 10 show it.

Fig.10 also puts a dot at pulse 9 for Pipes 4 and 7. The text explains neither
reading with it, so it is **not encoded**.

**Presets** set all rows to one reading. **Foundation:** row 1 (Pipe 2), because the
source gives Pipe 2 no alternative, so its three cells are identical. **Evolution:**
one group of rows 0, 2, 3, 4 and 5, with tuples (0…), (1…) and (2…), so the pairs stay
together. If you set rows to different readings by hand, you split the printed pairs:
that is a deliberate hybrid, not source material.

**Designed:** durations (1.6 design pulses, i.e. 0.8 of a source pulse), the equal
gain of 0.45 (the source says neither scale is predominant, but gives no dynamics)
and the register offset.

## Limitations

- **No drums.** Fig.7 prints thungwa, murumba and ngoma patterns and fig.8 prints
  the murumba mnemonic. None of them is encoded, because the six rows are all used
  by pipes. A drum-bearing variant would need a different allocation.
- **One octave, not the ensemble.** It is not the four-octave ensemble, not any
  group's tuning, and not the "inherent patterns" a listener hears across registers.
- **Onset timing.** It is the authors' notated reading. The article gives no
  measured timing statistics, and it describes the second half as hazy, especially
  without drums.
- **The model is one group's.** It follows the numbering and practice of
  Netshivhale's groups. The Vhutavhatsindi and Khakhu groups start two pulses later
  (p.29). The authors say the pattern is "very close to identical" across groups.

## For Ian

Listen to CD track 1 of that *African Music* issue, if you have access to it, or to
any tshikona recording. Check whether the 9½ placement and the fixed pairs sound
right against the hocket before registering. Registration is one line in
`cells-hot-worlds.ts` plus adding the world to the bank tests.
