-- Esquema do banco "streaming".
-- Rodar conectado ao banco streaming:  psql -d streaming -f 01-esquema.sql
-- ATENCAO: apaga as tabelas antes de criar, ou seja, apaga todos os dados.

DROP TABLE IF EXISTS reproducoes;
DROP TABLE IF EXISTS videos;
DROP TABLE IF EXISTS categorias;

CREATE TABLE categorias (
    id   SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE videos (
    id               SERIAL PRIMARY KEY,
    titulo           VARCHAR(200) NOT NULL,
    descricao        TEXT,
    duracao_segundos INTEGER NOT NULL CHECK (duracao_segundos > 0),
    arquivo          VARCHAR(255) NOT NULL,  -- ID do video no YouTube (ex.: aqz-KE-bpKQ)
    categoria_id     INTEGER NOT NULL REFERENCES categorias (id)
);

CREATE TABLE reproducoes (
    id             SERIAL PRIMARY KEY,
    video_id       INTEGER NOT NULL REFERENCES videos (id),
    data_hora      TIMESTAMP NOT NULL DEFAULT now(),
    no_responsavel VARCHAR(20) NOT NULL       -- valor de NOME_DO_NO: NO_A ou NO_B
);
