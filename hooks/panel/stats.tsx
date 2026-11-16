// The folded STATISTIK card: figures across the stored runs.
import { tr } from '../i18n'
import type { RunStats } from '../model'
import { PALETTE } from '../iso'
import { card, figures, type Els } from './blocks'
import { fmtDuration, fmtUsd, sparkline } from './format'

export function statsCard(els: Els, stats: RunStats, open: boolean, onToggle: () => unknown) {
  const { Box, Text, Button } = els
  const body = open ? (
    <Box flexDirection="column" gap={1}>
      {figures(els, 'st', [
        [tr('Aufträge', 'Runs'), String(stats.runs)],
        [tr('Ø Dauer', 'Avg time'), fmtDuration(stats.avgMs)],
        [tr('Ø Kosten', 'Avg cost'), stats.avgUsd > 0 ? fmtUsd(stats.avgUsd) : '–'],
        [tr('Kosten gesamt', 'Total cost'), stats.totalUsd > 0 ? fmtUsd(stats.totalUsd) : '–'],
        [tr('Ø Würfel', 'Avg cubes'), stats.avgSteps.toFixed(1)],
        [tr('Ø Fehler', 'Avg errors'), stats.avgErrors.toFixed(1)],
      ], 3)}
      {stats.slowest && (
        <Text size="caption">
          {tr('Langsamster Schritt', 'Slowest step')}: {stats.slowest.title || tr('ohne Titel', 'untitled')} · {fmtDuration(stats.slowest.ms)}
        </Text>
      )}
      {stats.recentMs.length > 1 && (
        <Box flexDirection="row" gap={1}>
          <Text size="caption" dimColor>
            {tr(`Dauer der letzten ${stats.recentMs.length}:`, `Last ${stats.recentMs.length} durations:`)}
          </Text>
          <Text mono color={PALETTE.running[1]}>
            {sparkline(stats.recentMs)}
          </Text>
        </Box>
      )}
    </Box>
  ) : null
  return card(
    els,
    'card-stats',
    tr('STATISTIK', 'STATISTICS'),
    body,
    <Button key="stats-toggle" variant="secondary" onPress={onToggle}>
      {open ? tr('▾ Einklappen', '▾ Collapse') : tr('▸ Aufklappen', '▸ Expand')}
    </Button>,
  )
}
