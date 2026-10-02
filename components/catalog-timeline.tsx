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

function CatalogTimeline(
  { detail }: CatalogTimelineProps,
): React.JSX.Element {
  return (
    <ol className="timeline">
      {detail.timeline.map(
        turn => (
          <li key={`${detail.run.id}:${turn.batch}:${turn.turn}`} className="timeline-turn">
            {turn.content !== null && turn.content.length > 0 && <p>{turn.content}</p>}
            {turn.actions.map(

              action => (
                <div
                  key={action.id}
                  className={`timeline-call${REFUSED_DECISIONS.has(action.decision,

                  )
                    ? ' call-rejected'
                    : ''}`}
                >
                  <div className="card-meta">
                    <code>{action.tool}</code>
                    <Badge variant="outline">{action.decision}</Badge>
                    {action.memoryTitle !== null && <span>{action.memoryTitle}</span>}
                    {action.categoryLabel !== null && <span>{`-> ${action.categoryLabel}`}</span>}
                    {action.targetCategoryLabel !== null && <span>{`-> ${action.targetCategoryLabel}`}</span>}
                    {action.targetProject !== null && <span>{`-> ${action.targetProject}`}</span>}
                  </div>
                  {action.rationale !== null && <p className="muted">{action.rationale}</p>}
                  {action.policyReason !== null && (
                    <p className="muted">
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

interface RunTimelinePaginationProps {
  detail: RunDetail
  busy: boolean
  openRunDetail: (runId: string, offset?: number) => Promise<void>
  t: Messages
}

function RunTimelinePagination(
  { detail, busy, openRunDetail, t }: RunTimelinePaginationProps,
): React.JSX.Element {
  return (
    <div className="pagination">
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

interface RunRevertActionProps {
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
                <p className="muted">{detail.operatorPrompt}</p>
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

interface CatalogTimelineProps {
  detail: RunDetail
}

interface RunTimelineDialogProps {
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
