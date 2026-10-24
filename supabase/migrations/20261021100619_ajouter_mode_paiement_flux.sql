alter table public.flux_monetaire
  add column if not exists mode_paiement text;

-- Les anciennes lignes sans modalité sont considérées comme du Cash.
update public.flux_monetaire
set mode_paiement = 'Cash'
where mode_paiement is null
   or mode_paiement in ('Espèces', 'Carte', 'Transfert bancaire');

alter table public.flux_monetaire
  drop constraint if exists flux_monetaire_mode_paiement_check,
  alter column mode_paiement set default 'Cash',
  alter column mode_paiement set not null,
  add constraint flux_monetaire_mode_paiement_check
    check (mode_paiement in ('Cash', 'Chèque', 'LC'));
