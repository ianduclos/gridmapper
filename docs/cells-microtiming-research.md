# Timing sources for the next cells banks

These are performance measurements, not universal templates for a culture.
The first research pass below led to the Manjanin and Ngòn study banks; see
the implementation update below for what is now installed.

| Material | Documented timing | Candidate use |
| --- | --- | --- |
| Manjanin, Drissa Kone, Mali | Short–medium–long subdivision, mean gaps 27:33:40 in the first échauffement studied | A performance-specific 12-pulse bank with onsets 0, 0.81, 1.8 within each three-design-pulse beat |
| Ngòn, Segu Bamana ensembles | Kèngèbu accompaniment mean gaps 40.8:30.7:28.5 across six performances | Long–short–short study; onsets 0, 1.224, 2.145 within each three-design-pulse beat |
| Bire accompaniment | Bell mean gaps 58.6:41.4 | A distinct two-subdivision world, not the ternary model repurposed |

Sources:

- Rainer Polak (2010), [Rhythmic Feel as Meter](https://www.mtosmt.org/issues/mto.10.16.4/mto.10.16.4.polak.html), §§65–69, 74–85. Includes recordings, isolated examples and transcriptions. Kone's 27:33:40 model is explicitly descriptive, with performer and tempo variation. The second jembe's repeating `S.TS.B` accompaniment yields approximately 60:40 intervals, consistent with this subdivision.
- Rainer Polak and Justin London (2014), [Timing and Meter in Mande Drumming from Mali](https://mtosmt.org/issues/mto.14.20.1/mto.14.20.1.polak-london.php), §§45–52, 92, figures 4.2 and related examples. The Ngòn mean conceals ensemble-specific nuances. The Bire binary model belongs to a different accompaniment context.
- Polak, London and Jacoby (2016), [Both Isochronous and Non-Isochronous Metrical Subdivision Afford Precise and Stable Ensemble Entrainment](https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2016.00285/full). Larger performance corpus supports stable coordination with uneven subdivisions.

## Design consequence

Store structural timing in each cell's fractional `atPulse`. Keep the common
clock regular; do not add a free-running swing clock or accumulate offsets.
At a three-pulse beat of 500 ms, Ngòn's mean gaps become 204, 153.5 and 142.5 ms.
These deliberate differences are much larger than a ±4 ms humanizer.
Max should execute the supplied fractional deadlines faithfully, then apply only
bounded per-strike variation. A humanization amount of zero must retain the
cell's uneven timing.

Next source bank should reconstruct the cited multi-part example and preserve
its relationship between stroke type, part and timing. Splitting drum types
across Hotelier voices and assigning pitches would be labelled adaptations.
A timing average alone is insufficient evidence for inventing six traditional
parts. Prefer Manjanin first, then the contrasting Ngòn shape. Keep the rhythm
world and tuning bank independent; neither research paper supplies a melodic
scale for these drum parts.

## Implementation update

Manjanin and Ngòn are now implemented in `cells-manjanin.ts` and `cells-ngon.ts`.
See [the bank source notes](cells-sources.md#manjanin-and-ngòn-2026-09-21) for
exact excerpt choices, timing models, six-voice allocation and limitations.

## Next repertoire: evidence and practical priorities

1. **Banda Linda: a second bank is well justified.** The [CREM Ayayo record](https://archives.crem-cnrs.fr/archives/items/CNRSMH_I_1983_001_032_05/)
   describes a 14–15-air ongo repertoire, with corresponding songs. Its media
   access is restricted; the public metadata alone cannot supply a score.
   [Arom's Banda Polyphony collection](https://folkways.si.edu/central-african-republic-banda-polyphony/world/music/album/smithsonian)
   and the [CNRS film Ango](https://images.cnrs.fr/en/video/893) are useful
   recording/demonstration leads. Pair a named piece with the horn-ensemble
   transcriptions in Arom's *African Polyphony and Polyrhythm*, rather than
   inventing another anonymous hocket and calling it traditional. No verified
   second Banda transcription was obtained in this pass.
2. **Aka/BaAka and Baka:** related labels need care; do not merge these peoples
   into one bank. Fürniss's [comparative study](https://doi.org/10.4000/africanistes.4314)
   is a useful orientation. Her [Baka 2006 field corpus](https://archives.crem-cnrs.fr/archives/collections/CNRSMH_I_2016_019/)
   includes analytical recordings of beka and gbada rhythms, promising for
   part-by-part reconstruction. Access is restricted and no numeric timing
   table was verified. Cyclic interlocking and vocal variation are promising;
   measured microtiming must await an accessible recording/analysis.
3. **Balinese kotekan:** especially strong for paired melodic cells. [Tenzer's
   analysis](https://mtosmt.org/classic/mto.00.6.2/mto.6.2.tenzer.html) gives
   notation and recordings for interlocking parts within a hierarchy of slower
   melodies and gong cycles. This offers another design idea: short cells can
   lead toward a shared arrival at the end of a longer cycle. Published timing
   measurements in [McGraw & Kohnen's Byar study](https://iftawm.org/journal/oldsite/articles/2016a/McGraw_Kohnen_AAWM_Vol_5_1.pdf)
   concern collective strikes, not a recurring kotekan swing template. Do not
   transfer those offsets wholesale to the repeating parts.
4. **Algerian inṣirāf:** Polak 2010 §2 cites Elsner's S–L–L finding. Original:
   Jürgen Elsner (1990), “Der Rhythmus Inṣirāf: Zum Problem quantitativer
   Rhythmik,” in Oskár Elschek (ed.), *Rhythmik und Metrik in traditionellen
   Musikkulturen*, Musicologica Slovaca XVI, pp.239–249. No accessible numeric
   measurements were located. A qualitatively uneven model is defensible, but
   its ratios must be labelled designed. Standard Arab īqāʿ cycle notation
   alone does not establish performed microtiming.

Recommended order: a named Banda Linda piece for continuity with the horn
bank, then a Balinese paired kotekan bank for a contrasting melodic world.
Aka/Baka deserve dedicated source access and listening; inṣirāf deserves the
original timing study before claiming a measured implementation.
