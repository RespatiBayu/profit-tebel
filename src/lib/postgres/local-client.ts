/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LocalUser } from './auth'
import {
  createAuthUser,
  deleteAuthUser,
  getCurrentUser,
  updateAuthUser,
} from './auth'
import { query } from './db'

type QueryError = { message: string; code?: string }
type DbRow = any
type QueryResult<T = DbRow[]> = { data: T | null; error: QueryError | null; count?: number | null }
type Filter = { column: string; op: string; value: unknown }
type OrderBy = { column: string; ascending: boolean }

const STORE_SCOPED_TABLES = new Set([
  'master_products',
  'orders',
  'order_products',
  'ads_data',
  'upload_batches',
  'orders_all',
])

const USER_SCOPED_TABLES = new Set(['profiles', 'upload_jobs', 'roas_scenarios', 'store_memberships'])
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function qid(identifier: string) {
  if (!IDENTIFIER_RE.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`)
  }
  return `"${identifier}"`
}

function parseSelectColumns(select: string | undefined) {
  if (!select || select.trim() === '*' || select.trim() === '') return '*'
  const columns = splitTopLevel(select)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.includes('(') && !part.includes(':'))
    .map((part) => part.split(/\s+/)[0])
    .map((part) => qid(part))
  return columns.length > 0 ? columns.join(', ') : '*'
}

function formatLocalDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) {
    const isDateOnly =
      value.getHours() === 0 &&
      value.getMinutes() === 0 &&
      value.getSeconds() === 0 &&
      value.getMilliseconds() === 0
    return isDateOnly ? formatLocalDate(value) : value.toISOString()
  }
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeValue(nestedValue)])
    )
  }
  return value
}

function normalizeRow<T>(row: T): T {
  return normalizeValue(row) as T
}

function errorResult(error: unknown): QueryResult {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : undefined
  return {
    data: null,
    error: { message: error instanceof Error ? error.message : String(error), code },
    count: null,
  }
}

function splitTopLevel(input: string) {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      parts.push(input.slice(start, i))
      start = i + 1
    }
  }
  parts.push(input.slice(start))
  return parts.map((part) => part.trim()).filter(Boolean)
}

export class LocalQueryBuilder<T = DbRow[]> implements PromiseLike<QueryResult<T>> {
  private selectClause = '*'
  private selectWasCalled = false
  private countMode: 'exact' | null = null
  private head = false
  private filters: Filter[] = []
  private orFilters: string[] = []
  private orders: OrderBy[] = []
  private limitCount: number | null = null
  private singleMode: 'single' | 'maybeSingle' | null = null

  constructor(
    private table: string,
    private operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select',
    private payload: unknown = null,
    private options: Record<string, unknown> = {},
    private user: LocalUser | null = null,
    private service = false
  ) {}

  select(columns = '*', options?: { count?: 'exact'; head?: boolean }) {
    this.operation = this.operation === 'select' ? 'select' : this.operation
    this.selectClause = parseSelectColumns(columns)
    this.selectWasCalled = true
    this.countMode = options?.count ?? null
    this.head = options?.head ?? false
    return this
  }

  insert(payload: unknown) {
    this.operation = 'insert'
    this.payload = payload
    return this
  }

  update(payload: unknown) {
    this.operation = 'update'
    this.payload = payload
    return this
  }

  upsert(payload: unknown, options: Record<string, unknown> = {}) {
    this.operation = 'upsert'
    this.payload = payload
    this.options = options
    return this
  }

  delete(options?: Record<string, unknown>) {
    void options
    this.operation = 'delete'
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, op: '=', value })
    return this
  }

  neq(column: string, value: unknown) {
    this.filters.push({ column, op: '<>', value })
    return this
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ column, op: 'in', value })
    return this
  }

  gte(column: string, value: unknown) {
    this.filters.push({ column, op: '>=', value })
    return this
  }

  lte(column: string, value: unknown) {
    this.filters.push({ column, op: '<=', value })
    return this
  }

  gt(column: string, value: unknown) {
    this.filters.push({ column, op: '>', value })
    return this
  }

  lt(column: string, value: unknown) {
    this.filters.push({ column, op: '<', value })
    return this
  }

  is(column: string, value: unknown) {
    this.filters.push({ column, op: 'is', value })
    return this
  }

  not(column: string, op: string, value: unknown) {
    this.filters.push({ column, op: `not.${op}`, value })
    return this
  }

  like(column: string, value: string) {
    this.filters.push({ column, op: 'like', value })
    return this
  }

  ilike(column: string, value: string) {
    this.filters.push({ column, op: 'ilike', value })
    return this
  }

  or(filter: string) {
    this.orFilters.push(filter)
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false })
    return this
  }

  limit(count: number) {
    this.limitCount = count
    return this
  }

  single(): LocalQueryBuilder<DbRow> {
    this.singleMode = 'single'
    return this as unknown as LocalQueryBuilder<DbRow>
  }

  maybeSingle(): LocalQueryBuilder<DbRow> {
    this.singleMode = 'maybeSingle'
    return this as unknown as LocalQueryBuilder<DbRow>
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private addFilterSql(filter: Filter, values: unknown[]) {
    const column = qid(filter.column)
    if (filter.op === 'in') {
      values.push(filter.value)
      return `${column} = any($${values.length})`
    }
    if (filter.op === 'is') {
      return filter.value === null ? `${column} is null` : `${column} is not distinct from ${this.param(values, filter.value)}`
    }
    if (filter.op === 'not.is') {
      return filter.value === null ? `${column} is not null` : `${column} is distinct from ${this.param(values, filter.value)}`
    }
    if (filter.op === 'like') {
      values.push(filter.value)
      return `${column} like $${values.length}`
    }
    if (filter.op === 'ilike') {
      values.push(filter.value)
      return `${column} ilike $${values.length}`
    }
    values.push(filter.value)
    return `${column} ${filter.op} $${values.length}`
  }

  private param(values: unknown[], value: unknown) {
    values.push(value)
    return `$${values.length}`
  }

  private addParsedPredicate(predicate: string, values: unknown[]) {
    const [column, op, ...rest] = predicate.split('.')
    const value = rest.join('.')
    const sqlOp = op === 'gte' ? '>=' : op === 'lte' ? '<=' : op === 'lt' ? '<' : op === 'gt' ? '>' : op === 'eq' ? '=' : null
    if (!sqlOp) throw new Error(`Unsupported or() operator: ${op}`)
    values.push(value)
    return `${qid(column)} ${sqlOp} $${values.length}`
  }

  private addOrSql(values: unknown[]) {
    return this.orFilters.map((filter) => {
      const groups = splitTopLevel(filter).map((part) => {
        const andMatch = part.match(/^and\((.*)\)$/)
        if (andMatch) {
          return `(${splitTopLevel(andMatch[1]).map((p) => this.addParsedPredicate(p, values)).join(' and ')})`
        }
        return `(${this.addParsedPredicate(part, values)})`
      })
      return `(${groups.join(' or ')})`
    })
  }

  private async accessSql(values: unknown[]) {
    if (this.service) return []
    if (!this.user) return ['1 = 0']

    if (STORE_SCOPED_TABLES.has(this.table)) {
      values.push(this.user.id)
      return [
        `${qid('store_id')} in (
          select store_id from store_memberships where user_id = $${values.length}
        )`,
      ]
    }

    if (this.table === 'stores') {
      values.push(this.user.id)
      return [
        `${qid('id')} in (
          select store_id from store_memberships where user_id = $${values.length}
        )`,
      ]
    }

    if (USER_SCOPED_TABLES.has(this.table)) {
      values.push(this.user.id)
      const column = this.table === 'profiles' ? 'id' : 'user_id'
      return [`${qid(column)} = $${values.length}`]
    }

    return []
  }

  private async whereSql(values: unknown[]) {
    const parts = [
      ...(await this.accessSql(values)),
      ...this.filters.map((filter) => this.addFilterSql(filter, values)),
      ...this.addOrSql(values),
    ]

    return parts.length > 0 ? ` where ${parts.join(' and ')}` : ''
  }

  private async execute(): Promise<QueryResult<T>> {
    try {
      if (this.operation === 'insert') return await this.executeInsert()
      if (this.operation === 'upsert') return await this.executeUpsert()
      if (this.operation === 'update') return await this.executeUpdate()
      if (this.operation === 'delete') return await this.executeDelete()
      return await this.executeSelect()
    } catch (error) {
      return errorResult(error) as QueryResult<T>
    }
  }

  private async executeSelect(): Promise<QueryResult<T>> {
    const values: unknown[] = []
    const where = await this.whereSql(values)

    if (this.countMode && this.head) {
      const result = await query<{ count: string }>(`select count(*)::int as count from ${qid(this.table)}${where}`, values)
      return { data: null, error: null, count: Number(result.rows[0]?.count ?? 0) }
    }

    const order = this.orders.length
      ? ` order by ${this.orders.map((item) => `${qid(item.column)} ${item.ascending ? 'asc' : 'desc'}`).join(', ')}`
      : ''
    const limit = this.limitCount !== null ? ` limit ${Number(this.limitCount)}` : ''
    const result = await query(`select ${this.selectClause} from ${qid(this.table)}${where}${order}${limit}`, values)
    return this.formatRows(result.rows.map(normalizeRow) as T[])
  }

  private async executeInsert(): Promise<QueryResult<T>> {
    const rows = Array.isArray(this.payload) ? this.payload : [this.payload]
    if (rows.length === 0) return { data: [] as T, error: null }

    const typedRows = rows as Record<string, unknown>[]
    const keys = Array.from(new Set(typedRows.flatMap((row) => Object.keys(row))))
    const values: unknown[] = []
    const rowSql = typedRows.map((row) => {
      const params = keys.map((key) => this.param(values, row[key] ?? null))
      return `(${params.join(', ')})`
    })
    const returning = this.selectWasCalled ? ` returning ${this.selectClause}` : ''
    const result = await query(
      `insert into ${qid(this.table)} (${keys.map(qid).join(', ')}) values ${rowSql.join(', ')}${returning}`,
      values
    )

    return this.formatRows(result.rows.map(normalizeRow) as T[], result.rowCount ?? 0)
  }

  private async executeUpsert(): Promise<QueryResult<T>> {
    const rows = Array.isArray(this.payload) ? this.payload : [this.payload]
    if (rows.length === 0) return { data: [] as T, error: null }
    const conflict = String(this.options.onConflict ?? 'id')
      .split(',')
      .map((col) => qid(col.trim()))
      .join(', ')
    const ignore = Boolean(this.options.ignoreDuplicates)
    const conflictColumns = String(this.options.onConflict ?? 'id')
      .split(',')
      .map((col) => col.trim())
    const typedRows = rows as Record<string, unknown>[]
    const keys = Array.from(new Set(typedRows.flatMap((row) => Object.keys(row))))
    const values: unknown[] = []
    const rowSql = typedRows.map((row) => {
      const params = keys.map((key) => this.param(values, row[key] ?? null))
      return `(${params.join(', ')})`
    })
    const updateSet = keys
      .filter((key) => !conflictColumns.includes(key))
      .map((key) => `${qid(key)} = excluded.${qid(key)}`)
      .join(', ')
    const action = ignore ? 'do nothing' : `do update set ${updateSet || `${qid(keys[0])} = excluded.${qid(keys[0])}`}`
    const returning = this.selectWasCalled ? ` returning ${this.selectClause}` : ''
    const result = await query(
      `insert into ${qid(this.table)} (${keys.map(qid).join(', ')}) values ${rowSql.join(', ')} on conflict (${conflict}) ${action}${returning}`,
      values
    )

    return this.formatRows(result.rows.map(normalizeRow) as T[], result.rowCount ?? 0)
  }

  private async executeUpdate(): Promise<QueryResult<T>> {
    const row = this.payload as Record<string, unknown>
    const values: unknown[] = []
    const set = Object.keys(row).map((key) => `${qid(key)} = ${this.param(values, row[key])}`)
    const where = await this.whereSql(values)
    const returning = this.selectWasCalled ? ` returning ${this.selectClause}` : ''
    const result = await query(`update ${qid(this.table)} set ${set.join(', ')}${where}${returning}`, values)
    return this.formatRows(result.rows.map(normalizeRow) as T[], result.rowCount ?? 0)
  }

  private async executeDelete(): Promise<QueryResult<T>> {
    const values: unknown[] = []
    const where = await this.whereSql(values)
    const result = await query(`delete from ${qid(this.table)}${where}`, values)
    return { data: null, error: null, count: result.rowCount ?? 0 }
  }

  private formatRows(rows: T[], count?: number): QueryResult<T> {
    if (this.singleMode) {
      if (rows.length === 0 && this.singleMode === 'maybeSingle') {
        return { data: null, error: null, count: count ?? null }
      }
      if (rows.length !== 1 && this.singleMode === 'single') {
        return { data: null, error: { message: `Expected single row, got ${rows.length}` }, count: count ?? rows.length }
      }
      return { data: (rows[0] ?? null) as T, error: null, count: count ?? rows.length }
    }
    return { data: rows as T, error: null, count: count ?? rows.length }
  }
}

export class LocalSupabaseClient {
  constructor(private user: LocalUser | null, private service = false) {}

  auth = {
    getUser: async () => ({ data: { user: this.user }, error: null }),
    admin: {
      createUser: async (payload: {
        email: string
        password: string
        email_confirm?: boolean
        user_metadata?: { full_name?: string | null }
      }) => {
        try {
          const user = await createAuthUser({
            email: payload.email,
            password: payload.password,
            fullName: payload.user_metadata?.full_name ?? null,
          })
          return { data: { user }, error: null }
        } catch (error) {
          return { data: { user: null }, error: { message: error instanceof Error ? error.message : String(error) } }
        }
      },
      updateUserById: async (
        id: string,
        payload: { email?: string; password?: string; user_metadata?: { full_name?: string | null } }
      ) => {
        try {
          const user = await updateAuthUser(id, payload)
          return { data: { user }, error: null }
        } catch (error) {
          return { data: { user: null }, error: { message: error instanceof Error ? error.message : String(error) } }
        }
      },
      deleteUser: async (id: string) => {
        try {
          await deleteAuthUser(id)
          return { data: null, error: null }
        } catch (error) {
          return { data: null, error: { message: error instanceof Error ? error.message : String(error) } }
        }
      },
    },
  }

  from<T = DbRow[]>(table: string) {
    return new LocalQueryBuilder<T>(table, 'select', null, {}, this.user, this.service)
  }
}

export async function createLocalClient() {
  return new LocalSupabaseClient(await getCurrentUser(), false)
}

export function createLocalServiceClient() {
  return new LocalSupabaseClient(null, true)
}
