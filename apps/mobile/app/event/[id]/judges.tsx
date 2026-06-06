import { Stack } from 'expo-router';

import { useCallback, useEffect, useState } from 'react';

import { Alert, StyleSheet, Text } from 'react-native';

import { Button } from '@/components/ui/Button';

import { Card } from '@/components/ui/Card';

import { EventNotFound } from '@/components/EventNotFound';

import { Input } from '@/components/ui/Input';

import { Screen } from '@/components/ui/Screen';

import { HyroxTheme } from '@/constants/Theme';

import {

  addEventStaffByEmail,

  fetchStaffForEvent,

  removeEventStaff,

} from '@/src/api/staffRepository';

import { useEvent } from '@/src/hooks/useEvent';

import { useEventPermissions } from '@/src/hooks/useEventPermissions';

import { useRouteId } from '@/src/hooks/useRouteId';

import { useEventStaffStore, type EventStaffMember } from '@/src/stores/eventStaffStore';



export default function EventJudgesScreen() {

  const eventId = useRouteId();

  const event = useEvent(eventId);

  const perms = useEventPermissions(event);

  const [email, setEmail] = useState('');

  const [loading, setLoading] = useState(false);

  const staff = useEventStaffStore((s) =>
    eventId ? (s.staffByEvent[eventId] ?? []) : [],
  );

  const loadStaff = useCallback(async () => {
    if (!eventId || !event?.supabaseId) return;
    const rows = await fetchStaffForEvent(event.supabaseId);
    useEventStaffStore.getState().setStaffForEvent(eventId, rows);
  }, [event?.supabaseId, eventId]);



  useEffect(() => {

    void loadStaff();

  }, [loadStaff]);



  if (!event || !eventId) {
    return (
      <>
        <Stack.Screen options={{ title: 'Juízes' }} />
        <EventNotFound />
      </>
    );
  }



  if (!perms.canManageJudges) {

    return (

      <>

        <Stack.Screen options={{ title: 'Juízes' }} />

        <Screen>

          <Text style={styles.denied}>Somente o organizador pode designar juízes.</Text>

        </Screen>

      </>

    );

  }



  const ev = event;
  const eid = eventId;

  async function handleAdd() {
    if (!ev.supabaseId) {
      Alert.alert('Nuvem', 'Sincronize o evento com a nuvem antes de designar juízes.');
      return;
    }
    setLoading(true);
    try {
      const result = await addEventStaffByEmail(ev.supabaseId, email);

      if (!result.ok) {

        Alert.alert('Não foi possível', result.reason);

        return;

      }

      setEmail('');

      await loadStaff();

      Alert.alert('Juiz adicionado', 'O usuário verá o evento ao entrar como Juiz.');

    } finally {

      setLoading(false);

    }

  }



  async function handleRemove(staffRowId: string) {

    const result = await removeEventStaff(staffRowId);

    if (!result.ok) {

      Alert.alert('Erro', result.reason);

      return;

    }

    await loadStaff();

  }



  return (

    <>

      <Stack.Screen options={{ title: 'Juízes' }} />

      <Screen scroll>

        <Text style={styles.heading}>Designar juízes</Text>

        <Text style={styles.subheading}>

          Juízes têm leitura do evento e podem controlar o cronômetro. Eles precisam ter conta com

          perfil Juiz no app.

        </Text>



        <Input

          label="E-mail do juiz"

          value={email}

          onChangeText={setEmail}

          placeholder="juiz@email.com"

          keyboardType="email-address"

          autoCapitalize="none"

        />

        <Button

          label={loading ? 'Adicionando…' : 'Adicionar juiz'}

          disabled={loading || !email.trim()}

          onPress={handleAdd}

          style={{ marginBottom: 20 }}

        />



        {staff.length === 0 ? (

          <Card title="Nenhum juiz" subtitle="Adicione pelo e-mail usado no cadastro." />

        ) : (

          staff.map((member: EventStaffMember) => (

            <Card

              key={member.id}

              title={member.fullName || 'Juiz'}

              subtitle={member.email || member.userId.slice(0, 8) + '…'}>

              <Button

                label="Remover"

                variant="danger"

                onPress={() => handleRemove(member.id)}

                style={{ marginTop: 8 }}

              />

            </Card>

          ))

        )}

      </Screen>

    </>

  );

}



const styles = StyleSheet.create({

  heading: { color: HyroxTheme.text, fontSize: 22, fontWeight: '800', marginBottom: 8 },

  subheading: { color: HyroxTheme.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 16 },

  denied: { color: HyroxTheme.textMuted, fontSize: 15, padding: 16 },

});

