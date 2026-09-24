import { createClient } from './api.ts';
import { createDemoTransport } from './demoApi.ts';
import { createSupabaseTransport } from './supabaseApi.ts';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Если адрес и ключ Supabase заданы при сборке — боевой режим, иначе демо. */
export const api = createClient(url && key ? createSupabaseTransport(url, key) : createDemoTransport());
