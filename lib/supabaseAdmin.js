import { createClient } from '@supabase/supabase-js';

// UWAGA: ten klient używa klucza service_role/secret, który omija RLS
// (pełny dostęp do bazy). Wolno go importować WYŁĄCZNIE w kodzie
// wykonywanym po stronie serwera (pages/api/**) — nigdy w komponentach
// renderowanych w przeglądarce.
const SUPABASE_URL = 'https://fflcsvtdfhvscqrrtvgl.supabase.co';

export function getSupabaseAdmin() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error('Brak SUPABASE_SECRET_KEY w zmiennych środowiskowych serwera');
  }
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
}
