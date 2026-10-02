import type { DatabaseSync, SQLInputValue } from 'node:sqlite'

function input(value: unknown): SQLInputValue {
  if (value === null || typeof value === 'string' || typeof value === 'number'
    || typeof value === 'bigint') {
    return value
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  throw new TypeError('Unsupported SQLite binding value.')
}

function metadata(changes = 0, lastRowId = 0): D1Meta & Record<string, unknown> {
  return {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: changes,
    last_row_id: lastRowId,
    changed_db: changes > 0,
    changes,
  }
}

class SQLiteStatement implements D1PreparedStatement {
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly sql: string,
    private readonly params: SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new SQLiteStatement(this.sqlite, this.sql, values.map(input))
  }

  // Like D1, query callers specify the row type. The implementation deals only
  // in SQLite values; overloads express that protocol without narrowing casts.
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>
  async first(column?: string): Promise<unknown> {
    const row = this.sqlite.prepare(this.sql).get(...this.params)
    if (row === undefined) {
      return await Promise.resolve(null)
    }
    return await Promise.resolve(column === undefined ? row : row[column])
  }

  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
  async all(): Promise<D1Result<unknown>> {
    return await Promise.resolve({
      results: this.sqlite.prepare(this.sql).all(...this.params),
      success: true,
      meta: metadata(),
    })
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const result = this.sqlite.prepare(this.sql).run(...this.params)
    return await Promise.resolve({
      success: true,
      results: [],
      meta: metadata(Number(result.changes), Number(result.lastInsertRowid)),
    })
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>
  async raw(options?: { columnNames?: boolean }): Promise<unknown[]> {
    const statement = this.sqlite.prepare(this.sql)
    const rows = statement.all(...this.params).map(row => Object.values(row))
    return await Promise.resolve(options?.columnNames === true
      ? [
          statement.columns().map(col => col.name),
          ...rows,
        ]
      : rows)
  }
}

export class SQLiteBinding implements D1Database, D1DatabaseSession {
  constructor(private readonly sqlite: DatabaseSync) {}

  prepare(sql: string): D1PreparedStatement {
    return new SQLiteStatement(this.sqlite, sql)
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.sqlite.exec('BEGIN')
    try {
      const results: D1Result<T>[] = []
      for (const statement of statements) {
        results.push(await statement.run<T>())
      }
      this.sqlite.exec('COMMIT')
      return results
    }
    catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }

  async exec(sql: string): Promise<D1ExecResult> {
    this.sqlite.exec(sql)
    return await Promise.resolve({ count: 1, duration: 0 })
  }

  withSession(): D1DatabaseSession {
    return this
  }

  getBookmark(): string | null {
    return null
  }

  async dump(): Promise<ArrayBuffer> {
    return await Promise.reject(new Error('SQLite test bindings do not implement deprecated D1 dumps.'))
  }
}
