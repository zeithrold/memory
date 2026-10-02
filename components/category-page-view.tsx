'use client'
import type { CategoryDetail } from './category-types'
import type { useWorkspace } from './workspace-context'
import type { Messages } from '@/lib/i18n/messages'
import { ArrowLeft, FolderTree, ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import { perform } from './async-action'
import { CategoryChildDialog, ChildCategoryCard } from './category-children'
import { CategoryFields } from './category-fields'
import { MemoryList } from './category-memory-list'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

import { PageHeading, SetupBanner } from './workspace-shell'

export interface CategoryPageContentProps {
  t: Messages
  detail: CategoryDetail | null
  authState: ReturnType<typeof useWorkspace>['authState']
  error: string
  busy: boolean
  openChild: (childId: string, childOffset?: number) => Promise<void>
  load: (nextOffset: number) => Promise<void>
  offset: number
  childDetail: CategoryDetail | null
  setChildDetail: React.Dispatch<React.SetStateAction<CategoryDetail | null>>
}

interface CategoryMembersProps {
  detail: CategoryDetail
  t: Messages
  busy: boolean
  openChild: (childId: string, childOffset?: number) => Promise<void>
  load: (nextOffset: number) => Promise<void>
  offset: number
}

function CategoryMembers(
  { detail, t, busy, openChild, load, offset }: CategoryMembersProps,
): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{detail.category.label}</CardTitle>
          <CardDescription>{detail.category.slug}</CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryFields category={detail.category} t={t} />
        </CardContent>
      </Card>

      <ChildCategoryCard t={t} detail={detail} busy={busy} openChild={openChild} />

      <Card>
        <CardHeader>
          <CardTitle>{t.membersHere}</CardTitle>
          <CardDescription>{detail.total}</CardDescription>
        </CardHeader>
        <CardContent>
          <MemoryList
            detail={detail}
            t={t}
            busy={busy}
            onPrevious={() => perform(load(Math.max(0, offset - 30)), t.loadError)}
            onNext={() => perform(load(offset + 30), t.loadError)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
export function CategoryPageContent(props: CategoryPageContentProps): React.JSX.Element {
  return (
    <main className="page">
      <CategoryHeading t={props.t} detail={props.detail} />
      {props.authState === 'unconfigured' && <SetupBanner />}
      {props.error.length > 0 && (
        <div className="error-banner" role="alert">
          <ShieldAlert size={16} />
          {' '}
          {props.error}
        </div>
      )}
      {props.detail !== null && (
        <CategoryMembers
          detail={props.detail}
          t={props.t}
          busy={props.busy}
          openChild={props.openChild}
          load={props.load}
          offset={props.offset}
        />
      )}
      {props.detail === null && props.error.length === 0 && props.authState === 'ready' && (
        <div className="empty-state">
          <FolderTree size={28} />
          <h2>{props.t.categoryMissing}</h2>
        </div>
      )}

      <CategoryChildDialog
        childDetail={props.childDetail}
        setChildDetail={props.setChildDetail}
        t={props.t}
        busy={props.busy}
        openChild={props.openChild}
      />
    </main>
  )
}

function CategoryHeading(
  props: Pick<CategoryPageContentProps, 't' | 'detail'>,
): React.JSX.Element {
  return (
    <PageHeading
      section={props.t.catalog}
      title={props.detail?.category.label ?? props.t.catalog}
      intro={props.detail?.category.description ?? props.t.catalogIntro}
      action={(
        <Button variant="ghost" size="sm" asChild>
          <Link href="/catalog" prefetch={false}>
            <ArrowLeft size={16} />
            {props.t.backToCatalog}
          </Link>
        </Button>
      )}
    />
  )
}
