-- Les sorties clients deviennent un historique de mouvements, sans comptabilité.
alter table public.sorties_stock
  drop column montant_paye,
  drop column montant_total;

alter table public.flux_monetaire
  drop constraint if exists reglement_client_identifie,
  drop column if exists client_nom;
