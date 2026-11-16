# Changelog

## 0.9.2

- README: a Privacy and permissions section. What the plugin reads, every hook it uses and what it does, what
  it stores, and the files it writes only when you press a button. It sends nothing off your machine.

## 0.9.1

- A new README: a hero banner, the panel and the summary in light and dark, a gallery of all eight skins
  with a line on each, the features grouped, and the settings at a glance.

## 0.9.0

- No white flash: while work goes on, every drawing in the panel is shown as an image instead of in a frame
  of its own, which went blank for a moment each time it was replaced. Once the task is done the drawings
  turn interactive again, tooltips included.
- Overview tiles with a pictogram each, in a tinted badge: a clock, an hourglass, a cup, a glass cylinder, a
  warning sign, an activity chart, token bars, a stack of coins and diff blocks; a level bar along each foot.
- NOW, AGENTS and LIVE are drawings: the current step as a numbered badge with its progress and the agents
  on it; the agents as avatars with the cube they work on and what they do; the latest calls as a feed with
  an icon per kind of work and a mark for how each went. A button per agent still opens its transcript.
- The timeline card is gone.

## 0.8.2

- No more flicker. The drawings were made anew every second while work went on, and every new drawing
  restarted its animations. Now a drawing is only replaced when what it shows changes: times in the tiles
  show whole minutes while work goes on, levels move in steps of 5 %, the timeline moves in steps of ten
  seconds, and the agent badges no longer name the current tool.
- Endless animations are locked to the clock, so a drawing that does replace another carries on where the
  old one was.

## 0.8.1

- No figure twice: once a task is done and its summary shows, the overview keeps only context and tokens.
- The Cubes tile, which repeated the head line, is now Code: lines added and removed while the work goes on.

## 0.8.0

- The summary of a finished task is a picture now: a ring for the steps done beside time, cost, tool calls
  and subagents; bars for working versus waiting and for the kinds of work; code added and removed and tests
  passed and failed; and one bar per step, as long as it took and tinted by its kind (research, setup, work,
  tests, review, docs, shipping).
- The canister row is off by default, as the figure tiles show the same values; the new `gaugeRow` setting
  brings it back. The tiles are a little larger.
- Tiles and canisters follow the light or dark mode of the app: glass, labels and plain values switch colours,
  values over liquid stay white with a dark halo.
- Long values such as "≈ $1.20 / $5.00" shrink to fit their tile instead of running into the next one.

## 0.7.0

- Gauges in the overview: glass canisters that fill with liquid for progress, context, budget (or the share of
  tool calls without an error when no budget is set) and the share of time spent waiting. Their colour follows the
  state (calm, amber, red); while work goes on the surface moves and bubbles rise.
- The overview's figures are glass tiles now, each with a symbol and a liquid filled to its level: elapsed and
  time left against the estimated total, waiting share, context, error rate, cost against the budget, cubes done.
- The panel speaks English by default; set `language` to `de` for German.
- The repository is English throughout: settings, skin names and descriptions. The German README is gone; the
  panel itself still speaks German or English.

## 0.6.0

- New skin Cyberpunk: a rainy neon city at night with a lit skyline, flickering signs, a wet street and holo cubes.
  It replaces Alien cave.
- Robot factory, far more detailed: robot arms working over cubes in progress, welding sparks, turning gears,
  ceiling lamps with light cones, pipes with valve wheels and a steam vent, conveyor rollers, a control desk with
  blinking lights, braced steel crates.
- Fantasy quest removed. A stored pick of a removed skin falls back to Classic.

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
