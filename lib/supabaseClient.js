import { createClient } from '@supabase/supabase-js';

// Adres i klucz "anon" Supabase są bezpieczne do użycia po stronie klienta —
// dostęp do danych jest ograniczony politykami Row Level Security (RLS)
// ustawionymi w bazie: na razie publiczny odczyt, a zapis (tworzenie eventów,
// przypisywanie kontrolerów) będzie szedł wyłącznie przez serwerowe API routes
// z kluczem service_role, który NIGDY nie trafia do przeglądarki.
const SUPABASE_URL = 'https://fflcsvtdfhvscqrrtvgl.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmbGNzdnRkZmh2c2NxcnJ0dmdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NzA2MDQsImV4cCI6MjEwMzM0NjYwNH0.1sN5yovaAS9OPbXl5RDfXCwE02sJtXL2ev3sxwvgib8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
