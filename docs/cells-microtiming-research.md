# Timing sources for the next cells banks

These are performance measurements, not universal templates for a culture.
The existing playable banks are unchanged by this research. No new traditional
ensemble transcription is claimed here.

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
