# Configuração e teste inicial da db

Teste feito em 2026-10-23: instalação e configuração do PostgreSQL na `db` (192.168.56.13), criação das tabelas ([05-banco-de-dados.md](../01-especificacoes/05-banco-de-dados.md)) e teste de conexão a partir de `app-a` e `app-b` com o usuário da aplicação.

## O que foi feito na db

| Passo | Resultado |
| --- | --- |
| Instalar o PostgreSQL com `apt` | Não estava instalado. Ficou a versão 16 (`psql` 16.15, Ubuntu 24.04) |
| `listen_addresses = '*'` no `postgresql.conf` | Feito, com cópia de segurança do arquivo antes |
| Linha no `pg_hba.conf`: `host streaming app_streaming 192.168.56.0/24 scram-sha-256` | Feito, com cópia de segurança antes |
| Reiniciar o serviço | Voltou ativo e escutando em `0.0.0.0:5432` e `[::]:5432` |
| Criar o usuário `app_streaming` e o banco `streaming` | Feito. A senha foi gerada na hora e mostrada uma vez, só no terminal de quem executou; não está em nenhum arquivo do repositório |
| `ufw` | Estava inativo, então não havia regra a liberar |
| Rodar `01-esquema.sql`, `02-dados-exemplo.sql` e `03-permissoes.sql` | Sem erro. Os avisos `table ... does not exist, skipping` são esperados na primeira vez, porque o `01` tenta apagar tabelas que ainda não existem |
| Instalar `postgresql-client` em `app-a` e `app-b` | `psql` 16.15 nas duas |

## Testes na db (como administrador `postgres`)

| Teste | Esperado | Resultado |
| --- | --- | --- |
| `\dt` | 3 tabelas | `categorias`, `reproducoes`, `videos` |
| `SELECT` dos vídeos com a categoria | 3 vídeos | Big Buck Bunny (634 s), Sintel (888 s), Tears of Steel (734 s) |
| `INSERT` com `categoria_id = 999` | Recusado | `violates foreign key constraint "videos_categoria_id_fkey"` |
| `INSERT` com `duracao_segundos = 0` | Recusado | `violates check constraint "videos_duracao_segundos_check"` |
| Total de vídeos depois dos dois erros | 3 | 3 |
| Permissões de `app_streaming` | Leitura em `categorias` e `videos`; leitura e inserção em `reproducoes`; uso da sequência de `reproducoes` | `categorias=r`, `videos=r`, `reproducoes=ar`, `reproducoes_id_seq=U` |

## Testes de conexão como `app_streaming`

Feitos de cada nó, pela rede, com `psql -h 192.168.56.13 -U app_streaming -d streaming`:

| Teste | app-a | app-b |
| --- | --- | --- |
| Usuário e IP vistos pelo banco | `app_streaming`, 192.168.56.11 | `app_streaming`, 192.168.56.12 |
| `SELECT COUNT(*) FROM videos` | 3 | 3 |
| `INSERT` em `reproducoes` | gravou `id 1`, `NO_A` | gravou `id 2`, `NO_B` |
| `DELETE FROM videos` | `permission denied for table videos` | `permission denied for table videos` |
| Total de vídeos depois do `DELETE` | 3 | 3 |

Isso mostra que a aplicação consegue ler o catálogo e gravar reproduções, mas não consegue apagar o catálogo. O `id` e a `data_hora` vieram do próprio banco.

Depois do teste, as duas linhas de reprodução foram apagadas e a tabela foi esvaziada com `TRUNCATE ... RESTART IDENTITY`, que também zera o contador de `id`. A contagem final de `reproducoes` foi 0.

## Problema encontrado: senha recusada

A primeira tentativa a partir da `app-a` deu `password authentication failed for user "app_streaming"`. O log da db mostrou que a conexão casou com a linha certa do `pg_hba.conf`, então rede, usuário e banco estavam certos e só a senha digitada não conferia (32 caracteres aleatórios, digitados sem eco na tela). A segunda tentativa, colando a senha, funcionou. Se a senha precisar ser trocada, o caminho é `\password app_streaming` no `psql` como `postgres`.

## Pendente

- ~~Colocar a senha do `app_streaming` em `/etc/streaming.env` nos dois nós~~: feito, ver [05-implantacao-da-app.md](05-implantacao-da-app.md).
- Os comandos com `sudo` foram digitados por Pedro, por SSH com `ssh -t`, informando a senha do `sdadmin`; **nenhum sudo sem senha foi criado** na `db`, na `app-a` nem na `app-b`.
- Confirmar no YouTube os IDs e as durações dos três vídeos.
- Decidir sobre a expansão do LVM da `db` (continua com 9,75 GB).
- Guardar uma cópia dos arquivos `postgresql.conf` e `pg_hba.conf` ajustados em [`infra/banco/`](../../infra/banco/).
