-- Acrescenta 6 filmes abertos da Blender ao catalogo (de 3 para 9 videos; o guia pede 8 ou mais).
-- Rodar depois do 02-dados-exemplo.sql, como postgres:
--   psql -v ON_ERROR_STOP=1 -d streaming -f 04-mais-videos.sql
-- Ja foi aplicado na db em 2026-10-27. Nao rodar de novo: repetiria os videos.
-- IDs conferidos no YouTube em 2026-10-27 (titulo pelo oEmbed, duracao = lengthSeconds
-- da pagina do video; todos publicos e liberados para incorporar).
BEGIN;

INSERT INTO videos (titulo, descricao, duracao_segundos, arquivo, categoria_id) VALUES
    ('Elephants Dream',
     'Dois homens percorrem uma máquina gigante e estranha, que um deles acredita controlar.',
     654, 'TLkA0RELQ1g',
     (SELECT id FROM categorias WHERE nome = 'Ficção científica')),
    ('Cosmos Laundromat',
     'Uma ovelha deprimida recebe de um vendedor misterioso a chance de viver outras vidas.',
     731, 'Y-rmzh0PI3c',
     (SELECT id FROM categorias WHERE nome = 'Ficção científica')),
    ('Spring',
     'Uma pastora e seu cão enfrentam espíritos antigos para que a primavera volte.',
     464, 'WhWc3b3KhnY',
     (SELECT id FROM categorias WHERE nome = 'Animação')),
    ('Sprite Fright',
     'Adolescentes em um passeio na floresta descobrem que os pequenos seres do lugar não são nada amigáveis.',
     630, '_cMxraX_5RE',
     (SELECT id FROM categorias WHERE nome = 'Animação')),
    ('Coffee Run',
     'Uma corrida desesperada pela cidade movida a café.',
     185, 'PVGeM40dABA',
     (SELECT id FROM categorias WHERE nome = 'Animação')),
    ('Agent 327: Operation Barbershop',
     'O agente secreto 327 investiga uma barbearia suspeita em Amsterdã.',
     232, 'mN0zPOpADL4',
     (SELECT id FROM categorias WHERE nome = 'Animação'));

COMMIT;

SELECT v.id, v.titulo, c.nome AS categoria, v.duracao_segundos, v.arquivo
FROM videos v JOIN categorias c ON c.id = v.categoria_id ORDER BY v.id;
