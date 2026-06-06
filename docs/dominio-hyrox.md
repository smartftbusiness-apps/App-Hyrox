# Domínio Hyrox — Referência para o app

## Sequência oficial (Singles)

Cada atleta completa **16 segmentos** nesta ordem:

1. Run — 1 km  
2. SkiErg — 1.000 m  
3. Run — 1 km  
4. Sled Push — 50 m  
5. Run — 1 km  
6. Sled Pull — 50 m  
7. Run — 1 km  
8. Burpee Broad Jumps — 80 m  
9. Run — 1 km  
10. Rowing — 1.000 m  
11. Run — 1 km  
12. Farmers Carry — 200 m  
13. Run — 1 km  
14. Sandbag Lunges — 100 m  
15. Run — 1 km  
16. Wall Balls — 100 reps  

## Divisões comuns

| Divisão | Descrição |
|---------|-----------|
| Open | Pesos padrão, individual |
| Pro | Pesos mais pesados, individual |
| Doubles | Dupla; corridas juntos, workouts divididos |
| Relay | Equipe de 4; cada um faz 2 runs + 2 estações |

Subcategorias por **gênero** (Masculino / Feminino / Misto em Doubles).

## Pesos de referência (Open Singles — valores típicos)

> Confirmar sempre no rulebook da temporada atual em [hyrox.com](https://hyrox.com).

| Estação | Homens (Open) | Mulheres (Open) |
|---------|---------------|-----------------|
| Sled Push | ~152 kg | ~102 kg |
| Sled Pull | ~103 kg | ~78 kg |
| Farmers Carry | 2×32 kg | 2×24 kg |
| Sandbag Lunges | 30 kg | 20 kg |
| Wall Ball | 6 kg | 4 kg |

Pro usa cargas superiores; o app deve permitir **override por evento** para provas não oficiais.

## Penalidades comuns (rulebook)

- Saída incorreta da estação: **+2 min**
- Uso de equipamento/lane não designado: **+2 min**
- Cooling com água na pista: **+2 min**

O app deve ter códigos de penalidade pré-cadastrados + campo livre.

## Roxzone

Tempo entre arco de saída da corrida e início da estação (e vice-versa). Não é um “exercício”, mas impacta o tempo total percebido. Implementação sugerida:

- **MVP:** incluir roxzone dentro do tempo de cada segmento de corrida/estação  
- **v1.1:** segmento virtual `roxzone` entre corrida e estação para análise

## Entidades no app

```text
CourseTemplate  → 16 Segmentos ordenados
Event           → usa template + data/local
Category        → Open M, Open F, Pro M, …
Athlete         → inscrito em 1 categoria
AthleteRun      → uma tentativa/prova do atleta
SegmentTime     → duração + penalidades por segmento
```
