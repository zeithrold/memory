'use client'

import type { Messages } from '@/lib/i18n/messages'
import { Copy } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { Button } from './ui/button'

function CopyButton({ value, t }: { value: string, t: Messages }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true)).catch(() => toast.error(t.copyFailed))
      }}
    >
      <Copy size={14} />
      {copied ? t.copied : t.copy}
    </Button>
  )
}

export function ConnectPanel({ t }: { t: Messages }) {
  const origin = useSyncExternalStore(() => () => undefined, () => window.location.origin, () => 'https://your-memory.example')
  const mcpUrl = `${origin}/mcp`
  const codex = `codex mcp add shared_memory --url ${mcpUrl}`
  const cursor = JSON.stringify({ mcpServers: { shared_memory: { url: mcpUrl } } }, null, 2)
  const skillInstall = `npx skills add zeithrold/memory --skill shared-memory -g`
  return (
    <div className="connect-grid">
      <section className="connection-card">
        <h2>{t.endpoint}</h2>
        <code>{mcpUrl}</code>
        <p>{t.tokenSafety}</p>
      </section>
      <section className="connection-card">
        <div className="section-heading">
          <h2>{t.chatgpt}</h2>
          <CopyButton value={mcpUrl} t={t} />
        </div>
        <p>{t.chatgptBody}</p>
        <code>{mcpUrl}</code>
      </section>
      {[{ name: 'Codex', text: codex, body: t.oauthConnectBody }, { name: 'Cursor', text: cursor, body: t.oauthConnectBody }].map(item => (
        <section key={item.name} className="connection-card">
          <div className="section-heading">
            <h2>{item.name}</h2>
            <CopyButton value={item.text} t={t} />
          </div>
          <p>{item.body}</p>
          <pre>{item.text}</pre>
        </section>
      ))}
      <section className="connection-card">
        <div className="section-heading">
          <h2>{t.skill}</h2>
          <CopyButton value={skillInstall} t={t} />
        </div>
        <p>{t.skillBody}</p>
        <pre>{skillInstall}</pre>
      </section>
      <section className="connection-card">
        <h2>{t.plugin}</h2>
        <p>{t.pluginBody}</p>
        <code>pnpm plugin:build</code>
      </section>
      <section className="connection-card">
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
