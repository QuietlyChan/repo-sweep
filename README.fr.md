# Repo Sweep

Langues : [简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | **Français**

Repo Sweep permet de lister, cloner et mettre à jour en lot les dépôts GitLab ou GitHub accessibles au compte courant. Le CLI propose une interface interactive dans le terminal, des tâches Git concurrentes, l'affichage de la progression réelle de Git et des binaires mono-fichier multiplateformes.

## Fonctionnalités

- Prise en charge de GitLab et GitHub.
- Invites interactives avec `@clack/prompts`.
- Commandes de lot `list`, `clone` et `pull`.
- Clonage et mise à jour concurrents avec progression `courant/total`.
- Analyse de la progression Git et affichage sous forme de barre texte.
- Authentification HTTPS par Token via un `GIT_ASKPASS` temporaire ; le Token n'est pas ajouté aux URL de clone.
- Binaires mono-fichier construits avec `bun build --compile`.

## Prérequis

- Git doit être installé et disponible dans `PATH`.
- Le réseau doit pouvoir accéder au fournisseur Git configuré.
- Le paquet npm nécessite Node.js 20 ou une version plus récente.
- Bun est nécessaire pour le développement local et la construction des binaires de Release. Les binaires de Release incluent le runtime Bun.

## Installation npm

Le nom du paquet npm est `@quietlychan/repo-sweep` ; la commande installée reste `repo-sweep`.

Exécution sans installation globale :

```bash
npx @quietlychan/repo-sweep --help
```

Installation globale :

```bash
npm install -g @quietlychan/repo-sweep
repo-sweep --help
```

Si Node.js n'est pas disponible, télécharger le binaire mono-fichier correspondant à la plateforme depuis GitHub Releases.

## Configuration

Copier le fichier d'exemple :

```bash
cp .env.example .env
```

Exemple GitLab :

```env
GIT_PROVIDER=gitlab
GIT_BASE_URL=http://127.0.0.1/
GIT_API_URL=http://127.0.0.1/api/v4/
GIT_TOKEN=personal_access_token
GIT_TARGET_DIR=./git-projects
GIT_USERNAME=oauth2
```

Exemple GitHub :

```env
GIT_PROVIDER=github
GIT_BASE_URL=https://github.com/
GIT_API_URL=https://api.github.com/
GIT_TOKEN=personal_access_token
GIT_TARGET_DIR=./git-projects
GIT_USERNAME=x-access-token
```

## Utilisation

Les exemples ci-dessous supposent une installation npm globale ou un binaire GitHub Release. Pour une exécution temporaire avec `npx`, remplacer `repo-sweep` par `npx @quietlychan/repo-sweep`.

Mode interactif :

```bash
repo-sweep
```

Lister les dépôts :

```bash
repo-sweep list
```

Cloner les dépôts manquants :

```bash
repo-sweep clone
```

Mettre à jour les dépôts existants :

```bash
repo-sweep pull
```

Sortie JSON :

```bash
repo-sweep list --json
```

Cloner et mettre aussi à jour les dépôts déjà présents localement :

```bash
repo-sweep clone --update
```

Exemple de progression :

```text
[克隆:进度] 07/80 group/project [############----------]  55% 接收对象（已完成 42/80）
```

Les messages réels du CLI sont localisés en chinois.

## Options CLI

- `--provider gitlab|github` : choisir le fournisseur. Valeur par défaut : `gitlab`.
- `--base-url <url>` : URL Web du fournisseur.
- `--api-url <url>` : URL de l'API du fournisseur. Si elle est omise, elle est déduite de `--base-url`.
- `--token <token>` : Token d'accès personnel. L'utilisation de `GIT_TOKEN` est recommandée.
- `--dir <path>` : répertoire local de destination.
- `--clone-url http|ssh` : type d'URL de clone. Valeur par défaut : `http`.
- `--git-username <name>` : nom d'utilisateur Git HTTPS. GitLab utilise `oauth2` par défaut ; GitHub utilise `x-access-token`.
- `--concurrency <n>` : nombre de tâches Git concurrentes. Valeur par défaut : `4`.
- `--progress-interval <sec>` : intervalle de journalisation pour les tâches Git longues. Utiliser `0` pour le désactiver.
- `--skip-archived` : ignorer les dépôts archivés.
- `--dry-run` : afficher les commandes Git prévues sans les exécuter.
- `--flat` : stocker les dépôts directement sous le répertoire cible par nom de projet. Des collisions sont possibles si des noms se répètent.
- `--json` : afficher du JSON pour `list`.
- `--show-token` : afficher le Token complet en mode interactif.

## Construire les binaires

Construire toutes les cibles configurées :

```bash
bun run build:bin
```

Construire uniquement la plateforme courante :

```bash
bun run build:bin:current
```

Construire une cible Bun précise :

```bash
bun run build:bin -- --target bun-linux-x64
```

Sorties par défaut :

```text
dist/repo-sweep-darwin-arm64
dist/repo-sweep-darwin-x64
dist/repo-sweep-linux-x64
dist/repo-sweep-linux-arm64
dist/repo-sweep-windows-x64.exe
dist/README.txt
```

## Releases

Les assets de Release sont généralement produits par une pipeline CI, le plus souvent GitHub Actions sur GitHub. Lorsqu'un tag est poussé, le workflow installe les dépendances, construit les binaires multiplateformes, crée une GitHub Release et téléverse les fichiers compilés dans les assets.

Ce dépôt inclut `.github/workflows/release.yml`. Pour publier une Release :

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

GitHub Actions exécutera automatiquement :

1. Installation de Bun.
2. Installation des dépendances.
3. Vérification TypeScript.
4. Construction des binaires multiplateformes dans `dist`.
5. Téléversement des fichiers de `dist` dans les assets de la GitHub Release.

Le workflow utilise le `GITHUB_TOKEN` intégré. Pour un dépôt public GitHub classique, aucun Token supplémentaire n'est nécessaire pour téléverser les assets de Release. Vérifier que les permissions Actions du dépôt autorisent `contents: write`.

## Développement

Installer les dépendances :

```bash
bun install
```

Vérifier les types :

```bash
bun run typecheck
```

Exécuter le CLI localement :

```bash
bun run start
```

## Licence

Licence MIT. Voir [LICENSE](LICENSE).
