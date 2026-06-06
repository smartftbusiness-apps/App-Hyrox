# App Hyrox

Aplicativo mobile para organização de competições no formato **Hyrox**: cadastro de eventos e atletas, cronometragem por estação e ranking por categoria.

## Documentação

| Arquivo | Conteúdo |
|---------|----------|
| [PLANO.md](./PLANO.md) | Plano completo: requisitos, arquitetura, roadmap e publicação nas lojas |
| [docs/dominio-hyrox.md](./docs/dominio-hyrox.md) | Formato oficial da prova, estações e categorias |
| [docs/publicacao-lojas.md](./docs/publicacao-lojas.md) | Checklist Google Play e App Store |
| [docs/SUPABASE.md](./docs/SUPABASE.md) | Criar tabelas no Supabase |

## Funcionalidades planejadas

1. **Eventos** — criar prova, categorias, ondas e regras
2. **Atletas** — cadastro manual, CSV e check-in
3. **Estações** — template Hyrox (8 corridas + 8 workouts) configurável por categoria
4. **Timing** — tempo por segmento/estação, offline-first
5. **Ranking** — leaderboard ao vivo separado por categoria

## Stack prevista

- **Mobile:** React Native + Expo (TypeScript)
- **Backend:** Supabase (PostgreSQL, Auth, Realtime)
- **Build:** Expo EAS → Google Play + Apple App Store

## Preview online

```powershell
cd apps/mobile
npm install
npm run web
```

Guia completo: [PREVIEW.md](./PREVIEW.md)

## Status

🟢 **Fase 0 em andamento** — protótipo navegável com Expo (web + mobile). Ver [PLANO.md](./PLANO.md) para o roadmap completo.
