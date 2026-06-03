import { createAuthUser } from '../src/lib/postgres/auth'
import { query } from '../src/lib/postgres/db'

/**
 * Create a demo account for local Postgres auth.
 * Run with: npx tsx scripts/create-demo-account.ts
 */

async function createDemoAccount() {
  console.log('Creating demo account...\n')

  const demoEmail = 'demo@profit-tebel.com'
  const demoPassword = 'Demo123456!'

  const existing = await query<{ id: string }>('select id from auth_users where lower(email) = lower($1)', [
    demoEmail,
  ])

  if (existing.rows[0]) {
    console.log('Demo user already exists.')
  } else {
    const user = await createAuthUser({
      email: demoEmail,
      password: demoPassword,
      fullName: 'Demo Profit Tebel',
      role: 'admin',
    })
    await query('update profiles set is_paid = true, role = $1 where id = $2', ['admin', user.id])
    console.log(`Created demo user ${user.id}`)
  }

  console.log('\nDemo account is ready:')
  console.log(`Email: ${demoEmail}`)
  console.log(`Password: ${demoPassword}`)
}

createDemoAccount().catch((error) => {
  console.error(error)
  process.exit(1)
})
