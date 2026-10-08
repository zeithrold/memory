'use client'
import type { Metrics } from './catalog-types'
import type { Messages } from '@/lib/i18n/messages'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'

const MUTED_CLASS = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

function CatalogMetricsTable({ t, metrics }: CatalogMetricsTableProps): React.JSX.Element {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.day}</TableHead>
          <TableHead>{t.runs}</TableHead>
          <TableHead>{t.actionsApplied}</TableHead>
          <TableHead>{t.rejectedCalls}</TableHead>
          <TableHead>{t.unclassified}</TableHead>
          <TableHead>{t.modelTokens}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {metrics.daily.slice(0, 14).map(row => (
          <TableRow key={row.day}>
            <TableCell>{row.day}</TableCell>
            <TableCell>{row.runs}</TableCell>
            <TableCell>{row.applied}</TableCell>
            <TableCell>{row.rejected}</TableCell>
            <TableCell>{row.orphan_count}</TableCell>
            <TableCell>
              {(row.prompt_tokens + row.completion_tokens).toLocaleString()}
              {row.usage_missing_turns > 0 && <span className={MUTED_CLASS}> *</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function CatalogMetricsCard(
  { t, metrics }: CatalogMetricsCardProps,
): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.metrics}</CardTitle>
        <CardDescription>{t.metricsNote}</CardDescription>
      </CardHeader>
      <CardContent>
        <CatalogMetricsTable t={t} metrics={metrics} />
      </CardContent>
    </Card>
  )
}

type CatalogMetricsTableProps = {
  t: Messages
  metrics: Metrics
}

type CatalogMetricsCardProps = {
  t: Messages
  metrics: Metrics
}
