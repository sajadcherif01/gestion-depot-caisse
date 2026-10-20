-- Dépôt & Caisse: schema sécurisé par utilisateur.
-- À exécuter via `supabase db push` après `supabase link`, ou dans le SQL Editor.
create table if not exists public.sorties_stock (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date_operation date not null default current_date,
  client_nom text not null check (char_length(trim(client_nom)) > 0),
  ville text not null check (char_length(trim(ville)) > 0),
  produit_nom text not null check (char_length(trim(produit_nom)) > 0),
  couleur text not null,
  mesure text not null,
  quantite integer not null check (quantite >= 1),
  montant_total numeric(14,2) not null check (montant_total >= 0),
  montant_paye numeric(14,2) not null default 0 check (montant_paye >= 0 and montant_paye <= montant_total),
  created_at timestamptz not null default now()
);

create table if not exists public.flux_monetaire (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date_operation date not null default current_date,
  type_flux text not null check (type_flux in ('entree', 'depense')),
  categorie text not null,
  description text,
  montant numeric(14,2) not null check (montant > 0),
  -- Nullable: necessary to attribute a "Règlement Client" to the right balance.
  client_nom text,
  created_at timestamptz not null default now(),
  constraint reglement_client_identifie check (categorie <> 'Règlement Client' or (type_flux = 'entree' and client_nom is not null and char_length(trim(client_nom)) > 0))
);

create index if not exists sorties_stock_user_date_idx on public.sorties_stock (user_id, date_operation desc);
create index if not exists flux_monetaire_user_date_idx on public.flux_monetaire (user_id, date_operation desc);
create index if not exists flux_monetaire_user_client_idx on public.flux_monetaire (user_id, client_nom) where client_nom is not null;

alter table public.sorties_stock enable row level security;
alter table public.flux_monetaire enable row level security;

-- Each authenticated user has access only to their own rows. UPDATE includes both clauses.
create policy "Users manage own sorties" on public.sorties_stock for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own cash flows" on public.flux_monetaire for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.sorties_stock to authenticated;
grant select, insert, update, delete on public.flux_monetaire to authenticated;
