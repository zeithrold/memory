'use client'

import type { RunDetail } from './catalog-types'
import type { Api } from './workspace-shell'
import type { Messages } from '@/lib/i18n/messages'
import { ShieldAlert } from 'lucide-react'
import {
  ignoredResponse,
} from './api-schemas'
import { perform } from './async-action'
import { REFUSED_DECISIONS, STEPS_PAGE } from './catalog-constants'
import { ConfirmAction } from './confirm-action'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

const MUTED_CLASS = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_1 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_2 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const TIMELINE_TURN_CLASS = [
  'timeline-turn border-l-2 border-border pl-4 [&_>_p]:mt-0 [&_>_p]:mx-0 [&_>_p]:mb-3 [&_>_p]:text-body',
  '[&_>_p]:text-muted-foreground',
].join(' ')

const TIMELINE_CALL_CLASS = [
  'timeline-call border border-border rounded-md p-3 mb-2 bg-card [&_p]:mt-2 [&_p]:mx-0 [&_p]:mb-0',
  '[&_p]:text-body [&_p]:flex [&_p]:items-center [&_p]:gap-2 [&_code]:text-control',
].join(' ')

const CARD_META_CLASS = [
  'card-meta flex items-center gap-2 text-help text-muted-foreground [&_time]:ml-auto wrap-anywhere',
].join(' ')

function CatalogTimeline(
  { detail }: CatalogTimelineProps,
): React.JSX.Element {
  return (
    <ol className="timeline list-none p-0 m-0 grid gap-4">
      {detail.timeline.map(
        turn => (
          <li
            key={`${detail.run.id}:${turn.batch}:${turn.turn}`}
            className={TIMELINE_TURN_CLASS}
          >
            {turn.content !== null && turn.content.length > 0 && <p>{turn.content}</p>}
            {turn.actions.map(

              action => (
                <div
                  key={action.id}
                  className={`${TIMELINE_CALL_CLASS} ${REFUSED_DECISIONS.has(action.decision,

                  )
                    ? 'call-rejected border-destructive bg-[var(--rejected-background)]'
                    : ''}`}
                >
                  <div className={CARD_META_CLASS}>
                    <code>{action.tool}</code>
                    <Badge variant="outline">{action.decision}</Badge>
                    {action.memoryTitle !== null && <span>{action.memoryTitle}</span>}
                    {action.categoryLabel !== null && <span>{`-> ${action.categoryLabel}`}</span>}
                    {action.targetCategoryLabel !== null && <span>{`-> ${action.targetCategoryLabel}`}</span>}
                    {action.targetProject !== null && <span>{`-> ${action.targetProject}`}</span>}
                  </div>
                  {action.rationale !== null && <p className={MUTED_CLASS}>{action.rationale}</p>}
                  {action.policyReason !== null && (
                    <p className={MUTED_CLASS_1}>
                      <ShieldAlert size={14} />
                      {' '}
                      {action.policyReason}
                    </p>
                  )}
                </div>
              ),

            )}
          </li>
        ),
      )}
    </ol>
  )
}

type RunTimelinePaginationProps = {
  detail: RunDetail
  busy: boolean
  openRunDetail: (runId: string, offset?: number) => Promise<void>
  t: Messages
}

function RunTimelinePagination(
  { detail, busy, openRunDetail, t }: RunTimelinePaginationProps,
): React.JSX.Element {
  return (
    <div className="pagination flex justify-end gap-3 mt-8">
      <Button

        variant="ghost"

        disabled={detail.offset === 0 || busy}

        onClick={() => perform(openRunDetail(detail.run.id, Math.max(0, detail.offset - STEPS_PAGE)), t.loadError)}
      >
        {t.previous}
      </Button>
      <Button

        variant="ghost"

        disabled={detail.offset + detail.timeline.reduce((sum, turn) => sum + turn.actions.length, 0)
          >= detail.totalActions
          || busy}

        onClick={() => perform(openRunDetail(detail.run.id, detail.offset + STEPS_PAGE), t.loadError)}
      >
        {t.next}
      </Button>
    </div>
  )
}

type RunRevertActionProps = {
  props: RunTimelineDialogProps
  detail: RunDetail
}

function RunRevertAction({ props, detail }: RunRevertActionProps): React.JSX.Element {
  return (
    <ConfirmAction

      label={props.t.revertRun}

      description={props.t.revertConfirm}

      cancel={props.t.cancel}

      disabled={props.busy}

      onConfirm={() => perform(

        props.run(

          async () => {
            await props.api(`catalog/runs/${detail.run.id}/revert`, ignoredResponse, { method: 'POST' })
            props.setDetail(null)
            await props.load(props.runsOffset)
          },

          props.t.revertDone,

        ),

        props.t.loadError,

      )}

    />
  )
}
export function RunTimelineDialog(
  props: RunTimelineDialogProps,
): React.JSX.Element {
  const { detail } = props
  return (
    <Dialog
      open={detail !== null}
      onOpenChange={(open) => {
        if (!open) {
          props.setDetail(null)
        }
      }}
    >
      <DialogContent closeLabel={props.t.close} className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        {detail !== null

          && (
            <>
              <DialogHeader>
                <DialogTitle>{props.t.timeline}</DialogTitle>
                <DialogDescription>{new Date(detail.run.startedAt).toLocaleString()}</DialogDescription>
              </DialogHeader>
              {detail.operatorPrompt !== null && detail.operatorPrompt.length > 0 && (
                <p className={MUTED_CLASS_2}>{detail.operatorPrompt}</p>
              )}
              {detail.run.status !== 'running' && detail.run.mode === 'live' && detail.run.actionsApplied > 0

                && (
                  <RunRevertAction props={props} detail={detail} />
                )}
              <CatalogTimeline detail={detail} />
              {(detail.offset > 0

                || detail.offset + detail.timeline.reduce((sum, turn) => sum + turn.actions.length, 0)
                < detail.totalActions)

              && (
                <RunTimelinePagination
                  detail={detail}
                  busy={props.busy}
                  openRunDetail={props.openRunDetail}
                  t={props.t}
                />
              )}
            </>
          )}
      </DialogContent>
    </Dialog>
  )
}

type CatalogTimelineProps = {
  detail: RunDetail
}

type RunTimelineDialogProps = {
  detail: RunDetail | null
  setDetail: React.Dispatch<React.SetStateAction<RunDetail | null>>
  t: Messages
  busy: boolean
  run: (action: () => Promise<void>, done?: string) => Promise<void>
  api: Api
  load: (nextRunsOffset: number) => Promise<void>
  runsOffset: number
  openRunDetail: (runId: string, offset?: number) => Promise<void>
}
