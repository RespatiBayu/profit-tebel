import { createClient } from '@supabase/supabase-js'

/**
 * Create a demo account for testing
 * Run with: npx tsx scripts/create-demo-account.ts
 *
 * Make sure to set in .env.local:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY (from Supabase project settings > API)
 *
 * For instant full access without payment:
 * - Add demo email to ADMIN_EMAILS in .env.local
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing environment variables:')
  console.error('   - NEXT_PUBLIC_SUPABASE_URL')
  console.error('   - SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function createDemoAccount() {
  console.log('🚀 Creating demo account...\n')

  const demoEmail = 'demo@profit-tebel.com'
  const demoPassword = 'Demo123456!'

  try {
    // 1. Create auth user
    console.log('📧 Creating auth user...')
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: demoEmail,
      password: demoPassword,
      email_confirm: true, // Auto-confirm email
    })

    if (authError) {
      if (authError.message.includes('already registered')) {
        console.log('⚠️  Demo user already exists: ' + demoEmail)
        console.log('\n✅ Demo account is ready!')
        console.log(`   Email: ${demoEmail}`)
        console.log(`   Password: ${demoPassword}`)
        console.log('\n💡 Tip: Add to ADMIN_EMAILS in .env.local for instant full access')
        return
      }
      throw authError
    }

    console.log('✅ Auth user created')
    console.log(`   UID: ${authData.user?.id}`)

    // 2. Profile auto-creates via database trigger (003_auto_create_profile.sql)
    console.log('\n⏳ Waiting for profile to auto-create via trigger...')

    // Quick verification
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', demoEmail)
      .maybeSingle()

    if (profileData) {
      console.log('✅ Profile created automatically')
    }

    // Success!
    console.log('\n' + '='.repeat(60))
    console.log('✅ Demo account created successfully!')
    console.log('='.repeat(60))
    console.log(`\n🔑 Login Credentials:`)
    console.log(`   Email:    ${demoEmail}`)
    console.log(`   Password: ${demoPassword}`)
    console.log(`\n📍 Access URL:`)
    console.log(`   http://localhost:3000/login`)
    console.log(`\n⚡ For Instant Full Access (No Payment Required):`)
    console.log(`   Add to .env.local:`)
    console.log(`   ADMIN_EMAILS=demo@profit-tebel.com`)
    console.log(`   Then restart the development server`)
    console.log('')
  } catch (error) {
    console.error('❌ Error creating demo account:')
    console.error(error)
    process.exit(1)
  }
}

createDemoAccount()
