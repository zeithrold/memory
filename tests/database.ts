import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { SQLiteBinding } from './sqlite-binding'

// The adapter executes real migrations and preserves D1's generic query API.
// Tests exercise SQLite semantics; remote D1 remains a deployment smoke check.
export function database(
  options: { through?: string } = {},
): { db: D1Database, sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:')
  const directory = new URL('../migrations/', import.meta.url)
  const files = readdirSync(directory)
    .filter(name => name.endsWith('.sql'))
    .filter(name => options.through === undefined || name <= options.through)
    .sort()
  for (const file of files) {
    sqlite.exec(readFileSync(new URL(file, directory), 'utf8'))
  }
  return { db: new SQLiteBinding(sqlite), sqlite }
}
