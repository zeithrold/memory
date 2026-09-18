import type { Metadata } from 'next'
import CatalogCategoryPage from '@/components/catalog-category-page'

export const metadata: Metadata = { title: 'Category — Shared Memory' }
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <CatalogCategoryPage categoryId={(await params).id} />
}
