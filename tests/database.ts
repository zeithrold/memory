import type { SQLInputValue } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

// SQLite executes the real D1 migrations and triggers in filename order. This
// adapter only mirrors the D1 binding API; remote D1 behavior still has a
// separate deployment smoke test.
export function database(): { db: D1Database, sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:')
  const directory = new URL('../migrations/', import.meta.url)
  for (const file of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file, directory), 'utf8'))
  }
  function prepare(sql: string, params: SQLInputValue[] = []) {
    return {
      bind(...values: SQLInputValue[]) {
        return prepare(sql, values)
      },
      async first<T>(column?: string): Promise<T | null> {
        const row = sqlite.prepare(sql).get(...params)
        return (row ? (column !== undefined ? row[column] : row) : null) as T | null
      },
      async all<T>() {
        return {
          results: sqlite.prepare(sql).all(...params) as T[],
          success: true,
        }
      },
      async run() {
        const result = sqlite.prepare(sql).run(...params)
        return {
          success: true,
          results: [],
          meta: {
            changes: Number(result.changes),
            last_row_id: Number(result.lastInsertRowid),
          },
        }
      },
    }
  }
  const binding = {
    prepare,
    async batch(statements: { run: () => Promise<unknown> }[]) {
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.run())
        sqlite.exec('COMMIT')
        return results
      }
      catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  }
  return { db: binding as unknown as D1Database, sqlite }
}
