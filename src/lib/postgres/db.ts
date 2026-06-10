import pg from 'pg'

const { Pool, types } = pg

// node-postgres returns NUMERIC/DECIMAL (OID 1700) and BIGINT/INT8 (OID 20) as
// strings to avoid precision loss. The rest of the app was written against the
// Supabase JS client, which surfaced these columns as JS numbers, so string
// values break math/formatting (e.g. `roas.toFixed is not a function`). Restore
// the previous behaviour by parsing them back into numbers globally.
// NUMERIC(12,2) money + small counts stay well within IEEE-754 safe range.
types.setTypeParser(1700, (value) => (value === null ? null : parseFloat(value)))
types.setTypeParser(20, (value) => (value === null ? null : parseInt(value, 10)))

const databaseUrl = process.env.DATABASE_URL
const databaseRequiresSsl = databaseUrl?.includes('sslmode=require') ?? false
const poolConnectionString = databaseUrl && databaseRequiresSsl ? removeSslMode(databaseUrl) : databaseUrl

if (!databaseUrl && process.env.NODE_ENV !== 'test') {
  console.warn('DATABASE_URL is not set. Local Postgres queries will fail until it is configured.')
}

declare global {
  // eslint-disable-next-line no-var
  var profitTebelPgPool: pg.Pool | undefined
}

export const pool =
  globalThis.profitTebelPgPool ??
  new Pool({
    connectionString: poolConnectionString,
    ssl: databaseRequiresSsl ? { rejectUnauthorized: false } : undefined,
  })

function removeSslMode(connectionString: string) {
  const url = new URL(connectionString)
  url.searchParams.delete('sslmode')
  return url.toString()
}

if (process.env.NODE_ENV !== 'production') {
  globalThis.profitTebelPgPool = pool
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values: unknown[] = []) {
  return pool.query<T>(text, values)
}

export async function withTransaction<T>(handler: (client: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect()

  try {
    await client.query('begin')
    const result = await handler(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
