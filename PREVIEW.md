# Como ver o app online (preview)

## Pré-requisito

Node.js 18+ instalado. Se acabou de instalar, **feche e reabra o terminal** (ou o Cursor).

## Passo a passo

```powershell
cd "C:\Users\fenix\OneDrive\Área de Trabalho\Cursor Dai\App-Hyrox\apps\mobile"
npm install
npm run web
```

O navegador abre em **http://localhost:8081** (ou porta indicada no terminal).

## O que explorar

| Aba | Conteúdo |
|-----|----------|
| **Eventos** | Lista de provas mockadas; toque em um evento para ver detalhes e os 16 segmentos |
| **Atletas** | Lista com bib, categoria e status |
| **Cronômetro** | Demo interativa — iniciar/pausar, avançar segmentos, ver tempo total |
| **Ranking** | Leaderboard por categoria (Open M/F, Pro M) |

## Ver no celular

```powershell
npm start
```

1. Instale **Expo Go** (Android ou iOS)
2. Escaneie o QR code do terminal
3. Celular e PC na mesma rede Wi‑Fi

## Comandos úteis

| Comando | Ação |
|---------|------|
| `npm run web` | Abre no navegador |
| `npm start` | Dev server + QR code |
| `npm run android` | Emulador Android (se configurado) |
