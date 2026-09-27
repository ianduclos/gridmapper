# Sikuri (ira/arka hocket): research dossier

**Verdict: needs Ian's listening before it is registered.** A note-level source
was found and read, and `src/data/cells-sikuri.ts` encodes it. It is **not**
the Conima repertoire named in the brief. It is urban *sikuri metropolitano*
from Lima (2020). The ira/arka split is derived from the article's own tuning
chart, not printed in the score. It is not registered in `cells-hot-worlds.ts`.

## 1. Sources

### 1a. Used: Serrano Finetti (2022)

Francisco Javier Serrano Finetti, "La presencia del sikuri metropolitano en las
protestas de noviembre del 2020 y dos de sus melodías", *Kaylla* (PUCP) 1:
97–110. [doi:10.18800/kaylla.202201.005](https://doi.org/10.18800/kaylla.202201.005);
PDF: `revistas.pucp.edu.pe/index.php/kaylla/article/download/25316/24593/`.
I read three figures in this PDF. I extracted the embedded images: fig.2 and
fig.3 are 786×1069 at 150 dpi, which is clear.

- **Fig.1 (p.100):** "Afinación de los sikus (maltas) de 27,5 cm". It shows
  arka as Do Lab Fa Reb Sib Sol Mib and ira as Sib Sol Mib Do Lab Fa, drawn
  with zig-zag arrows between the two rows.
  - p.100 says the pipes rise from right to left, and footnote 3 gives the
    lowest pipe as Eb4. The two rows therefore interleave in thirds into one
    13-pipe Eb-mixolydian ladder, Eb4 to C6: arka Eb4 G4 Bb4 Db5 F5 Ab5 C6,
    ira F4 Ab4 C5 Eb5 G5 Bb5.
  - The text confirms the overlap: the arka's top three pitch classes match
    the ira's bottom three, and the reverse (p.101).
- **Fig.2 (p.105):** the huayno "Mariátegui", *Sikuris metropolitanos de
  Lima*, ♩=70. One melody staff with lyrics sits over a bombo staff.
- **Fig.3 (p.107):** the huayno "Caballero", same layout, ♩=61. Some bombo
  eighths have slashed noteheads.
- **Relevant text:**
  - The abstract says the scores show "el movimiento melódico de la voz (que
    es similar a lo ejecutado por los sikus) y los bombos".
  - p.105: "las maltas se desenvuelven en la tonalidad de fa menor".
  - Footnote 13 (p.108): bomberos do not always sound the printed eighths,
    and sometimes mark them silently on the skin.
  - p.99, citing Vásquez et al. 2009: chili, malta and sanqa sizes are tuned
    in octaves.

### 1b. Found and read, but not usable for timing: Bueno Ramírez (2009)

Oscar W. Bueno Ramírez, *Trascendencia del siku: una interpretación
etnomusicológica*, Puno, 2009 (San Gabán). PDF:
`www.sangaban.com.pe/pgw_externos/pgw_memoriaanual/2008pdfSE.pdf`.

- **Gráfico Nº 26 (p.26), "Satiri (sembrador)":** labelled "Tradicional de
  Conima, Trascrip. Oscar Bueno R.", informant Paúl Macedo 2009.
  - This is the closest match to the brief: a Conima melody whose ira/arka
    split is **printed**, by beam colour. The text says staff spaces are
    ira/macho (red-blue) and lines are arka/hembra (red-green).
  - It prints per-section counts: machos A12 B15 C5 = 32, hembras A12 B9 C8
    = 29.
- **Why it is not encoded:** the only copy is a 541×324 px raster.
  - Pixel analysis recovers the staff lines, notehead heights and beam colours
    reasonably well.
  - The rhythm does not come out. Bar 1 is in 2/4 and holds seven equally
    spaced notes: a single beam plus one sixteenth stub. That does not sum to
    2/4 under any reading I could defend.
  - Encoding it would mean inventing its timing. A higher-resolution copy,
    such as the printed book, would probably make it the better bank.
- **A naming conflict:** Bueno's naming of which row is ira runs opposite to
  Sánchez Huaringa's (below). Which row is called "ira" is not universal
  between sources. Serrano's fig.1 names the rows explicitly, and the bank
  follows fig.1.

### 1c. Context only (no melody)

Carlos Sánchez Huaringa, *Organización, arte, identidad e ideología en los
grupos de sikuris metropolitanos* (MA thesis, UNMSM). PDF at
`centroderecursos.cultura.pe/sites/default/files/rb/pdf/organizacion,arte_sikuris.pdf`.
p.169 lists the pipe notes of sikumoreno (corte 29) and sikuri (corte 27)
instruments. It contains no transcriptions.

### 1d. Not accessed

- **Turino**, *Moving Away from Silence* (1993), and his *Ethnomusicology*
  articles: paywalled, or on Scribd only.
- **Valencia Chacón**, *El siku bipolar altiplánico* and "Jjaktasiña irampi
  arkampi" (1982): Scribd and Academia.edu, both behind logins. The untref
  mirror of "El siku bipolar en el antiguo Perú" returned a PDF without a text
  layer, and I did not pursue it.
- **Pérez de Arce**, *La sikuriada en tanto sistema complejo* (U. Chile 2020
  thesis): the repository serves an Anubis bot-challenge instead of the PDF.
  Search snippets say it has an ira/arka colour-coded score. I did not bypass
  the challenge. It is worth fetching in a browser.
- **Baumann**, "Música andina, dualismo simbólico y cosmología": Scribd only.

## 2. Transcription as read

Positions are in sixteenths, with the tied value as the length. Pitches use
the four-flat key signature. Values were read from 3× crops, and bar 1 of
fig.2 was checked against the staff-line pixel rows (C5, F5 and Eb5 heads
confirmed).

**Mariátegui A: fig.2 bars 1–6, the repeated section.** The bars are 3/4, 3/4,
1/4, 3/4, 3/4 and 2/4, which is 15 beats or 60 pulses.

- **Bar 1:** C5 (16th) · F5 (8th) · F5 (16th) | F5 (8th) · Eb5 (16th) ·
  C5 (tied 16th+16th) · C5 (16th) · Bb4 (8th).
- **Bar 2:** Ab4 (quarter) | F5 (8th) · Eb5 (16th) · F5 (tied) | G5 (16th) ·
  Ab5 (8th, tied into bar 3).
- **Bar 3:** C5, dotted 8th.
- **Bar 4:** repeats bar 1.
- **Bar 5:** Ab4 (quarter) | F4 (8th) · Eb4 (16th) · F4 (tied) | G4 · Ab4 · G4.
- **Bar 6, "Repique":** F4 F5 C5 F5 C5 F5 C5 F5, all sixteenths.
- **Bombo, with accents marked:** >8 >8 >8 8 8 8 | >♩ >8 8 8 8 | >♩ |
  (bar 1) | >♩ >8 8 8 8 | >8 8 8 8.

**Caballero: fig.3.** The bars are 4/4, 3/4, 4/4 and 4/4, which is 15 beats.

- **Bar 1:** C5 · F5 (8th) · F5 | F5 (8th) · F5 · Eb5 (tied) | Db5 (8th) ·
  F5 (8th) · C5 (8th) · 16th rest.
- **Bar 2:** F5 · G5 (8th) · Ab5 (tied) | Ab5 (8th) · F5 (tied) | C5, dotted 8th.
- **Bar 3:** Ab4 · C5 (8th) · C5 | C5 (8th) · C5 · Bb4 (tied) | G4 · Bb4 ·
  Ab4 (8ths) · 16th rest.
- **Bar 4:** F4 · G4 (8th) · Ab4 (tied) | Bb4 · Ab4 (8th) | the repique figure.
- **Bars 5–8, first ending:** bars 3, 2, 3 and 4 printed again under new
  words. So Caballero B differs from A only in its first bar.
- **Bombo:** bars 1, 3, 5 and 7 are >8 8 8 8 /8 /8 >♩. Bars 2 and 6 are
  >8 8 8 8 >8 /8. Bars 4 and 8 are >8 8 8 /8 >8 8 8 /8, where "/" is a
  slashed notehead.

**The ira/arka split.** Every printed pitch lies inside fig.1's Eb4–C6 ladder,
so each maps to exactly one row. For example, the repique alternates ira and
arka on every sixteenth. That is the textbook hocket, and it falls out of the
chart with nothing tuned to produce it.

Only one octave placement is possible. The melody spans Eb4 to Ab5, which is
11 of the 13 pipes, and its lowest note is the lowest pipe. Shifting the
ladder an octave either way leaves notes that no pipe can play.

## 3. Six-row allocation and every adaptation

| # | Row | Content | Status |
|---|---|---|---|
| 1 | Malta ira | Printed notes on fig.1's ira pipes | Split derived from fig.1 |
| 2 | Malta arka | Printed notes on fig.1's arka pipes | Split derived from fig.1 |
| 3 | Sanqa ira, octave below | The same notes, 7 pipes lower | **Adaptation**: the octave sizes are in the text, not in this score |
| 4 | Sanqa arka, octave below | The same | **Adaptation** |
| 5 | Bombo accents | The strokes printed with `>` | **Allocation**: one drummer's line split in two |
| 6 | Bombo fill | Unaccented and slashed strokes | **Allocation**: slashes are unexplained in the source |

- **Choices:** 0 is Mariátegui A, 1 is Caballero A and 2 is Caballero B. All
  three are printed excerpts; none is an invented variant.
- **Choice 0:** the brief asks for the source melody in choice 0. It is the
  whole fig.2 A section, and the test checks it note for note.
- **Mixing tunes across rows:** choices across rows are independent, so they
  can be mixed. Mixing tunes is a hybrid that the source does not print.
- **Presets:** each recalls one whole tune.
- **Evolution:** a single six-row group changes the tune for all rows
  together. `foundationRows` is empty, unlike the models. The bombo differs
  in meter between the two tunes, so leaving it fixed would make evolution
  lay 3/4-based strokes under a 4/4 melody.
- **Designed values:** gains, the 0.9× articulation of printed lengths, the
  1.6-pulse bombo length, and a single bombo pitch (`pitchStep` 0).
- **Timing:** `pulsesPerBeat` is 4, one sixteenth per pulse. All 18 cells are
  60 pulses, so the world cycle is 15 beats. All onsets are integers, and no
  microtiming is claimed.
- **Tempo:** the sources print ♩=70 and ♩=61, while cells defaults to about
  145 BPM. Set roughly 60–70 BPM to hear it as notated.
- **Tuning:** the recommended tuning is `heptatonic-model`. The siku has seven
  pitch classes, and the model is idealized equal spacing. It is not the
  intonation of these instruments.

## 4. Limitations

1. **Not Conima, not rural.** These are two 2020 protest huaynos from Lima's
   *sikuri metropolitano* movement. They are a legitimate sikuri source, but
   not the Conima/Turino repertoire the brief names.
2. **The printed line is the sung melody.** The author says the sikus follow
   it, and he analyses it as the maltas' line (p.105). Actual siku
   performance may differ in detail, including ornaments, breath breaks, and
   *requinteando* substitutions on the overlapping pipes (p.101, citing
   Turino 2008).
3. **The ira/arka split is my derivation from fig.1.** Fig.1 plus the melody's
   range fix it uniquely, as argued in §2, but no figure prints it.
   - Footnote 3 literally says the range is "Eb4 a C5". Thirteen pipes cannot
     fit in that range, so I read it as a slip for C6. The bank depends only on
     the lowest pipe, Eb4.
4. **The slashed bombo noteheads are not explained.** They might be the
   silently marked strokes of footnote 13, or rim or muted strokes. They are
   kept as a distinct `bombo:slash` token at low gain.
5. **What was verified, and what was not.**
   - I read the figures myself: pitches and rhythm from the images, with bar 1
     of fig.2 cross-checked at pixel level.
   - Claims about Turino, Valencia and Pérez de Arce are secondhand, taken
     from the Kaylla and Sánchez texts and from search snippets.

## 5. What would improve it

- **Satiri:** a legible copy of Bueno's Gráfico 26. It is a Conima tune with
  the split printed, and a checksum of 32 ira and 29 arka notes is available.
- **Pérez de Arce's 2020 thesis:** download it through a browser.
- **Turino's book:** either of those, or Turino 1993 via a library, would give
  a rural, source-printed split. Ian listening against the Lima recordings the
  article cites would check the Lima bank (Vallejo 2020, "MARIÁTEGUI EL
  PUEBLO", reference list p.110).
