# FA200Music

Base de déploiement web pour FA200Music : interface streaming + API Express + PostgreSQL.

## Déploiement Render

1. Créer un dépôt GitHub privé nommé `FA200Music`.
2. Envoyer tout le contenu de ce dossier à la racine du dépôt.
3. Dans Render : New → Blueprint et sélectionner le dépôt.
4. Render lit `render.yaml`, crée le service web et PostgreSQL.
5. Une fois le service en ligne, ajouter `FA200Music.com` dans Settings → Custom Domains et configurer le DNS chez le registrar.

Le service écoute sur `0.0.0.0` et utilise `PORT`, comme requis par Render.

## Catalogue

Les morceaux sont ajoutés dans PostgreSQL avec `audio_url` pointant vers un stockage/CDN audio autorisé. Pour un vrai lancement public, il faut ensuite ajouter l'authentification, l'espace administrateur, le stockage média/CDN et les droits de diffusion.
