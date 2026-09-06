# Publicar App-Hyrox no GitHub (rode no PowerShell)
$env:Path = "C:\Program Files\GitHub CLI;C:\Program Files\Git\bin;" + $env:Path
Set-Location $PSScriptRoot\..

Write-Host "=== 1/3 Login GitHub (abre o navegador) ===" -ForegroundColor Cyan
gh auth login -h github.com -p https -w
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "=== 2/3 Criar repositório e enviar branch ===" -ForegroundColor Cyan
$remote = git remote get-url origin 2>$null
if (-not $remote) {
  gh repo create App-Hyrox --public --description "App mobile para competições Hyrox" --source . --remote origin --push
} else {
  git push -u origin feat/hyrox-app-mvp
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "=== 3/3 Criar Pull Request ===" -ForegroundColor Cyan
gh pr create --base main --head feat/hyrox-app-mvp --title "feat: app Hyrox com duplas, encerramento e Supabase" --body @"
## Summary
- App mobile Expo: eventos, atletas, duplas, cronômetro e ranking
- Encerramento de evento só pelo criador, com validação de participantes finalizados
- Schema Supabase com doubles_pairs e sync opcional do status finished

## Test plan
- [ ] Criar evento novo (+ Novo evento)
- [ ] Inscrever atletas e formar duplas
- [ ] Finalizar participantes no cronômetro
- [ ] Encerrar evento e verificar badge Evento encerrado na home
- [ ] Rodar setup_completo.sql no Supabase (opcional)
"@

Write-Host "Pronto!" -ForegroundColor Green
