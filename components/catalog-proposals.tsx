'use client'
import type { Proposal } from './catalog-types'
import type { Api } from './workspace-shell'
import type { Messages } from '@/lib/i18n/messages'
import {
  ignoredResponse,
} from './api-schemas'
import { perform } from './async-action'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

const MUTED_CLASS = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const CARD_ACTIONS_CLASS = ['card-actions flex items-center gap-1 flex-wrap'].join(' ')

const CARD_ACTIONS_CLASS_1 = ['card-actions flex items-center gap-1 flex-wrap'].join(' ')

const MUTED_CLASS_2 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const RUN_LIST_CLASS = [
  'run-list list-none p-0 m-0 grid gap-4 [&_>_li]:bg-card [&_>_li]:border [&_>_li]:border-border',
  '[&_>_li]:rounded-md [&_>_li]:p-6 [&_p]:my-2 [&_p]:mx-0 [&_p]:text-body',
].join(' ')

const CARD_META_CLASS = [
  'card-meta flex items-center gap-2 text-help text-muted-foreground [&_time]:ml-auto wrap-anywhere',
].join(' ')

function CatalogProposalList(props: CatalogProposalListProps): React.JSX.Element {
  return (
    <ul className={RUN_LIST_CLASS}>
      {props.proposals.map(proposal => (
        <li key={proposal.id}>
          <div className={CARD_META_CLASS}>
            <Badge variant="outline">{proposal.kind}</Badge>
            <span className={MUTED_CLASS}>
              {props.t.evidence}
              {': '}
              {proposal.evidenceRuns}
            </span>
          </div>
          {proposal.rationale !== null && <p>{proposal.rationale}</p>}
          {props.proposalsSplit && (
            <div className={CARD_ACTIONS_CLASS}>
              <Button
                size="sm"
                disabled={props.busy}
                onClick={() => perform(props.run(async () => {
                  await props.api(`catalog/proposals/${proposal.id}`, ignoredResponse, {
                    method: 'POST',
                    body: JSON.stringify({ decision: 'approve' }),
                  })
                  await props.load(props.runsOffset)
                }, props.t.proposalDone), props.t.loadError)}
              >
                {props.t.approve}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={props.busy}
                onClick={() => perform(props.run(async () => {
                  await props.api(`catalog/proposals/${proposal.id}`, ignoredResponse, {
                    method: 'POST',
                    body: JSON.stringify({ decision: 'reject' }),
                  })
                  await props.load(props.runsOffset)
                }, props.t.proposalDone), props.t.loadError)}
              >
                {props.t.reject}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

type ProposalPackageActionsProps = {
  props: CatalogProposalsCardProps
}

function ProposalPackageActions({ props }: ProposalPackageActionsProps): React.JSX.Element {
  return (
    <div className={CARD_ACTIONS_CLASS_1}>
      <Button
        size="sm"
        disabled={props.busy}
        onClick={() => perform(
          props.decideBulk('approve'),
          props.t.loadError,
        )}
      >
        {props.t.acceptPackage}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={props.busy}
        onClick={() => perform(props.decideBulk('reject'), props.t.loadError)}
      >
        {props.t.rejectPackage}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={props.busy}
        onClick={() => props.setAdviceDialog(true)}
      >
        {props.t.rejectWithAdvice}
      </Button>
    </div>
  )
}
export function CatalogProposalsCard(
  props: CatalogProposalsCardProps,
): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.t.proposals}</CardTitle>
        <CardDescription>{props.t.packageHint}</CardDescription>
        {props.proposals.length > 0 && (
          <CardAction>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => props.setProposalsSplit(value => !value)}
            >
              {props.proposalsSplit ? props.t.joinProposals : props.t.splitProposals}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {props.proposals.length === 0

          ? <p className={MUTED_CLASS_2}>{props.t.noProposals}</p>

          : (
              <>
                {!props.proposalsSplit

                  && (
                    <ProposalPackageActions props={props} />
                  )}
                <CatalogProposalList
                  proposals={props.proposals}
                  t={props.t}
                  proposalsSplit={props.proposalsSplit}
                  busy={props.busy}
                  run={props.run}
                  api={props.api}
                  load={props.load}
                  runsOffset={props.runsOffset}
                />
              </>
            )}
      </CardContent>
    </Card>
  )
}

type CatalogProposalListProps = {
  proposals: Proposal[]
  t: Messages
  proposalsSplit: boolean
  busy: boolean
  run: (action: () => Promise<void>, done?: string) => Promise<void>
  api: Api
  load: (nextRunsOffset: number) => Promise<void>
  runsOffset: number
}

type CatalogProposalsCardProps = {
  t: Messages
  proposals: Proposal[]
  setProposalsSplit: React.Dispatch<React.SetStateAction<boolean>>
  proposalsSplit: boolean
  busy: boolean
  decideBulk: (decision: 'approve' | 'reject', advice?: string) => Promise<void>
  setAdviceDialog: React.Dispatch<React.SetStateAction<boolean>>
  run: (action: () => Promise<void>, done?: string) => Promise<void>
  api: Api
  load: (nextRunsOffset: number) => Promise<void>
  runsOffset: number
}
