-- Seed: template Hyrox oficial (16 segmentos)
-- Seguro para rodar mais de uma vez

insert into course_templates (id, name, is_official_hyrox, segment_count)
values ('00000000-0000-0000-0000-000000000001', 'Hyrox Singles Oficial', true, 16)
on conflict (id) do nothing;

insert into segments (course_template_id, order_index, type, name, target_value) values
  ('00000000-0000-0000-0000-000000000001', 1,  'run',     'Run 1',                '1 km'),
  ('00000000-0000-0000-0000-000000000001', 2,  'station', 'SkiErg',               '1000 m'),
  ('00000000-0000-0000-0000-000000000001', 3,  'run',     'Run 2',                '1 km'),
  ('00000000-0000-0000-0000-000000000001', 4,  'station', 'Sled Push',            '50 m'),
  ('00000000-0000-0000-0000-000000000001', 5,  'run',     'Run 3',                '1 km'),
  ('00000000-0000-0000-0000-000000000001', 6,  'station', 'Sled Pull',            '50 m'),
  ('00000000-0000-0000-0000-000000000001', 7,  'run',     'Run 4',                '1 km'),
  ('00000000-0000-0000-0000-000000000001', 8,  'station', 'Burpee Broad Jumps',   '80 m'),
  ('00000000-0000-0000-0000-000000000001', 9,  'run',     'Run 5',                '1 km'),
  ('00000000-0000-0000-0000-000000000001', 10, 'station', 'Rowing',               '1000 m'),
  ('00000000-0000-0000-0000-000000000001', 11, 'run',     'Run 6',                '1 km'),
  ('00000000-0000-0000-0000-000000000001', 12, 'station', 'Farmers Carry',        '200 m'),
  ('00000000-0000-0000-0000-000000000001', 13, 'run',     'Run 7',                '1 km'),
  ('00000000-0000-0000-0000-000000000001', 14, 'station', 'Sandbag Lunges',       '100 m'),
  ('00000000-0000-0000-0000-000000000001', 15, 'run',     'Run 8',                '1 km'),
  ('00000000-0000-0000-0000-000000000001', 16, 'station', 'Wall Balls',           '100 reps')
on conflict (course_template_id, order_index) do nothing;
