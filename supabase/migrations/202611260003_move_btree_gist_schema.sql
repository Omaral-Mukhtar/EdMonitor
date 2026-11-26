-- Move btree_gist extension out of public schema per Supabase security advisor
alter extension btree_gist set schema extensions;
