# Supabase — criar tabelas do App Hyrox

## 1. Criar projeto (se ainda não tiver)

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard)
2. **New project** → escolha nome, senha do banco e região (ex.: South America)
3. Aguarde o projeto ficar **Active**

## 2. Executar o SQL (recomendado)

1. No painel: **SQL Editor** → **New query**
2. Abra o arquivo `supabase/setup_completo.sql` deste repositório
3. Copie **todo** o conteúdo e cole no editor
4. Clique em **Run** (ou Ctrl+Enter)

Se der sucesso, você verá as tabelas em **Table Editor**.

## 3. Verificar

No **Table Editor**, devem aparecer:

| Tabela | Função |
|--------|--------|
| `profiles` | Usuários (organizador/staff) |
| `course_templates` | Templates de percurso |
| `segments` | 16 segmentos Hyrox |
| `events` | Competições |
| `event_staff` | Juízes por evento |
| `categories` | Open M/F, Pro, etc. |
| `athletes` | Atletas inscritos |
| `doubles_pairs` | Duplas (2 atletas, 1 bib, categoria Doubles) |
| `athlete_runs` | Prova de cada atleta |
| `pair_runs` | Prova de cada dupla |
| `segment_times` | Tempo por estação (atleta) |
| `pair_segment_times` | Tempo por estação (dupla) |
| `penalties` | Penalidades (+2 min, etc.) |

View: `leaderboard` (ranking singles + duplas por categoria)

Seed: template **Hyrox Singles Oficial** com 16 segmentos já inseridos.

## 4. Credenciais para o app

Em **Project Settings** → **API**, copie:

- **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
- **anon public** key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Crie o arquivo `apps/mobile/.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key_aqui
```

> Nunca commite a `service_role` key no app mobile.

## 5. Auth (necessário para sincronizar)

Em **Authentication** → **Providers**, habilite **Email** para organizadores fazerem login.

Ao criar um usuário, o trigger `handle_new_user` cria automaticamente um registro em `profiles`.

Com `.env` configurado e **login** na tela Eventos → **Entrar**, o app sincroniza:

| Ação no app | Tabela(s) Supabase |
|-------------|-------------------|
| Criar evento | `events`, `categories` |
| Alterar status | `events` |
| Inscrever atletas / duplas | `athletes`, `doubles_pairs` |
| Cronometrar / finalizar | `athlete_runs`, `pair_runs`, `segment_times`, `pair_segment_times` |
| Encerrar evento | `events.status = finished` |
| Baixar da nuvem | Lê todas as tabelas acima do organizador logado |

Sem sessão autenticada, o app funciona offline (dados locais), mas não grava no banco (RLS exige usuário logado).

## 6. Via CLI (alternativa)

```powershell
# Instalar CLI
winget install Supabase.CLI

# Na pasta App-Hyrox
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

---

## Estrutura dos arquivos SQL

| Arquivo | Conteúdo |
|---------|----------|
| `migrations/001_initial.sql` | Tabelas, índices, triggers, view |
| `migrations/002_rls.sql` | Row Level Security |
| `migrations/003_doubles_pairs.sql` | Duplas (se já rodou 001+002 antes) |
| `seed.sql` | Template Hyrox oficial |
| `setup_completo.sql` | Tudo junto (para o SQL Editor) |
