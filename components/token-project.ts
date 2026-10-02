export function tokenProject(data: FormData): string | null {
  const value = data.get('project')
  const project = typeof value === 'string' ? value.trim() : ''
  return project.length === 0 ? null : project
}
