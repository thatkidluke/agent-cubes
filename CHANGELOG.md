# Changelog

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
