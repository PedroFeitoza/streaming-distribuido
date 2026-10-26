-- Catalogo de exemplo. Rodar depois do 01-esquema.sql:
--   psql -d streaming -f 02-dados-exemplo.sql
-- Os videos sao filmes abertos da Blender Foundation publicados no YouTube.
-- A coluna arquivo guarda so o ID do video (o trecho depois de "watch?v=").

INSERT INTO categorias (nome) VALUES
    ('Animação'),
    ('Ficção científica');

INSERT INTO videos (titulo, descricao, duracao_segundos, arquivo, categoria_id) VALUES
    ('Big Buck Bunny',
     'Um coelho gigante e pacato decide dar o troco em três roedores que o provocam.',
     634, 'aqz-KE-bpKQ',
     (SELECT id FROM categorias WHERE nome = 'Animação')),
    ('Sintel',
     'Uma jovem atravessa terras perigosas procurando o filhote de dragão que criou.',
     888, 'eRsGyueVLvQ',
     (SELECT id FROM categorias WHERE nome = 'Animação')),
    ('Tears of Steel',
     'Em Amsterdã, cientistas tentam salvar o mundo de robôs com a ajuda de uma lembrança.',
     734, 'R6MlUcmOul8',
     (SELECT id FROM categorias WHERE nome = 'Ficção científica'));

-- A tabela reproducoes comeca vazia: quem grava nela e a aplicacao (etapa 5).
