# 🐦‍⬛ RAVEN CHAT — GitHub + Render

Cette version **n'utilise pas Supabase**.

Architecture :
**GitHub = code**
→ **Render Web Service = serveur + site**
→ **Render PostgreSQL = base de données**

## Déploiement Render
1. Mets ce dossier dans un dépôt GitHub.
2. Sur Render, choisis **New > Blueprint**.
3. Sélectionne le dépôt.
4. Render lit `render.yaml` et crée le service web + la base PostgreSQL.
5. Attends le déploiement.
6. Ouvre l'URL `.onrender.com`.

## Attention aux fichiers
La V1 permet les pièces jointes, mais les fichiers envoyés dans `uploads/` sont stockés sur le disque local du service. Sur un hébergement Render, ce disque n'est pas destiné à conserver durablement les médias après certaines opérations/redéploiements. Pour une vraie messagerie avec photos/vidéos/vocaux persistants, il faudra ajouter plus tard un stockage objet.

## Fonctionnalités déjà structurées
- Authentification
- Profils
- Discussions privées
- Groupes
- Messages
- ✓✓
- lecture
- suppression
- recherche
- pièces jointes V1
- XP / niveau / rang
- classement
- royaumes
- jeux (base)
- API serveur sécurisée par JWT
- PostgreSQL

## Sécurité
Ne mets aucune clé secrète dans le frontend. `JWT_SECRET` est généré par Render via `render.yaml`.

## Pour le temps réel
Cette version utilise une API classique. Pour un vrai "instantané" sans rechargement, on pourra ajouter WebSocket/Socket.IO dans la même application Render à l'étape suivante.
