import { createClient } from '@supabase/supabase-js'

/**
 * Create a demo account for testing
 * Run with: npx tsx scripts/create-demo-account.ts
 *
 * Make sure to set:
 * - SUPABASE_URL in .env
 * - SUPABASE_ANON_KEY in .env
 * - SUPABASE_SERVICE_ROLE_KEY in .env (for this script)
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
        return
      }
      throw authError
    }

    console.log('✅ Auth user created')
    console.log(`   UID: ${authData.user?.id}`)

    // 2. Profile should auto-create via trigger, but let's ensure it exists
    console.log('\n🏪 Creating demo store...')

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', demoEmail)
      .maybeSingle()

    if (!profileData) {
      throw new Error('Profile not created. Database trigger may not be running.')
    }

    const userId = profileData.id

    // 3. Create store
    const { error: storeError } = await supabase.from('stores').insert({
      user_id: userId,
      name: 'Demo Store',
      marketplace: 'shopee',
      color: '#3b82f6',
      notes: 'Demo store for testing',
    })

    if (storeError && !storeError.message.includes('duplicate')) {
      throw storeError
    }
    console.log('✅ Demo store created')

    // 4. Get store ID
    const { data: storeData } = await supabase
      .from('stores')
      .select('id')
      .eq('user_id', userId)
      .eq('name', 'Demo Store')
      .maybeSingle()

    if (!storeData) {
      throw new Error('Store not created successfully')
    }

    const storeId = storeData.id

    // 5. Add sample products
    console.log('\n📦 Adding sample products...')

    const products = [
      { id: 'DEMO-001', name: 'Demo T-Shirt Premium', hpp: 50000, packaging: 2000 },
      { id: 'DEMO-002', name: 'Demo Sneakers Classic', hpp: 150000, packaging: 5000 },
      { id: 'DEMO-003', name: 'Demo Backpack Travel', hpp: 200000, packaging: 10000 },
      { id: 'DEMO-004', name: 'Demo Phone Case Leather', hpp: 30000, packaging: 1000 },
      { id: 'DEMO-005', name: 'Demo Wallet Slim', hpp: 40000, packaging: 1500 },
    ]

    for (const product of products) {
      const { error } = await supabase.from('master_products').insert({
        store_id: storeId,
        user_id: userId,
        marketplace_product_id: product.id,
        product_name: product.name,
        hpp: product.hpp,
        packaging_cost: product.packaging,
        marketplace: 'shopee',
      })

      if (error && !error.message.includes('duplicate')) {
        console.warn(`⚠️  Could not add ${product.name}: ${error.message}`)
      }
    }
    console.log(`✅ ${products.length} sample products added`)

    // 6. Add ROAS scenario
    console.log('\n📊 Adding ROAS calculation scenario...')

    const { error: scenarioError } = await supabase.from('roas_scenarios').insert({
      user_id: userId,
      scenario_name: 'Demo Scenario - Optimal Profit',
      marketplace: 'shopee',
      selling_price: 150000,
      hpp: 50000,
      packaging_cost: 2000,
      commission_rate: 0.05,
      admin_fee_rate: 0.02,
      service_fee_rate: 0.03,
      processing_fee: 2500,
      estimated_shipping: 15000,
      seller_voucher: 5000,
      target_roas: 3.0,
    })

    if (scenarioError && !scenarioError.message.includes('duplicate')) {
      console.warn(`⚠️  Could not add ROAS scenario: ${scenarioError.message}`)
    } else {
      console.log('✅ ROAS scenario added')
    }

    // Success!
    console.log('\n' + '='.repeat(50))
    console.log('✅ Demo account created successfully!')
    console.log('='.repeat(50))
    console.log(`\n🔑 Login Credentials:`)
    console.log(`   Email:    ${demoEmail}`)
    console.log(`   Password: ${demoPassword}`)
    console.log(`\n📍 Access URL:`)
    console.log(`   http://localhost:3000/login`)
    console.log(`\n📋 What's Included:`)
    console.log(`   • Demo store (Shopee)`)
    console.log(`   • 5 sample products with HPP data`)
    console.log(`   • ROAS calculation scenario`)
    console.log(`   • Ready for testing uploads & analytics`)
    console.log('')
  } catch (error) {
    console.error('❌ Error creating demo account:')
    console.error(error)
    process.exit(1)
  }
}

createDemoAccount()
