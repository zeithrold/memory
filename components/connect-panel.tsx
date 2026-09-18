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
  const codex = `[mcp_servers.shared_memory]\nurl = "${origin}/mcp"\nbearer_token_env_var = "MEMORY_API_TOKEN"`
  const cursor = JSON.stringify({ mcpServers: { shared_memory: { url: `${origin}/mcp`, headers: { Authorization: `Bearer $${'{env:MEMORY_API_TOKEN}'}` } } } }, null, 2)
  const skillInstall = `npx skills add zeithrold/memory --skill shared-memory -g`
  return (
    <div className="connect-grid">
      <section className="connection-card">
        <h2>{t.endpoint}</h2>
        <code>
          {origin}
          /mcp
        </code>
        <p>{t.tokenSafety}</p>
      </section>
      <section className="connection-card">
        <div className="section-heading">
          <h2>{t.chatgpt}</h2>
          <CopyButton value={`${origin}/mcp`} t={t} />
        </div>
        <p>{t.chatgptBody}</p>
        <code>
          {origin}
          /mcp
        </code>
      </section>
      {[{ name: 'Codex', text: codex }, { name: 'Cursor', text: cursor }].map(item => (
        <section key={item.name} className="connection-card">
          <div className="section-heading">
            <h2>{item.name}</h2>
            <CopyButton value={item.text} t={t} />
          </div>
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
