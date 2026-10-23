# Banco de dados: tabelas, SQL e dados de exemplo

Esquema do banco `streaming` na `db` (192.168.56.13:5432). Os scripts ficam em [`banco/`](../../banco/) e são rodados nesta ordem:

| Script | O que faz |
| --- | --- |
| [`01-esquema.sql`](../../banco/01-esquema.sql) | Apaga e recria as três tabelas |
| [`02-dados-exemplo.sql`](../../banco/02-dados-exemplo.sql) | Carrega duas categorias e três vídeos |
| [`03-permissoes.sql`](../../banco/03-permissoes.sql) | Dá ao usuário `app_streaming` só o que a aplicação usa |

> Pendente: a `db` ainda não tem o PostgreSQL configurado para a rede nem o banco `streaming` e o usuário `app_streaming`. Os scripts foram escritos, mas ainda não foram executados.

## Por que o banco é o centro do sistema

Os dois nós rodam o mesmo código e não guardam nada na memória entre requisições, porque a próxima requisição do mesmo usuário pode cair no outro nó. Tudo que precisa ser lembrado (o catálogo e cada reprodução) fica aqui, e os dois nós leem e escrevem no mesmo lugar.

## As tabelas

```
categorias  (id, nome)
videos      (id, titulo, descricao, duracao_segundos, arquivo, categoria_id → categorias.id)
reproducoes (id, video_id → videos.id, data_hora, no_responsavel)
```

Uma categoria tem vários vídeos, e um vídeo tem várias reproduções.

### categorias

| Coluna | Tipo | Regra | Para quê |
| --- | --- | --- | --- |
| `id` | `SERIAL` | chave primária | Número gerado pelo banco |
| `nome` | `VARCHAR(100)` | obrigatório, sem repetir | Nome exibido no catálogo |

### videos

| Coluna | Tipo | Regra | Para quê |
| --- | --- | --- | --- |
| `id` | `SERIAL` | chave primária | Usado na URL do detalhe (`/videos/1`) |
| `titulo` | `VARCHAR(200)` | obrigatório | Título no catálogo e no detalhe |
| `descricao` | `TEXT` | opcional | Texto do detalhe |
| `duracao_segundos` | `INTEGER` | obrigatório, maior que zero | Duração; a página converte para `mm:ss` |
| `arquivo` | `VARCHAR(255)` | obrigatório | ID do vídeo no YouTube (ver abaixo) |
| `categoria_id` | `INTEGER` | obrigatório, aponta para `categorias.id` | Categoria do vídeo |

### reproducoes

| Coluna | Tipo | Regra | Para quê |
| --- | --- | --- | --- |
| `id` | `SERIAL` | chave primária | Número gerado pelo banco |
| `video_id` | `INTEGER` | obrigatório, aponta para `videos.id` | Qual vídeo foi aberto |
| `data_hora` | `TIMESTAMP` | obrigatório, padrão `now()` | Quando; o banco preenche sozinho |
| `no_responsavel` | `VARCHAR(20)` | obrigatório | Valor de `NOME_DO_NO` do nó que atendeu (`NO_A` ou `NO_B`) |

## O que cada parte do SQL faz

- **`SERIAL PRIMARY KEY`**: o banco gera o `id` (1, 2, 3...) a cada `INSERT`, usando uma *sequência*. A aplicação nunca escolhe o `id`. Isso importa com dois nós: se cada nó contasse os ids na própria memória, os dois gerariam o mesmo número.
- **`REFERENCES categorias (id)`**: chave estrangeira. O banco recusa um vídeo com `categoria_id` que não existe, e recusa apagar uma categoria que ainda tem vídeos.
- **`NOT NULL`, `UNIQUE`, `CHECK`**: regras que o banco garante sozinho, qualquer que seja o nó que fez o `INSERT`.
- **`DEFAULT now()`**: se o `INSERT` não informar `data_hora`, o banco usa a hora dele. Assim as reproduções dos dois nós ficam com o mesmo relógio, mesmo que os relógios das VMs estejam diferentes.
- **`DROP TABLE IF EXISTS`** no começo do `01-esquema.sql`: deixa o script rodar de novo do zero. Cuidado: apaga os dados.
- **`(SELECT id FROM categorias WHERE nome = ...)`** no `02-dados-exemplo.sql`: busca o `id` da categoria pelo nome, em vez de supor que "Animação" ficou com `id = 1`.

## O campo `arquivo` com vídeo do YouTube

A coluna `arquivo` guarda **só o ID do vídeo no YouTube**, o trecho depois de `watch?v=`:

```
https://www.youtube.com/watch?v=aqz-KE-bpKQ   →   arquivo = 'aqz-KE-bpKQ'
```

**Aviso importante para a etapa 4:** a tag `<video>` do HTML não toca vídeo do YouTube. Ela só reproduz um arquivo de vídeo de verdade (`.mp4`, `.webm`), e o YouTube não entrega o arquivo, entrega uma página com o próprio player. Para mostrar um vídeo do YouTube dentro da página, usa-se um `<iframe>` apontando para o endereço de *embed*:

```html
<iframe width="640" height="360"
        src="https://www.youtube.com/embed/aqz-KE-bpKQ"
        allowfullscreen></iframe>
```

Por isso guardamos só o ID: a página monta `https://www.youtube.com/embed/` + `arquivo`, sem precisar recortar URL no código. Se o grupo quiser mesmo a tag `<video>`, a alternativa é baixar os `.mp4` para `/opt/streaming/public/videos` nos dois nós e guardar em `arquivo` o nome do arquivo (`big-buck-bunny.mp4`).

Isso não muda nada no balanceamento: a página de detalhe continua sendo gerada por um dos nós (que grava a reprodução e mostra a barra colorida); só o vídeo em si vem do YouTube.

## Dados de exemplo

| Título | Categoria | Duração | `arquivo` |
| --- | --- | --- | --- |
| Big Buck Bunny | Animação | 634 s (10:34) | `aqz-KE-bpKQ` |
| Sintel | Animação | 888 s (14:48) | `eRsGyueVLvQ` |
| Tears of Steel | Ficção científica | 734 s (12:14) | `R6MlUcmOul8` |

São filmes abertos da Blender Foundation. A confirmar: abrir `https://www.youtube.com/watch?v=<ID>` de cada um no navegador e conferir se o vídeo existe e se a duração bate. A tabela `reproducoes` começa vazia, porque quem grava nela é a aplicação.

## Permissões do usuário da aplicação

A aplicação conecta como `app_streaming`, não como `postgres`. O `03-permissoes.sql` dá a ele só o necessário:

- `SELECT` em `categorias` e `videos`: o catálogo e o detalhe só leem.
- `SELECT` e `INSERT` em `reproducoes`: grava cada abertura e lê para a página de demonstração.
- `USAGE` na sequência `reproducoes_id_seq`: sem isso o `INSERT` falha ao gerar o `id`.

Ele não pode apagar nem alterar nada, então um erro no código não destrói o catálogo.

## Como rodar

Na `db`, depois de criar o banco `streaming` e o usuário `app_streaming`:

```bash
sudo -u postgres psql -d streaming -f 01-esquema.sql
sudo -u postgres psql -d streaming -f 02-dados-exemplo.sql
sudo -u postgres psql -d streaming -f 03-permissoes.sql
```

## Como testar

```bash
sudo -u postgres psql -d streaming
```

```sql
\dt                                   -- deve listar as três tabelas
SELECT v.id, v.titulo, c.nome AS categoria, v.arquivo
FROM videos v JOIN categorias c ON c.id = v.categoria_id
ORDER BY v.id;                        -- deve mostrar os três vídeos
```

Teste das regras (os dois devem dar erro):

```sql
INSERT INTO videos (titulo, duracao_segundos, arquivo, categoria_id)
VALUES ('Teste', 10, 'x', 999);       -- erro de chave estrangeira
INSERT INTO videos (titulo, duracao_segundos, arquivo, categoria_id)
VALUES ('Teste', 0, 'x', 1);          -- erro do CHECK
```

Teste das permissões, conectando como a aplicação vai conectar (a partir de `app-a` ou `app-b`, quando a `db` aceitar conexões da rede):

```bash
psql -h 192.168.56.13 -U app_streaming -d streaming
```

```sql
INSERT INTO reproducoes (video_id, no_responsavel) VALUES (1, 'NO_A');  -- deve funcionar
DELETE FROM videos;                                                      -- deve dar "permission denied"
```

## Consulta da página de demonstração (etapa 7)

A contagem de reproduções por nó sai direto do banco:

```sql
SELECT no_responsavel, COUNT(*) AS total
FROM reproducoes
GROUP BY no_responsavel
ORDER BY no_responsavel;
```

Como as duas instâncias gravam na mesma tabela, essa consulta mostra a divisão real feita pelo balanceador, seja qual for o nó que gerou a página.
