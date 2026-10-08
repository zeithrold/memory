'use client'

import type { Messages } from '@/lib/i18n/messages'
import { Copy } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { Button } from './ui/button'

const CONNECT_GRID_CLASS = [
  'connect-grid grid grid-cols-[repeat(auto-fit,_minmax(min(100%,_320px),_1fr))] gap-4 items-stretch',
  '[&_.connection-card]:flex [&_.connection-card]:flex-col [&_.connection-card]:min-w-0',
  '[&_.connection-card]:h-full [&_.connection-card]:mb-0',
].join(' ')

const CONNECTION_CARD_CLASS = [
  'connection-card border border-border rounded-[12px] bg-card p-6 mb-6 [&_>_h2]:mt-0 [&_>_h2]:mx-0',
  '[&_>_h2]:mb-5 [&_>_:last-child]:mb-0 [&_p]:text-body [&_p]:text-muted-foreground [&_p]:leading-[1.8]',
  '[&_>_code]:text-control [&_>_code]:wrap-anywhere',
].join(' ')

const CONNECTION_CARD_CLASS_1 = [
  'connection-card border border-border rounded-[12px] bg-card p-6 mb-6 [&_>_h2]:mt-0 [&_>_h2]:mx-0',
  '[&_>_h2]:mb-5 [&_>_:last-child]:mb-0 [&_p]:text-body [&_p]:text-muted-foreground [&_p]:leading-[1.8]',
  '[&_>_code]:text-control [&_>_code]:wrap-anywhere',
].join(' ')

const SECTION_HEADING_CLASS = ['section-heading flex justify-between gap-4 items-center mb-5 [&_h2]:m-0'].join(' ')

const CONNECTION_CARD_CLASS_2 = [
  'connection-card border border-border rounded-[12px] bg-card p-6 mb-6 [&_>_h2]:mt-0 [&_>_h2]:mx-0',
  '[&_>_h2]:mb-5 [&_>_:last-child]:mb-0 [&_p]:text-body [&_p]:text-muted-foreground [&_p]:leading-[1.8]',
  '[&_>_code]:text-control [&_>_code]:wrap-anywhere',
].join(' ')

const SECTION_HEADING_CLASS_3 = ['section-heading flex justify-between gap-4 items-center mb-5 [&_h2]:m-0'].join(' ')

const CONNECTION_CARD_CLASS_4 = [
  'connection-card border border-border rounded-[12px] bg-card p-6 mb-6 [&_>_h2]:mt-0 [&_>_h2]:mx-0',
  '[&_>_h2]:mb-5 [&_>_:last-child]:mb-0 [&_p]:text-body [&_p]:text-muted-foreground [&_p]:leading-[1.8]',
  '[&_>_code]:text-control [&_>_code]:wrap-anywhere',
].join(' ')

const SECTION_HEADING_CLASS_5 = ['section-heading flex justify-between gap-4 items-center mb-5 [&_h2]:m-0'].join(' ')

const CONNECTION_CARD_CLASS_6 = [
  'connection-card border border-border rounded-[12px] bg-card p-6 mb-6 [&_>_h2]:mt-0 [&_>_h2]:mx-0',
  '[&_>_h2]:mb-5 [&_>_:last-child]:mb-0 [&_p]:text-body [&_p]:text-muted-foreground [&_p]:leading-[1.8]',
  '[&_>_code]:text-control [&_>_code]:wrap-anywhere',
].join(' ')

const CONNECTION_CARD_CLASS_7 = [
  'connection-card border border-border rounded-[12px] bg-card p-6 mb-6 [&_>_h2]:mt-0 [&_>_h2]:mx-0',
  '[&_>_h2]:mb-5 [&_>_:last-child]:mb-0 [&_p]:text-body [&_p]:text-muted-foreground [&_p]:leading-[1.8]',
  '[&_>_code]:text-control [&_>_code]:wrap-anywhere',
].join(' ')

type CopyButtonProps = { value: string, t: Messages }

function CopyButton(
  { value, t }: CopyButtonProps,
) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true)).catch(
          () => toast.error(t.copyFailed),
        )
      }}
    >
      <Copy size={14} />
      {copied ? t.copied : t.copy}
    </Button>
  )
}

type ConnectPanelProps = { t: Messages }

type ConnectionInstructionsProps = {
  t: Messages
  mcpUrl: string
  codex: string
  cursor: string
  skillInstall: 'npx skills add zeithrold/memory --skill shared-memory -g'
  origin: string
}

function ConnectionInstructions(
  { t, mcpUrl, codex, cursor, skillInstall, origin }: ConnectionInstructionsProps,
): React.JSX.Element {
  return (
    <div className={CONNECT_GRID_CLASS}>
      <section className={CONNECTION_CARD_CLASS}>
        <h2>{t.endpoint}</h2>
        <code>{mcpUrl}</code>
        <p>{t.tokenSafety}</p>
      </section>
      <section className={CONNECTION_CARD_CLASS_1}>
        <div className={SECTION_HEADING_CLASS}>
          <h2>{t.chatgpt}</h2>
          <CopyButton value={mcpUrl} t={t} />
        </div>
        <p>{t.chatgptBody}</p>
        <code>{mcpUrl}</code>
      </section>
      {[
        { name: 'Codex', text: codex, body: t.oauthConnectBody },
        { name: 'Cursor', text: cursor, body: t.oauthConnectBody },
      ].map(item => (
        <section
          key={item.name}
          className={CONNECTION_CARD_CLASS_2}
        >
          <div className={SECTION_HEADING_CLASS_3}>
            <h2>{item.name}</h2>
            <CopyButton value={item.text} t={t} />
          </div>
          <p>{item.body}</p>
          <pre tabIndex={0}>{item.text}</pre>
        </section>
      ))}
      <section className={CONNECTION_CARD_CLASS_4}>
        <div className={SECTION_HEADING_CLASS_5}>
          <h2>{t.skill}</h2>
          <CopyButton value={skillInstall} t={t} />
        </div>
        <p>{t.skillBody}</p>
        <pre tabIndex={0}>{skillInstall}</pre>
      </section>
      <section className={CONNECTION_CARD_CLASS_6}>
        <h2>{t.plugin}</h2>
        <p>{t.pluginBody}</p>
        <code>pnpm plugin:build</code>
      </section>
      <section className={CONNECTION_CARD_CLASS_7}>
        <h2>{t.deepseek}</h2>
        <p>{t.deepseekBody}</p>
        <code>
          POST
          {origin}
          /api/v1/search
        </code>
      </section>
    </div>
  )
}
export function ConnectPanel({ t }: ConnectPanelProps): React.JSX.Element {
  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => 'https://your-memory.example',
  )
  const mcpUrl = `${origin}/mcp`
  const codex = `codex mcp add shared_memory --url ${mcpUrl}`
  const cursor = JSON.stringify({ mcpServers: { shared_memory: { url: mcpUrl } } }, null, 2)
  const skillInstall = `npx skills add zeithrold/memory --skill shared-memory -g`
  return (
    <ConnectionInstructions
      t={t}
      mcpUrl={mcpUrl}
      codex={codex}
      cursor={cursor}
      skillInstall={skillInstall}
      origin={origin}
    />
  )
}
