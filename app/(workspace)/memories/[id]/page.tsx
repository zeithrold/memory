import type { Metadata } from 'next'
import { MemoriesPage } from '@/components/dashboard'

export const metadata: Metadata = { title: 'Memory — Shared Memory' }
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <MemoriesPage memoryId={(await params).id} />
}
