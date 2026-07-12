export function translateAuthError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos. Se o organizador acabou de cadastrar você, use exatamente a senha que ele definiu. Contas antigas usam a senha anterior.';
  }
  if (lower.includes('email not confirmed')) {
    return 'E-mail ainda não confirmado. Abra o link que o Supabase enviou (verifique spam) ou peça para confirmar no painel.';
  }
  if (lower.includes('user already registered')) {
    return 'Este e-mail já tem conta. Use Entrar em vez de Criar conta.';
  }
  if (lower.includes('password should be at least')) {
    return 'A senha precisa ter pelo menos 6 caracteres.';
  }
  if (lower.includes('unable to validate email')) {
    return 'E-mail inválido. Verifique se digitou corretamente.';
  }
  if (lower.includes('email rate limit exceeded')) {
    return 'Limite de e-mails do Supabase atingido. Aguarde cerca de 1 hora ou use Entrar se a conta já foi criada. O organizador pode confirmar o e-mail manualmente no painel do Supabase.';
  }
  if (lower.includes('request path invalid') || lower.includes('redirect')) {
    return 'Link de confirmação inválido. No Supabase, em Authentication → URL Configuration, adicione apphyrox://auth em Redirect URLs.';
  }
  if (lower.includes('no api key found')) {
    return 'Configuração do Supabase ausente neste APK. Instale o build mais recente (jwt-v2).';
  }
  if (lower.includes('invalid jwt')) {
    return 'Sessão antiga ou expirada neste celular. Toque em "Limpar cache" na tela de conta e entre de novo.';
  }
  if (lower.includes('invalid api key')) {
    return 'Chave do Supabase inválida neste APK. Desinstale o app, instale o build mais recente e tente de novo.';
  }

  return message;
}

export function translateSyncError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('schema cache') || lower.includes('could not find the table')) {
    return 'As tabelas do app ainda não existem no Supabase. Rode o arquivo setup_completo.sql no SQL Editor do projeto.';
  }
  if (lower.includes('invalid jwt')) {
    return 'Sessão antiga na nuvem. Saia da conta, use "Limpar cache" e entre de novo.';
  }
  if (lower.includes('invalid api key')) {
    return 'Chave do Supabase inválida. Confira o arquivo .env ou gere um APK novo.';
  }

  return message;
}
