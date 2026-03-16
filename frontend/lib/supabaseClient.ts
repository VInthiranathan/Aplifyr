import type { SupabaseClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const isSupabaseConfigured = Boolean(
	process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)

let cachedBrowserClient: SupabaseClient | null = null

export function getSupabaseBrowserClient(): SupabaseClient {
	if (!isSupabaseConfigured) {
		throw new Error(
			'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in frontend/.env.local.',
		)
	}

	if (!cachedBrowserClient) {
		cachedBrowserClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
	}

	return cachedBrowserClient
}
