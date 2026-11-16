// Building blocks of the panel: a titled card, a fixed grid of figures, an agent row,
// and how a call is labelled. Every function takes the surface's element table (`els`),
// since the constructors come from $.ui.resolve(e). No name here may be `h` or `Fragment`.
import type { BoxProps, ButtonProps, ElementConstructor, RenderChildren, TextProps } from 'claude-code'

import type { CallKind, CubeRun, CubeStatus } from '../../types'
import { agentColor, agentInitial, KIND_COLOR, MAIN_COLOR, PALETTE } from '../iso'

/** The elements the panel's blocks draw with: every surface has these. */
export type Els = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
}

export type Figure = [label: string, value: string, color?: string]

/** A titled card with an optional element at the title's right. */
export function card(els: Els, key: string, title: string, body: RenderChildren, aside?: RenderChildren) {
  const { Box, Text } = els
  return (
    <Box key={key} flexDirection="column" gap={1} borderStyle="round" borderDimColor paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Text size="caption" weight="semibold" dimColor>
          {title}
        </Text>
        {aside ?? null}
      </Box>
      {body}
    </Box>
  )
}

/** Label-over-value figures, `perRow` to a row. */
export function figures(els: Els, key: string, items: Figure[], perRow = 4) {
  const { Box, Text } = els
  const rows: Figure[][] = []
  for (let k = 0; k < items.length; k += perRow) rows.push(items.slice(k, k + perRow))
  return (
    <Box key={key} flexDirection="column" gap={1}>
      {rows.map((row, ri) => (
        <Box key={`${key}-r${ri}`} flexDirection="row">
          {row.map(([label, value, color]) => (
            <Box key={`${key}-${label}`} flexDirection="column" width={`${Math.floor(100 / perRow)}%`}>
              <Text size="caption" dimColor>
                {label}
              </Text>
              <Text weight="semibold" tabular color={color}>
                {value}
              </Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}

export type AgentRowProps = {
  key: string
  letter: string
  color: string
  name: string
  where: string
  doing: string
  dim: boolean
  onView: () => unknown
}

/** One agent: its letter, name, cube, what it does, and a button to view it. */
export function agentRow(els: Els, a: AgentRowProps) {
  const { Box, Text, Button } = els
  return (
    <Box key={a.key} flexDirection="row" alignItems="center" gap={1}>
      <Box width={2}>
        <Text color={a.color} weight="bold">
          {a.letter}
        </Text>
      </Box>
      <Box flexGrow={1} flexShrink={1}>
        <Text dimColor={a.dim}>{a.name}</Text>
      </Box>
      <Box width={11}>
        <Text dimColor tabular>
          {a.where}
        </Text>
      </Box>
      <Box width={14}>
        <Text dimColor>{a.doing}</Text>
      </Box>
      <Button key={`${a.key}-btn`} variant="secondary" onPress={a.onView}>
        Ansehen
      </Button>
    </Box>
  )
}

/** Who made a call: the main agent's H, or a subagent's letter in its colour. */
export function whoCalled(r: CubeRun, agentId: string): { letter: string; color: string } {
  if (!agentId) return { letter: 'H', color: MAIN_COLOR }
  const k = r.agents.findIndex(a => a.id === agentId)
  const a = r.agents[k]
  return a ? { letter: agentInitial(a.name), color: agentColor(k) } : { letter: '?', color: PALETTE.pending[1] }
}

export const glyphOf = (status: CubeStatus) => (status === 'error' ? '✕' : status === 'done' ? '■' : '▶')

export const callColor = (c: { status: CubeStatus; kind: CallKind }) =>
  c.status === 'error' ? PALETTE.error[1] : c.status === 'done' ? KIND_COLOR[c.kind] : PALETTE.running[1]
