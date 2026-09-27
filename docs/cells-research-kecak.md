# Kecak — cak interlock: research dossier

Draft world `kecak` (`src/data/cells-kecak.ts`, test `test/cellsKecak.test.ts`).
It is **not registered** in `cells-hot-worlds.ts`.

## Verdict

**Needs Ian's listening before it is registered.** The cak onsets are
source-derived: attack-level notation, open access, and visually checked. The
source is thin, though. It is a short article in a regional journal that
transcribes one tourist performance, and it prints no rhythm for its melody
lines. Everything above the cak layer is therefore a workshop arrangement:
melody placement, pitch, beat grouping and the alternative choices.

## Sources

### Used: attack-level notation

**I Putu Ikka Darmawan, Ni Wayan Ardini and I Gede Mudana (2020),** "Kecak
Touristic Performance in Uluwatu Temple: Its Aspects of Vocal Karawitan",
*Jurnal Bali Membangun Bali* 1(1), pp.65–72. The notation block is on
**printed p.70 (PDF page 6)**.
Open-access PDF: <https://ejournal.baliprov.go.id/index.php/jbmb/article/download/109/84/249>.
The authors made the notation from observing the Sanggar Karang Boma (Pecatu)
performance at Uluwatu on 9 December 2019. The article says so on p.69:
"based on observations of the Kecak show at Uluwatu Temple".

**Verified by me:** I rendered PDF page 6 at 300 dpi and read it visually,
then checked the text layer and it matches character for character. What I
read:

| # | Printed label | Line (between repeat signs) | Onsets (0-based) |
|---|---|---|---|
| 1 | Pengucapan Ketukan | Pung ×8 | — |
| 2 | Pola Cak 3 · Cak Polos | `..C..C.C` | 2, 5, 7 |
| 3 | Pola Cak 3 · Cak Sangsih | `.C..C.C.` | 1, 4, 6 |
| 4 | Pola Cak 3 · Cak Sanglot | `C..C.C..` | 0, 3, 5 |
| 5 | Pola Cak 6 · Cak Polos | `C..C..C..C.C.C..` | 0, 3, 6, 9, 11, 13 |
| 6 | Pola Cak 6 · Cak Sangsih | `.C..C..C..C.C.C.` | 1, 4, 7, 10, 12, 14 |
| 7 | Pola Cak 5 · Cak Penyelah | `..C..C..C..C..C.` | 2, 5, 8, 11, 14 |

The legend reads: `C` = Cak, `.` = Ketukan (Pung), `‖ ‖` = repeat. Syllables:
B Bug, S Sir, Y Yang, E Nger, U Ngur, O Ngor, A Ngar, I Ngir, 7 Ndur, 3 Ndir.

The "Pola Melodi" lines, as printed:

1. awal (the opening, as the chorus enters): `B S B S`
2. kedua (seated): `Y I Y U Y E Y S`
3. ketiga: `Y O Y A Y E Y S`
4. keempat: `Y E Y S`
5. kelima: `Y E Y A Y O Y S`
6. keenam: `Y E Y O Y E Y S`
7. ketujuh: `3 7 3 S`

Observations, all mine and all read from the page:
- The three cak 3 parts are the same 3+3+2 figure, each shifted by one
  position. Sangsih = polos −1 and sanglot = polos −2. Their union covers all
  eight positions. Polos and sanglot both sound at position 5.
- On the page, "Pola Cak 5 / Cak Penyelah" sits as the third line *inside*
  the cak 6 block and shares its repeat signs. I read it as the third part
  that sounds with cak 6, not as a stand-alone pattern. The union of cak 6
  and cak 5 fills positions 0–14 and leaves 15 empty. Penyelah coincides with
  polos at 11 and with sangsih at 14.
- The melody lines carry no dots, so the source gives **no rhythmic
  placement** for them. The prose says the melody starts at a fast tempo and
  slows once the cak pattern enters.

### Used only for a declared pitch design

Tenzer (2000), MTO 6.2, §3.1 (<https://mtosmt.org/classic/mto.00.6.2/mto.6.2.tenzer.html>),
gives the Balinese tone names in order: ding, dong, deng, dung, dang (I O E U
A). I verified this through a fetch of the page. The kecak article does
**not** link its syllable vowels to these tone names. The link is my
interpretation (see Adaptations).

### Sought but not accessed

- **Stepputat, "Performing Kecak…", *Yearbook for Traditional Music* 44
  (2012).** Cambridge Core returned only a landing page and ResearchGate
  returned 403. Search-engine snippets attribute two claims to it: cak telu is
  "three cak calls that form the constantly repeated pattern over two beats",
  and there are six patterns named by their number of calls (telu, lima, nem,
  ocel…), each with polos/sangsih/sanglot parts. **Both claims are secondhand
  and unverified.** If they hold, they match this source's part names and a
  4-per-beat reading of the 8-position cak 3.
- **Stepputat, "The Genesis of a Dance-Genre: Walter Spies and the Kecak"
  (2010).** Academia.edu returned 403 and the vdocument mirror returned 437.
  The snippets say it prints a cak telu transcription, but I did not see it.
- **Dibia, *Kecak: The Vocal Chant of Bali*, and Tenzer, *Gamelan Gong
  Kebyar*.** Both are books, and I found no open copy.
- **LibreTexts "Cultural Approaches to Rhythm", Fig. 6 ("Kecak style
  rhythm").** A teaching exercise that paraphrases Bakan's kilitan telu. It is
  tertiary, so I did not use it.

Because I could not open Stepputat or Dibia, **I could not cross-check this
transcription against a second notation.** Online paraphrases often describe
cak telu as 3+3+2 starting on different beats, which agrees with the rotation
structure above. The exact phase, and part names such as "sanglot" and
"penyelah", rest on the 2020 article alone.

## Six-row allocation

| # | Row | Choice 0 | Choice 1 | Choice 2 |
|---|---|---|---|---|
| 1 | Cak polos | Cak 3 (source) | Cak 6 (source) | Cak 6, positions 8–15 looped (adaptation) |
| 2 | Cak sangsih | Cak 3 (source) | Cak 6 (source) | Cak 6, positions 8–15 looped (adaptation) |
| 3 | Cak sanglot / penyelah | Cak 3 sanglot (source) | Cak 5 penyelah (source) | Cak 5, positions 8–15 looped (adaptation) |
| 4 | Pung | Every ketukan (source reading) | Every other ketukan (thinning) | Once per 4 pulses (thinning) |
| 5 | Melody | Melodi kedua | Melodi ketiga | Melodi kelima |
| 6 | Entrance / closing line | Melodi awal (B S B S) | Melodi keempat | Melodi ketujuh |

Melody rows 5 and 6 reproduce syllable order from the source and nothing else.
Melodi keenam is exported as data but not used in a cell.

Presets: "Cak 3" is all choice 0. "Cak 6 with cak 5" is `[1,1,1,0,1,1]`.
"Cak 6 closing half" is `[2,2,2,1,2,2]`. The evolution group is the three cak
rows moving together, and rows 4–6 are foundation.

## Adaptations: every one is a design, not a source claim

1. **Six-row split.** The three cak parts are printed as parts. Giving each
   one to a single monophonic voice is natural, but a real chorus is dozens of
   men per part.
2. **Beat grouping.** `pulsesPerBeat = 4`, so cak 3 spans 2 beats and cak 6/5
   spans 4. The source defines only the ketukan position, not a beat. The
   choice fits Stepputat's (unverified) "two beats" for cak telu.
3. **Pung.** I read the eight printed Pung as one per position, because the
   legend equates `.` with one ketukan (Pung). The page does not align them
   typographically to the cak columns, so this reading is plausible but
   uncertain. Choices 2 and 3 are thinnings.
4. **Choice 2 on the cak rows** is an excerpt loop of the printed cak 6/5
   block's second half. The source documents no such pattern.
5. **Melody rhythm** is fully designed: one syllable per 2 pulses (8
   syllables = 16 pulses), and one per 4 pulses for the 4-syllable lines.
6. **All pitch.** Cak and Pung are unpitched, so their fixed steps are
   register designs: Pung 0, cak 12/13/14. For the melody, the vowel of each
   syllable is read as the Balinese tone name that shares it (i→ding 0, o→dong
   1, e→deng 2, u→dung 3, a→dang 4). So Yang→dang, Sir→ding, Bug→dung,
   Ndur→dung and Ndir→ding. The rows sit on bases of 2 (row 6) and 7 (row 5).
   This is an interpretation that the article neither states nor implies.
7. **Tuning, gains and durations** are designed. The recommended tuning is
   `hotelier-pelog`, a workshop pick for a Balinese-flavoured table. It is not
   a claim about how this performance is tuned.
8. **No microtiming.** No timing measurement exists, so every onset is an
   integer. The article's tempo change (fast melody, then slower with cak)
   and any accelerando are not reproduced.

## Limitations

- There is one source: a short tourism-context article that transcribes one
  performance, with no audio and no timing.
- Kecak's other layers are absent: the leader's calls, the kajar-like
  "pung"/"ser" figures beyond the printed Pung, dynamics, and form (entries,
  accelerations, cues).
- It differs clearly from `kotekan`. This is unpitched vocal rhythm, with
  pitch only by declared interpretation, not Tenzer's pitched Pelayon
  composite.

## What would upgrade it

Access to Stepputat (2012) or Dibia's book would allow a cross-check of the
cak 3 phase and the cak 5/6 relationship, and possibly add cak lima, cak nem
or ocel as more source-derived choices. A time-coded recording of the
Uluwatu performance would let Ian check the Pung alignment and the melody
placement by ear.
