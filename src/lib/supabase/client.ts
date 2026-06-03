export function createClient() {
  return {
    auth: {
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) {
          return { data: { user: null }, error: { message: body.error ?? 'Invalid login credentials' } }
        }
        return { data: { user: body.user }, error: null }
      },
      signOut: async () => {
        await fetch('/api/auth/logout', { method: 'POST' })
        return { error: null }
      },
      resetPasswordForEmail: async (email: string, options?: unknown) => {
        void options
        const response = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        const body = await response.json().catch(() => ({}))
        return response.ok ? { data: body, error: null } : { data: null, error: { message: body.error ?? 'Gagal reset password' } }
      },
    },
    from: (table: string) => ({
      upsert: async (_payload?: unknown, _options?: unknown) => {
        void table
        void _payload
        void _options
        return { data: null, error: null }
      },
    }),
  }
}
