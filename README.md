# ExportProject-server

EportProject backend API — sadece `server/` klasörünün deploy reposu.

Ana monorepo (frontend + backend): [ExportProject](https://github.com/yusuferdogann/ExportProject)

## VPS kurulum

```bash
git clone https://github.com/yusuferdogann/ExportProject-server.git
cd ExportProject-server
cp .env.example .env   # duzenle
npm ci
npx prisma generate
npm run db:push        # veya migrate deploy
npm start              # veya: pm2 start index.js --name export-api
```

## Ortam degiskenleri

`.env` dosyasini sunucuda olusturun; **asla repoya commit etmeyin.**

Ornek: `.env.example`

## Guncelleme

```bash
git pull
npm ci
npx prisma generate
pm2 restart export-api
```
