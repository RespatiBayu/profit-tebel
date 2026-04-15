import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const productId = params.id

    // Verify ownership — product must belong to user
    const { data: product, error: fetchError } = await supabase
      .from('master_products')
      .select('id, user_id')
      .eq('id', productId)
      .maybeSingle()

    if (fetchError) {
      console.error('Fetch product error:', fetchError)
      return NextResponse.json(
        { error: 'Gagal mengambil data produk' },
        { status: 500 }
      )
    }

    if (!product) {
      return NextResponse.json(
        { error: 'Produk tidak ditemukan' },
        { status: 404 }
      )
    }

    if (product.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Tidak memiliki izin menghapus produk ini' },
        { status: 403 }
      )
    }

    // Delete the product
    const { error: deleteError } = await supabase
      .from('master_products')
      .delete()
      .eq('id', productId)

    if (deleteError) {
      console.error('Delete product error:', deleteError)
      return NextResponse.json(
        { error: `Gagal menghapus produk: ${deleteError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete product error:', error)
    return NextResponse.json(
      { error: 'Terjadi kesalahan server' },
      { status: 500 }
    )
  }
}
