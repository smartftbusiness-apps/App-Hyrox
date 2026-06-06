# Publicação — Google Play e Apple App Store

## Pré-requisitos

| Item | Google Play | Apple App Store |
|------|-------------|-----------------|
| Conta desenvolvedor | Play Console (~US$ 25) | Apple Developer (~US$ 99/ano) |
| Build | `.aab` (Android App Bundle) | `.ipa` via Xcode ou EAS |
| Política de privacidade | URL obrigatória | URL obrigatória |
| Idade mínima | Questionário de conteúdo | Classificação etária |

## Pipeline recomendado (Expo EAS)

```bash
# Instalar EAS CLI
npm install -g eas-cli

# Login Expo
eas login

# Configurar projeto
eas build:configure

# Build produção
eas build --platform android --profile production
eas build --platform ios --profile production

# Submissão
eas submit --platform android
eas submit --platform ios
```

## Assets necessários

- Ícone 1024×1024 (sem transparência iOS)
- Splash screen
- Screenshots: phone 6.7", 6.1" (iOS); phone + tablet (Android)
- Texto curto (80 chars) e longo (4000 chars) PT + EN
- Categoria: **Esportes**

## LGPD / Privacidade

Dados coletados (mínimo):
- Organizador: e-mail, nome
- Atletas: nome, categoria, tempos (inseridos pelo organizador)

Incluir no app:
- Link para política de privacidade
- Opção de exclusão de conta (organizador)
- Consentimento para eventos não oficiais

## Testes antes da loja

1. **Play Internal Testing** — grupo fechado 10+ testers  
2. **TestFlight** — beta iOS 7–14 dias  
3. Evento piloto real com cronometragem offline  
4. Verificar sync após reconexão  

## Motivos comuns de rejeição

| Loja | Problema | Solução |
|------|----------|---------|
| Apple | App “muito simples” / web view | Funcionalidade nativa offline + timing |
| Apple | Login sem Sign in with Apple | Adicionar se houver Google/email social |
| Google | Data safety incompleto | Declarar todos os campos coletados |
| Ambas | Crash no launch | Testar release build, não só dev |

## Cronograma típico pós-build

| Etapa | Prazo |
|-------|-------|
| Revisão Google Play | 1–7 dias |
| Revisão App Store | 1–3 dias (pode haver ida e volta) |
| Primeira publicação | +1 semana após betas OK |
