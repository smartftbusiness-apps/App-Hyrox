import { createEphemeralSupabase, getSupabase, isSupabaseConfigured } from '@/src/lib/supabase';
import type { EventStaffMember } from '@/src/stores/eventStaffStore';
import type { RepositoryResult } from '@/src/api/repositoryTypes';
import { translateAuthError } from '@/src/utils/authErrors';

type DbStaffListRow = {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  station_order: number | null;
};

type JudgeAssignmentRow = {
  event_id: string;
  station_order: number | null;
};

export type RegisterJudgeResult = {
  staffId: string;
  createdAccount: boolean;
  loginReady: boolean;
};

async function bootstrapOrganizerProfile(): Promise<void> {
  const { error } = await getSupabase().rpc('bootstrap_organizer_profile');
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('function') && msg.includes('does not exist')) return;
    throw new Error(error.message);
  }
}

async function assertOrganizerOwnsEvent(
  eventSupabaseId: string,
): Promise<RepositoryResult<void>> {
  const {
    data: { user: authUser },
  } = await getSupabase().auth.getUser();
  if (!authUser) {
    return { ok: false, reason: 'Faça login como organizador para cadastrar juízes.' };
  }

  const { data: eventRow, error: eventError } = await getSupabase()
    .from('events')
    .select('organizer_id')
    .eq('id', eventSupabaseId)
    .maybeSingle();

  if (eventError) return { ok: false, reason: eventError.message };
  if (!eventRow) {
    return {
      ok: false,
      reason: 'Evento não encontrado na nuvem. Sincronize o evento e tente de novo.',
    };
  }
  if (eventRow.organizer_id !== authUser.id) {
    return {
      ok: false,
      reason:
        'Sua conta não é a organizadora deste evento na nuvem. Saia, entre como organizador e sincronize o evento (abra o evento e aguarde alguns segundos).',
    };
  }
  return { ok: true, data: undefined };
}

async function lookupUserIdByEmail(email: string): Promise<string | null> {
  const { data: userId, error: lookupError } = await getSupabase().rpc(
    'lookup_profile_id_by_email',
    { p_email: email },
  );

  if (lookupError) {
    const msg = lookupError.message.toLowerCase();
    if (msg.includes('function') && msg.includes('does not exist')) {
      throw new Error(
        'Funções do banco ausentes. Rode o arquivo setup_completo.sql no SQL Editor do Supabase.',
      );
    }
    throw new Error(lookupError.message);
  }

  return (userId as string | null) ?? null;
}

async function insertEventStaff(
  eventSupabaseId: string,
  userId: string,
  stationOrder: number | null,
): Promise<RepositoryResult<string>> {
  const { data, error } = await getSupabase()
    .from('event_staff')
    .insert({
      event_id: eventSupabaseId,
      user_id: userId,
      station_order: stationOrder,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, reason: 'Este juiz já está designado para o evento.' };
    }
    if (error.code === '42501') {
      return {
        ok: false,
        reason:
          'Sem permissão no banco. Confirme que rodou setup_completo.sql no Supabase e que está logado como organizador.',
      };
    }
    return { ok: false, reason: error.message };
  }

  return { ok: true, data: data.id as string };
}

async function ensureJudgeProfileForOrganizer(
  userId: string,
  fullName: string,
): Promise<RepositoryResult<void>> {
  const { error: profileError } = await getSupabase().rpc('ensure_judge_profile_for_organizer', {
    p_user_id: userId,
    p_full_name: fullName.trim(),
  });

  if (profileError) {
    const msg = profileError.message.toLowerCase();
    if (msg.includes('function') && msg.includes('does not exist')) {
      return { ok: true, data: undefined };
    }
    return { ok: false, reason: profileError.message };
  }

  return { ok: true, data: undefined };
}

async function setJudgePasswordForOrganizer(
  userId: string,
  password: string,
): Promise<RepositoryResult<void>> {
  if (password.length < 6) {
    return { ok: false, reason: 'A senha precisa ter pelo menos 6 caracteres.' };
  }

  const { error } = await getSupabase().rpc('set_judge_password_for_organizer', {
    p_user_id: userId,
    p_password: password,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('function') && msg.includes('does not exist')) {
      return {
        ok: false,
        reason:
          'Função set_judge_password_for_organizer ausente. Rode a migration 011 no Supabase.',
      };
    }
    return { ok: false, reason: error.message };
  }

  return { ok: true, data: undefined };
}

async function verifyJudgeLogin(email: string, password: string): Promise<RepositoryResult<void>> {
  const ephemeral = createEphemeralSupabase();
  const { error } = await ephemeral.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    return { ok: false, reason: translateAuthError(error.message) };
  }

  await ephemeral.auth.signOut();
  return { ok: true, data: undefined };
}

async function confirmJudgeCanLogin(userId: string): Promise<boolean> {
  const { error: confirmError } = await getSupabase().rpc('confirm_judge_email_for_organizer', {
    p_user_id: userId,
  });

  if (confirmError) {
    const msg = confirmError.message.toLowerCase();
    if (msg.includes('function') && msg.includes('does not exist')) return false;
    if (msg.includes('staff') || msg.includes('juiz')) return false;
    throw new Error(confirmError.message);
  }

  return true;
}

async function createJudgeAccount(
  fullName: string,
  email: string,
  password: string,
): Promise<RepositoryResult<string>> {
  if (password.length < 6) {
    return { ok: false, reason: 'A senha inicial precisa ter pelo menos 6 caracteres.' };
  }

  const ephemeral = createEphemeralSupabase();
  const { data, error } = await ephemeral.auth.signUp({
    email,
    password,
    options: {
      data: { role: 'staff', full_name: fullName.trim() },
    },
  });

  if (error) {
    const lower = error.message.toLowerCase();
    if (lower.includes('already registered') || lower.includes('already been registered')) {
      return { ok: false, reason: '__existing__' };
    }
    return { ok: false, reason: translateAuthError(error.message) };
  }

  if (data.user?.identities?.length === 0) {
    return { ok: false, reason: '__existing__' };
  }

  const userId = data.user?.id;
  if (!userId) {
    return { ok: false, reason: 'Não foi possível criar a conta do juiz. Tente novamente.' };
  }

  return { ok: true, data: userId };
}

export type OrganizerJudge = {
  userId: string;
  email: string;
  fullName: string | null;
  eventsCount: number;
};

export async function fetchOrganizerJudges(): Promise<OrganizerJudge[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabase().rpc('list_organizer_judges');
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('function') && msg.includes('does not exist')) return [];
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<{
    user_id: string;
    email: string;
    full_name: string | null;
    events_count: number;
  }>).map((row) => ({
    userId: row.user_id,
    email: row.email ?? '',
    fullName: row.full_name,
    eventsCount: Number(row.events_count ?? 0),
  }));
}

/** Designa juiz já cadastrado a este evento (sem recriar conta). */
export async function assignExistingJudgeToEvent(
  eventSupabaseId: string,
  userId: string,
  stationOrder?: number | null,
): Promise<RepositoryResult<string>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase não configurado' };
  }
  if (stationOrder != null && stationOrder < 1) {
    return { ok: false, reason: 'Selecione a estação do juiz' };
  }

  const organizerCheck = await assertOrganizerOwnsEvent(eventSupabaseId);
  if (!organizerCheck.ok) return organizerCheck;

  return insertEventStaff(eventSupabaseId, userId, stationOrder ?? null);
}

export async function fetchStaffForEvent(eventSupabaseId: string): Promise<EventStaffMember[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabase().rpc('list_event_staff', {
    p_event_id: eventSupabaseId,
  });

  if (error) {
    const { data: fallback, error: fallbackError } = await getSupabase()
      .from('event_staff')
      .select('id, user_id, station_order')
      .eq('event_id', eventSupabaseId);

    if (fallbackError || !fallback) return [];

    return fallback.map((row) => ({
      id: row.id as string,
      userId: row.user_id as string,
      email: '',
      fullName: null,
      stationOrder: (row.station_order as number | null) ?? null,
    }));
  }

  return (data as DbStaffListRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.email ?? '',
    fullName: row.full_name,
    stationOrder: row.station_order ?? null,
  }));
}

export async function fetchMyJudgeAssignments(): Promise<JudgeAssignmentRow[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabase().rpc('list_my_judge_assignments');
  if (error || !data) {
    const {
      data: { user },
    } = await getSupabase().auth.getUser();
    if (!user) return [];
    const { data: fallback } = await getSupabase()
      .from('event_staff')
      .select('event_id, station_order')
      .eq('user_id', user.id);
    return (fallback ?? []) as JudgeAssignmentRow[];
  }

  return data as JudgeAssignmentRow[];
}

function isMissingDatabaseObject(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('could not find the function') ||
    msg.includes('schema cache') ||
    msg.includes('could not find the table')
  );
}

async function addJudgeToOrganizerRoster(userId: string): Promise<RepositoryResult<void>> {
  const { error } = await getSupabase().rpc('add_organizer_judge_to_roster', {
    p_user_id: userId,
  });

  if (!error) return { ok: true, data: undefined };

  if (!isMissingDatabaseObject(error.message)) {
    return { ok: false, reason: error.message };
  }

  const {
    data: { user },
  } = await getSupabase().auth.getUser();
  if (!user) return { ok: true, data: undefined };

  const { error: insertError } = await getSupabase().from('organizer_judge_roster').upsert(
    { organizer_id: user.id, user_id: userId },
    { onConflict: 'organizer_id,user_id' },
  );

  if (insertError && !isMissingDatabaseObject(insertError.message)) {
    return { ok: false, reason: insertError.message };
  }

  return { ok: true, data: undefined };
}

async function provisionJudgeAccount(
  fullName: string,
  email: string,
  password: string,
): Promise<
  RepositoryResult<{
    userId: string;
    createdAccount: boolean;
    loginReady: boolean;
  }>
> {
  const name = fullName.trim();
  const trimmed = email.trim().toLowerCase();
  if (!name) return { ok: false, reason: 'Informe o nome do juiz' };
  if (!trimmed) return { ok: false, reason: 'Informe o e-mail do juiz' };

  try {
    await bootstrapOrganizerProfile();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao validar organizador';
    return { ok: false, reason: message };
  }

  let userId: string | null = null;
  let createdAccount = false;
  let loginReady = true;

  try {
    userId = await lookupUserIdByEmail(trimmed);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar juiz';
    return { ok: false, reason: message };
  }

  if (!userId) {
    if (!password || password.length < 6) {
      return { ok: false, reason: 'Defina uma senha inicial com pelo menos 6 caracteres.' };
    }
    const created = await createJudgeAccount(name, trimmed, password);
    if (!created.ok) {
      if (created.reason === '__existing__') {
        try {
          userId = await lookupUserIdByEmail(trimmed);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Erro ao buscar juiz';
          return { ok: false, reason: message };
        }
        if (!userId) {
          return {
            ok: false,
            reason: 'Este e-mail já tem conta, mas não foi possível vinculá-lo. Tente de novo.',
          };
        }
      } else {
        return created;
      }
    } else {
      userId = created.data!;
      createdAccount = true;
    }
  }

  const ensured = await ensureJudgeProfileForOrganizer(userId, name);
  if (!ensured.ok) return ensured;

  if (!password || password.length < 6) {
    return { ok: false, reason: 'Defina uma senha inicial com pelo menos 6 caracteres.' };
  }

  if (!createdAccount) {
    const passwordSet = await setJudgePasswordForOrganizer(userId, password);
    if (!passwordSet.ok) return passwordSet;
  }

  try {
    loginReady = await confirmJudgeCanLogin(userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao liberar login do juiz';
    return { ok: false, reason: message };
  }

  const loginCheck = await verifyJudgeLogin(trimmed, password);
  if (!loginCheck.ok) {
    return {
      ok: false,
      reason: `Senha não funcionou no login: ${loginCheck.reason}`,
    };
  }

  await addJudgeToOrganizerRoster(userId);

  return { ok: true, data: { userId, createdAccount, loginReady } };
}

/** Cadastra juiz na conta do organizador (sem designar a um evento ainda). */
export async function registerOrganizerJudge(
  fullName: string,
  email: string,
  password: string,
): Promise<RepositoryResult<RegisterJudgeResult>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase não configurado' };
  }

  const provisioned = await provisionJudgeAccount(fullName, email, password);
  if (!provisioned.ok) return provisioned;

  return {
    ok: true,
    data: {
      staffId: provisioned.data.userId,
      createdAccount: provisioned.data.createdAccount,
      loginReady: provisioned.data.loginReady,
    },
  };
}
/** Organizador cria a conta do juiz (se necessário) e designa ao evento. */
export async function registerJudgeForEvent(
  eventSupabaseId: string,
  fullName: string,
  email: string,
  password: string,
  stationOrder?: number | null,
): Promise<RepositoryResult<RegisterJudgeResult>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase não configurado' };
  }

  if (stationOrder != null && stationOrder < 1) {
    return { ok: false, reason: 'Selecione a estação do juiz' };
  }

  const organizerCheck = await assertOrganizerOwnsEvent(eventSupabaseId);
  if (!organizerCheck.ok) return organizerCheck;

  const provisioned = await provisionJudgeAccount(fullName, email, password);
  if (!provisioned.ok) return provisioned;

  const inserted = await insertEventStaff(
    eventSupabaseId,
    provisioned.data.userId,
    stationOrder ?? null,
  );
  if (!inserted.ok) return inserted;

  return {
    ok: true,
    data: {
      staffId: inserted.data!,
      createdAccount: provisioned.data.createdAccount,
      loginReady: provisioned.data.loginReady,
    },
  };
}

export async function reactivateJudgeLogin(
  userId: string,
  email: string,
  password: string,
): Promise<RepositoryResult<boolean>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase não configurado' };
  }

  const {
    data: { user: authUser },
  } = await getSupabase().auth.getUser();
  if (!authUser) {
    return { ok: false, reason: 'Faça login como organizador.' };
  }

  const passwordSet = await setJudgePasswordForOrganizer(userId, password);
  if (!passwordSet.ok) return passwordSet;

  try {
    await confirmJudgeCanLogin(userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao liberar login';
    return { ok: false, reason: message };
  }

  const loginCheck = await verifyJudgeLogin(email, password);
  if (!loginCheck.ok) {
    return { ok: false, reason: loginCheck.reason };
  }

  return { ok: true, data: true };
}

export async function updateEventStaffStation(
  staffRowId: string,
  stationOrder: number,
): Promise<RepositoryResult<void>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase não configurado' };
  }
  if (!stationOrder || stationOrder < 1) {
    return { ok: false, reason: 'Selecione uma estação válida' };
  }

  const { error } = await getSupabase()
    .from('event_staff')
    .update({ station_order: stationOrder })
    .eq('id', staffRowId);

  if (error) return { ok: false, reason: error.message };
  return { ok: true, data: undefined };
}

export async function clearEventStaffStation(
  staffRowId: string,
): Promise<RepositoryResult<void>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase não configurado' };
  }

  const { error } = await getSupabase()
    .from('event_staff')
    .update({ station_order: null })
    .eq('id', staffRowId);

  if (error) return { ok: false, reason: error.message };
  return { ok: true, data: undefined };
}

export async function removeEventStaff(staffRowId: string): Promise<RepositoryResult<void>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase não configurado' };
  }

  const { error } = await getSupabase().from('event_staff').delete().eq('id', staffRowId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, data: undefined };
}
