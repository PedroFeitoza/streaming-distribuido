-- Permissoes minimas do usuario da aplicacao.
-- Rodar como administrador (postgres), depois do 01-esquema.sql e depois de criar
-- o usuario app_streaming (criado junto com a configuracao da db).

GRANT SELECT ON categorias, videos TO app_streaming;
GRANT SELECT, INSERT ON reproducoes TO app_streaming;
-- O INSERT em reproducoes usa a sequencia do SERIAL para gerar o id.
GRANT USAGE ON SEQUENCE reproducoes_id_seq TO app_streaming;
