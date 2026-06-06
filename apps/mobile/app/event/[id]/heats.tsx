import { Stack } from 'expo-router';

import { useState } from 'react';

import { Alert, StyleSheet, Text } from 'react-native';

import { Button } from '@/components/ui/Button';

import { Card } from '@/components/ui/Card';

import { EventNotFound } from '@/components/EventNotFound';

import { Input } from '@/components/ui/Input';

import { Screen } from '@/components/ui/Screen';

import { HyroxTheme } from '@/constants/Theme';

import { useEvent } from '@/src/hooks/useEvent';

import { useEventPermissions } from '@/src/hooks/useEventPermissions';

import { useRouteId } from '@/src/hooks/useRouteId';

import { useEventsStore } from '@/src/stores/eventsStore';

import { getCategoryDisplayName } from '@/src/utils/categoryLabel';



export default function EventHeatsScreen() {

  const eventId = useRouteId();

  const event = useEvent(eventId);

  const perms = useEventPermissions(event);

  const addHeat = useEventsStore((s) => s.addHeat);

  const removeHeat = useEventsStore((s) => s.removeHeat);

  const [name, setName] = useState('');

  const [time, setTime] = useState('08:00');



  if (!event || !eventId) {
    return (
      <>
        <Stack.Screen options={{ title: 'Baterias' }} />
        <EventNotFound />
      </>
    );
  }



  if (!perms.canEditStructure) {

    return (

      <>

        <Stack.Screen options={{ title: 'Baterias' }} />

        <Screen>

          <Text style={styles.denied}>Somente o organizador pode editar baterias.</Text>

        </Screen>

      </>

    );

  }



  const heats = event.heats ?? [];
  const ev = event;
  const eid = eventId;

  function handleAdd() {
    if (!name.trim()) {
      Alert.alert('Nome', 'Informe o nome da bateria (ex: Bateria 1).');
      return;
    }
    const [h, m] = time.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) {
      Alert.alert('Horário', 'Use formato HH:MM (ex: 08:30).');
      return;
    }
    const eventDate = new Date(ev.date);
    eventDate.setHours(h, m, 0, 0);
    const result = addHeat(eid, {

      name: name.trim(),

      scheduledStartAt: eventDate.toISOString(),

    });

    if (!result.ok) Alert.alert('Erro', result.reason);

    else {

      setName('');

      Alert.alert('Bateria criada', 'No cronômetro, iniciar a bateria dispara o tempo dos atletas.');

    }

  }



  return (

    <>

      <Stack.Screen options={{ title: 'Baterias' }} />

      <Screen scroll>

        <Text style={styles.heading}>Baterias de largada</Text>

        <Text style={styles.subheading}>

          Defina horários planejados. Ao tocar &quot;Iniciar bateria&quot; no cronômetro, o start da

          bateria amarra o start do cronômetro dos participantes.

        </Text>



        <Input label="Nome da bateria" value={name} onChangeText={setName} placeholder="Bateria 1" />

        <Input

          label="Horário planejado (HH:MM)"

          value={time}

          onChangeText={setTime}

          placeholder="08:00"

        />

        <Button label="Adicionar bateria" onPress={handleAdd} style={{ marginBottom: 24 }} />



        {heats.length === 0 ? (

          <Card title="Nenhuma bateria" subtitle="Crie baterias para organizar as largadas." />

        ) : (

          heats.map((heat) => (

            <Card

              key={heat.id}

              title={heat.name}

              subtitle={new Date(heat.scheduledStartAt).toLocaleString('pt-BR')}

              badge={heat.startedAt ? 'Iniciada' : 'Aguardando'}

              badgeColor={heat.startedAt ? HyroxTheme.success + '33' : HyroxTheme.warning + '33'}>

              {heat.categoryIds.length > 0 && (

                <Text style={styles.meta}>

                  Categorias:{' '}

                  {heat.categoryIds

                    .map((cid) => {

                      const cat = event.categories.find((c) => c.id === cid);

                      return cat ? getCategoryDisplayName(cat) : cid;

                    })

                    .join(', ')}

                </Text>

              )}

              <Button

                label="Remover"

                variant="danger"

                onPress={() => {

                  const r = removeHeat(eid, heat.id);

                  if (!r.ok) Alert.alert('Erro', r.reason);

                }}

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

  meta: { color: HyroxTheme.textMuted, fontSize: 13, marginBottom: 4 },

});

