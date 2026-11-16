// The folded STATISTIK card: figures across the stored runs.
import type { RunStats } from '../model'
import { PALETTE } from '../iso'
import { card, figures, type Els } from './blocks'
import { fmtDuration, fmtUsd, sparkline } from './format'

export function statsCard(els: Els, stats: RunStats, open: boolean, onToggle: () => unknown) {
  const { Box, Text, Button } = els
  const body = open ? (
    <Box flexDirection="column" gap={1}>
      {figures(els, 'st', [
        ['Aufträge', String(stats.runs)],
        ['Ø Dauer', fmtDuration(stats.avgMs)],
        ['Ø Kosten', stats.avgUsd > 0 ? fmtUsd(stats.avgUsd) : '–'],
        ['Kosten gesamt', stats.totalUsd > 0 ? fmtUsd(stats.totalUsd) : '–'],
        ['Ø Würfel', stats.avgSteps.toFixed(1)],
        ['Ø Fehler', stats.avgErrors.toFixed(1)],
      ], 3)}
      {stats.slowest && (
        <Text size="caption">
          Langsamster Schritt: {stats.slowest.title || 'ohne Titel'} · {fmtDuration(stats.slowest.ms)}
        </Text>
      )}
      {stats.recentMs.length > 1 && (
        <Box flexDirection="row" gap={1}>
          <Text size="caption" dimColor>
            Dauer der letzten {stats.recentMs.length}:
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
    'STATISTIK',
    body,
    <Button key="stats-toggle" variant="secondary" onPress={onToggle}>
      {open ? '▾ Einklappen' : '▸ Aufklappen'}
    </Button>,
  )
}
