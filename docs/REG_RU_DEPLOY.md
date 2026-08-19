# REG.RU Deploy

This project is deployed to REG.RU shared hosting at `https://avatars.metasiberia.com`.

## Canonical production settings
- Canonical URL: `https://avatars.metasiberia.com`
- Mirror URL: `https://www.avatars.metasiberia.com`
- Legacy URL: `https://mac.metasiberia.com`
- Remote web root: `/var/www/u2978374/data/www/avatars.metasiberia.com`
- Redirect policy:
  - `http://avatars.metasiberia.com/*` -> `https://avatars.metasiberia.com/*`
  - `http://www.avatars.metasiberia.com/*` -> `https://avatars.metasiberia.com/*`
  - `https://www.avatars.metasiberia.com/*` -> `https://avatars.metasiberia.com/*`
  - `http://mac.metasiberia.com/*` -> `https://avatars.metasiberia.com/*`
  - `https://mac.metasiberia.com/*` -> `https://avatars.metasiberia.com/*`
  - `https://www.mac.metasiberia.com/*` -> `https://avatars.metasiberia.com/*`

## Secret files
- Human-readable notes: `.secrets/reg-ru-access.local.md`
- Machine-readable deploy config: `.secrets/reg-ru-deploy.secret.json`
- Both files are gitignored on purpose.
- Copy `.secrets/reg-ru-deploy.example.json` when creating a fresh machine config.

## Fast deploy flow
1. Make sure `.secrets/reg-ru-deploy.secret.json` exists.
2. Run `yarn deploy:reg-ru`
3. Wait for the summary: unchanged files are skipped, only changed files are uploaded.
4. Verify:
   - `https://avatars.metasiberia.com`
   - `https://www.avatars.metasiberia.com`
   - `http://avatars.metasiberia.com`
   - `https://mac.metasiberia.com`

## Useful commands
- `yarn deploy:reg-ru`
  - Builds the app, then uploads only files whose size or mtime changed.
- `yarn deploy:reg-ru -- --skip-build`
  - Uploads the current `dist/` as-is without rebuilding.
- `yarn deploy:reg-ru -- --dry-run`
  - Shows what would change without uploading.
- `yarn deploy:reg-ru:prune`
  - Deletes remote files that do not exist in local `dist/`.
  - Use this only when you intentionally removed files from the build output.

## Why this deploy is fast
- The site contains many large local assets.
- Full archive uploads are slow and unnecessary for routine changes.
- `scripts/deploy-reg-ru.py` preserves remote mtimes and skips files that already match, so typical UI-only deploys should re-upload only a few files.

## Hosting notes
- Keep [public/.htaccess](../public/.htaccess) in sync with the production redirect rules and SPA fallback behavior.
- The target public SSL certificate is `avatars.metasiberia.com_le3`.
- If Let's Encrypt is still shown as self-signed in ISPmanager, keep the legacy domain online until the trusted certificate is active on `avatars.metasiberia.com`.
