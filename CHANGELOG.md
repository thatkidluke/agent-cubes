# Changelog

## 0.5.0

- Three new skins: Alien cave (glowing spores, rock with luminous veins, crystal cubes), Robot factory
  (conveyor belt, hazard stripes, warning lamps, steel crates) and Fantasy quest (meadow, stone blocks with
  torches, rune circles, wooden chests).
- Larger captions under the plaques: the time and the +/- line are now readable at a glance; the pedestal grows
  to fit them.

## 0.4.0

- Waiting time: how long the agents waited for you (questions, permission prompts), live in the overview,
  in the summary, the statistics and the data export.
- Summary card when a task is done, with a button that copies it as Markdown (for a pull request or a status note).
- Timeline: one lane per agent showing when it worked, waiting phases in amber.
- Cost budget per task (`budgetUsd`): the cost turns amber from 80 % and the status line warns once it is passed.
- Keys 1–9 open the first nine cubes' details while the panel has the keyboard.
- Data export: the stored tasks as CSV (one row per step) and JSON.
- The status line above the drawing is always one row, so the drawing no longer jumps when a question or a stuck
  step comes and goes.
- Releases: every new version in plugin.json is tagged and published on GitHub automatically.

## 0.3.0

- Estimates per kind of step: tests, review, research, docs, setup, shipping and other work are timed apart,
  learned from the current task and from earlier ones.
- English user interface: new `language` setting (`de` or `en`).
- Plugin icon; README in English and German with pictures of every skin.
- GitHub Actions check: validation and tests run on every push.
- Context tank and panel figure share one pair of thresholds: amber from 70 %, red from 85 %.
- Lighter state: only file base names are stored (about 21 % smaller per write).
- Cost and context are read once a second instead of on every redraw.
- One duration format for plaque and details (they rounded differently).
- Unused replay helpers removed; overlays moved to `hooks/overlays.ts`.

## 0.2.0

- Settings: default skin, auto-open, animations, stuck thresholds.
- Compact mode for long plans, still mode without animation, status symbols on the plaques.
- Panel code split into small modules; README and license.

## 0.1.0

- First release: cube timeline, agents, progress estimate, stuck detection, context tank, six skins, export.
