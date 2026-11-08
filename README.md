# ARÈNE RENARD — mise en ligne (GitHub + Render), version SANS admin

Contenu : `server.js` (serveur, aucune dépendance) et `jeu-de-tir.html` (le jeu).
Il n'y a ni page admin ni mot de passe : personne ne peut administrer le serveur en ligne.

## 1. GitHub
1. Crée un dépôt **privé** (Private) nommé `arene-renard`.
2. Envoie-y tous les fichiers de ce dossier (« Add file » → « Upload files »), puis « Commit changes ».

## 2. Render
1. render.com → connecte-toi avec GitHub → **New +** → **Web Service** → choisis `arene-renard`.
2. Runtime **Node**, Build Command vide (ou `echo ok`), Start Command `node server.js`, plan **Free**.
3. **Create Web Service**. Quand c'est « Live », ton lien est du genre `https://arene-renard.onrender.com`.
4. Les joueurs ouvrent simplement ce lien.

## Limites du plan gratuit
- Le serveur s'endort après ~15 min sans joueur (1re connexion lente, ~1 min).
- Les profils des joueurs restent dans leur propre navigateur (par adresse : un nouveau lien = profils à zéro).
