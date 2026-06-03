import pg from 'pg'

const { Pool } = pg

const databaseUrl = process.env.DATABASE_URL

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
    connectionString: databaseUrl,
  })

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
