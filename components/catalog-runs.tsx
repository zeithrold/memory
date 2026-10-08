'use client'

import type { RunSummary } from './catalog-types'
import type { Messages } from '@/lib/i18n/messages'
import { perform } from './async-action'

import { RUNS_PAGE } from './catalog-constants'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from './ui/card'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'

const MUTED_CLASS = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_1 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_2 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const PLACE_SELF_CLASS = [
  '[place-self:start_start] p-0 border-0 bg-transparent text-primary text-control font-[550] text-left',
  'hover:underline hover:underline-offset-[3px]',
].join(' ')

function CatalogRunTable({ t, runs, openRunDetail }: CatalogRunTableProps): React.JSX.Element {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.created}</TableHead>
          <TableHead>{t.runStatus}</TableHead>
          <TableHead>{t.trigger}</TableHead>
          <TableHead>{t.turns}</TableHead>
          <TableHead>{t.toolCalls}</TableHead>
          <TableHead>{t.rejectedCalls}</TableHead>
          <TableHead>{t.actionsApplied}</TableHead>
          <TableHead>{t.modelTokens}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map(row => (
          <TableRow key={row.id}>
            <TableCell>
              <button
                type="button"
                className={PLACE_SELF_CLASS}
                onClick={() => perform(openRunDetail(row.id), t.loadError)}
              >
                {new Date(row.startedAt).toLocaleString()}
              </button>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                {row.mode === 'dry_run' && <Badge variant="outline">{t.dryRun}</Badge>}
                <span>{row.status}</span>
                {row.errorCode !== null && <span className={MUTED_CLASS}>{row.errorCode}</span>}
              </div>
            </TableCell>
            <TableCell>{row.trigger}</TableCell>
            <TableCell>{row.turns}</TableCell>
            <TableCell>{row.toolCalls}</TableCell>
            <TableCell>{row.rejected}</TableCell>
            <TableCell>{row.actionsApplied}</TableCell>
            <TableCell>
              {row.totalTokens?.toLocaleString() ?? '—'}
              {!row.tokenUsageComplete && <span className={MUTED_CLASS_1}> *</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function CatalogRunsCard(
  props: CatalogRunsCardProps,
): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.t.runs}</CardTitle>
        <CardAction>
          <Button size="sm" variant="ghost" onClick={() => perform(props.load(props.runsOffset), props.t.loadError)}>
            {props.t.refresh}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {props.runs.length === 0

          ? <p className={MUTED_CLASS_2}>{props.t.noRuns}</p>

          : (
              <CatalogRunTable t={props.t} runs={props.runs} openRunDetail={props.openRunDetail} />
            )}
        {(props.runsOffset > 0 || props.runsOffset + props.runs.length < props.runsTotal)

          && (
            <div className="pagination flex justify-end gap-3 mt-8">
              <Button
                variant="ghost"
                disabled={props.runsOffset === 0 || props.busy}
                onClick={() => perform(props.load(Math.max(0, props.runsOffset - RUNS_PAGE)), props.t.loadError)}
              >
                {props.t.previous}
              </Button>
              <Button
                variant="ghost"
                disabled={props.runsOffset + props.runs.length >= props.runsTotal || props.busy}
                onClick={() => perform(props.load(props.runsOffset + RUNS_PAGE), props.t.loadError)}
              >
                {props.t.next}
              </Button>
            </div>
          )}
      </CardContent>
    </Card>
  )
}

type CatalogRunTableProps = {
  t: Messages
  runs: RunSummary[]
  openRunDetail: (runId: string, offset?: number) => Promise<void>
}

type CatalogRunsCardProps = {
  t: Messages
  load: (nextRunsOffset: number) => Promise<void>
  runsOffset: number
  runs: RunSummary[]
  openRunDetail: (runId: string, offset?: number) => Promise<void>
  runsTotal: number
  busy: boolean
}
