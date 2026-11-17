# Changelog

## 0.15.2

- Code clean-up without a change in behaviour: every drawing is byte for byte what it was. What was written
  several times now stands once: the kind of work of a call, the type of a drawing, the cutting of long texts, the
  signal colours and the themed SVG frame of the cards. In the panel one function draws the scene for the pane and
  the export, one centres a drawing, and one saves a file.

## 0.15.1

- The orbit view is drawn in more detail: stars and a faint glow around the system, a sun with a corona that
  turns, a surface and the tool the main agent is using under the figure; an instrument ring whose segment in work
  fills as far as the step has come, with a spark running along it; planets as lit spheres with bands, a ring or
  craters, their names below them and a trail behind them, larger in front and smaller behind; a comet with a
  glowing head; marks where finished subagents dock, and the count of failed calls on the sun.

## 0.15.0

- A third view, the orbit: the main agent as a sun with the plan as a ring of segments around it, its latest calls
  as a comet, and every subagent as a planet that travels while it works and docks once it is done.
- A timeline card: the task as a band of time, a stroke per call in the colour of its kind of work, with the
  subagents in a lane of their own, waiting in amber, the steps underneath and the longest pause named.
- A files card: a tile per file the calls named, grouped by folder, wider the busier the file was, with the lines
  changed or the number of reads. For this a call now also keeps the name of the folder its file lies in.
- A finale when the last step is done: a wave of light runs over the cubes and sparks rise from each; on the board
  the parts flash in turn as the light runs along the traces; in the orbit the ring lights up and a wave runs out.
- The details card speaks of chips or steps where the view does.

## 0.14.2

- The finer kinds of work (browser, planning, tools of connected servers) now show everywhere, not only in the
  summary: the live feed has an icon for each, and the mini cubes, the board's LEDs, the cube details and the
  legend use the same colours.
- In the text version of the agents list, what an agent does takes the room that is left and is cut with an
  ellipsis; it had a fixed width.

## 0.14.1

- The progress bar's label follows the language; it was German in every language.
- With the circuit board as the view the panel speaks of chips, not cubes.
- The summary's kinds of work tell three more apart, so "Other" is no longer most of the bar: work in a browser,
  planning, and the tools of connected servers.
- The summary leaves out Code and Tests when the task changed no lines and ran no tests.

## 0.14.0

- The scenes stand free: no skin draws a backdrop any more, so the cube machine sits directly on the pane and the
  panel reads as one piece. The day versions of the backdrops go with them; what is written beside the pedestal
  turns dark on a light pane. The robot factory's arm stands on a post behind the cube, where it hung from a
  ceiling rail. Drawings are a little smaller as well.
- The drawings keep one axis: the summary, the tiles, NOW, AGENTS and LIVE sit centred like the scene above them,
  where they used to stay at the left and drift apart from it in a wide pane.

## 0.13.3

- The context tank's foot is drawn right: the glass stands on a metal foot with a soft shadow, where the
  lower cap used to be painted over the glass and looked out of place.

## 0.13.2

- Code tidied, nothing visible changed: what the drawings show (the steps, their folding, colours and words)
  now lives in its own module beside the cube drawing, and the panel's figures and live infos are built in
  modules of their own. Every drawing and the whole panel were compared before and after.

## 0.13.1

- README and images brought up to date: an animated demo of the circuit board, a gallery of the five solder masks,
  the test report, a hero that names both views; every image drawn afresh from the current code. Plugin and
  marketplace descriptions name both views.

## 0.13.0

The circuit board grows up:

- Dependencies as thin amber traces from the step waited for to the one that waits, with a diode on the waiting
  part that turns green when it is free.
- Agents travel along the traces when they move to another part.
- Signals: a blinking push button on a part that waits for you, smoke over one that is stuck, and a wave of
  light over every trace when the task is done.
- The display also shows a scope of the calls per minute, the cost and the time left.
- Parts by kind of step (processor, memory, test IC, lens, ROM, regulator, port), sized by the work expected of
  the step, with the step's name in silkscreen under each.
- Five solder masks from a new Board dropdown: green, black and gold, blue, white, red.
- A `defaultView` setting; the widget shows a tiny board when the board is the view.
- The summary of a finished task as a test report in the board's style.

## 0.12.0

- A second view: the circuit board. A **View** dropdown at the top of the panel switches between the cubes and
  the board, and the pick is remembered. On the board every step is a chip with a row of LEDs for its calls,
  coloured by the kind of work, and a status LED; copper traces join the chips in order, wind from row to row,
  glow once a step is done and carry pulses into the chip in work. Agents sit on their chip as probes; a display
  module shows the whole task, the chips done and the context window. Errors, stuck steps, test runs, times and
  changed lines show on the chip. The export saves the view that is showing. The widget stays with the cubes.

## 0.11.2

- Plans of up to sixteen steps now really show every cube: finished steps at the start folded into a stack
  from eleven steps on, although two rows had room for them all.
- In two rows the progress pipe has a coupling for every cube of the task, not only for the front row.
- The alternative texts of the Now, Agents and Live drawings follow the panel language.
- Cleaned up: the unused finish-flag option, the track colours the pipe replaced, a clock parameter without
  effect. CI installs a fixed Claude Code version.

## 0.11.1

- README: a section on the scene and what each part of the drawing tells; features, skins and settings brought
  up to date. Plugin and marketplace descriptions to match.

## 0.11.0

- Mood lights: a warm spot falls on a step that waits for you, a stuck step glows red with a faint red edge
  round the scene, and the light turns calm and bright once every step is done.
- The newest mini cube drops into its cube only when its call has just ended, instead of with every new
  picture.
- Agents move visibly: the main agent flies over to the step it starts, a new subagent flies from the main
  agent's step to its own.
- Reflections of the cubes on a deeper, polished pedestal top.
- A step that is done fuses: its mini cubes melt into the block, a light edge runs round it, and its plaque
  flips like a split-flap sign.
- A step freed from the steps it waited for: its padlock springs open, rises and fades.
- The context tank in the style of the progress pipe: the skin's liquid, metal caps, bubbles.
- Day versions of the dark skins (Cyber, Cyberpunk, Stellar, Retro, Steampunk, Robot factory): in light mode
  a light sky with a pattern in the skin's spirit replaces the night backdrop.
- Two rows for long plans: from eight cubes on, the earlier steps stand in a raised back row behind the later
  ones, so the cubes stay large; up to sixteen before steps fold.

## 0.10.2

- Steadier animations. A cube picture coming back from the cache (one state, another, the first again)
  now starts its animations where the clock is, instead of where they were long ago. Cost and context keep
  their last value when a reading fails, so they no longer flicker to "–" and redraw the panel. New
  pictures start a moment ahead, as the pane takes that long to show them.
- An animated demo in the README: a sample task playing out from the first call to the last cube.

## 0.10.1

- The clock on the Elapsed tile no longer jumps back and forth. Its hand turned on its own and restarted
  with every new picture of the tiles; now it stands still and points where the ring ends.

## 0.10.0

- The progress has a band of its own at the pedestal's foot: a glass pipe in a recessed channel, with metal
  couplings where one step ends and the next begins and caps at both ends. What flows in it suits the skin:
  glowing energy with pulses running through it (Cyber, Stellar, Cyberpunk), a liquid with a drifting sheen
  and rising bubbles (Classic, Steampunk, Robot factory), pixel blocks (Retro) or a calm flat fill (Minimal).
  The old line on the pedestal top and its finish flag are gone.
- More grown-up skins:
  - Retro is an arcade cabinet at night now: phosphor colours, scanlines, a soft CRT vignette, a pixel
    horizon. The "?" blocks, coins, clouds and green hills are gone.
  - Steampunk is a Victorian instrument case: no more gears between the plaques or pressure gauge, quieter
    backdrop gears, muted tints.
  - Robot factory in graphite steel: robot arms, valves and crates without the cartoon colours, a muted safety
    yellow, coolant in the pipe.
  - Cyberpunk: neon signs with fine lettering strokes, a darker sky, less haze, finer rain, neutral mini cubes.

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
