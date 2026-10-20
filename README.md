# Dépôt & Caisse

Application web en français pour l’historique des sorties de dépôt par client et la caisse quotidienne. Elle est pensée pour GitHub Pages ou tout hébergement statique, avec Supabase Auth (e-mail/mot de passe) et RLS par utilisateur.

Les styles Tailwind sont compilés dans `styles.css`. Après une modification de `src/input.css` ou de l’interface, exécutez `npm run build`.

## Mise en route

1. Dans Supabase, créez un projet puis activez **Email / Password** dans Authentication > Providers.
2. La migration `supabase/migrations/20261020131945_depot_caisse_schema.sql` est déjà appliquée au projet Supabase créé. Elle peut aussi être exécutée dans SQL Editor ou avec `supabase db push` sur une copie du projet.
3. Copiez `config.example.js` vers `config.local.js` et renseignez l’URL et la clé **publishable** du projet. Ne placez jamais de clé `service_role` dans ce fichier.
4. Ouvrez `index.html` avec un serveur local ou publiez le dossier sur GitHub Pages. Ajoutez l’URL de production à Authentication > URL Configuration > Redirect URLs.
5. Créez un compte depuis l’écran Connexion, puis connectez-vous.

## Déploiement GitHub Pages

Le projet ne nécessite aucune compilation. Le workflow inclus `.github/workflows/deploy-pages.yml` déploie la branche `main` : ajoutez les secrets de dépôt `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY`, puis choisissez **GitHub Actions** comme source GitHub Pages. Comme `config.local.js` est ignoré par Git, les valeurs sont injectées pendant le déploiement. La clé publishable peut être publique : la protection des données repose sur les politiques RLS incluses.

## Vérification de sécurité

Les deux tables activent RLS, avec accès exclusivement limité à `auth.uid() = user_id`. Les règlements client sont enregistrés dans `flux_monetaire` et associés à un client afin que son solde global reste exact.

> La migration ne peut être appliquée à un projet distant qu’avec les droits Supabase de ce projet. Après `supabase login` et `supabase link --project-ref VOTRE_REF`, lancez `supabase db push --linked`.
