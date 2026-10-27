# Implantação da aplicação completa nos nós

Teste feito em 2026-10-27: a aplicação completa da [06-aplicacao.md](../01-especificacoes/06-aplicacao.md) (catálogo, detalhe com reprodução, barra do nó e `/distribuicao`), do commit `0502dbe`, foi implantada em `app-a` (NO_A) e `app-b` (NO_B) e verificada pela `lb`.

## Implantação

Rodada no PowerShell do Windows, uma máquina de cada vez, com a senha do `sudo` digitada por quem executou:

```
powershell -ExecutionPolicy Bypass -File scripts\implantar-app.ps1 -Nos <IP>
```

O script copia `server.js`, `package.json`, `package-lock.json`, `views` e o `implantar-app.sh` para `~/streaming-novo`, e o `.sh` roda com `sudo` no nó. Ele faz cópia de segurança, copia o código, roda `npm ci` (87 pacotes, agora com o `ejs`), reinicia o serviço e testa. Não mexe no `/etc/streaming.env`, então a senha do banco e o `NOME_DO_NO` continuam os mesmos.

| Nó | Cópia de segurança | Estado | `node_modules` | Teste local |
| --- | --- | --- | --- | --- |
| app-a (NO_A) | `/opt/streaming.bak-20261026-234531` | `active`, `enabled` | `drwxr-xr-x` (sem escrita do grupo) | `No NO_A: o banco tem 3 videos` |
| app-b (NO_B) | `/opt/streaming.bak-20261027-223926` | `active`, `enabled` | `drwxr-xr-x` (sem escrita do grupo) | `No NO_B: o banco tem 3 videos` |

O `server.js` dos dois nós é idêntico ao do `main`. A cópia mais antiga (`/opt/streaming.bak-20261023`, da aplicação base) continua nos dois nós. Os nomes dos backups usam o relógio de cada VM. O da `app-a` foi criado na tarde de 27/10, mas ganhou a data 26/10 porque o relógio dela está atrasado (ver "Problema encontrado").

## Verificação pela lb

Feita com `node testes/verificar-app.mjs http://192.168.56.10` (sem o modo `--queda`) e `curl`:

| Item | Resultado |
| --- | --- |
| Barra do topo com o nó | OK, alterna `NO_A` e `NO_B` nas 8 requisições |
| Round-robin | OK, 4 de cada, alternando |
| Cor por nó | OK, `NO_A` azul (`#1d4ed8`) e `NO_B` laranja (`#c2410c`) |
| `Cache-Control: no-store` | OK |
| Os dois nós geram o mesmo catálogo | OK |
| `/` (RF01) | OK, 3 vídeos: Big Buck Bunny 10:34, Sintel 14:48, Tears of Steel 12:14 |
| Guia 7.1.5: pelo menos 8 vídeos | **Falhou** na primeira rodada (o banco tinha 3 vídeos); resolvido, ver "Correções depois da verificação" |
| `/?categoria=1` (RF02) | OK, só Animação |
| `/videos/1` (RF03 e RF04) | OK, título, categoria, duração e `iframe` de `embed/aqz-KE-bpKQ` |
| Gravação da reprodução com o nó da barra (RF05) | OK |
| `/distribuicao` (RF06) | OK, a contagem bate com as aberturas (NO_A 5, NO_B 5 nos testes) |
| Sem estado nos nós | OK, os dois mostram a mesma contagem, vinda do banco |
| Página 404 com a barra | OK |
| Entradas maliciosas na URL | OK, não viram SQL |
| `/teste-banco` pela `lb` | OK |

Resultado da primeira rodada: 15 de 16 verificações. A falha não era da implantação: faltavam vídeos no banco.

## Linhas de teste em `reproducoes`

Ficaram 11 linhas: 6 de `NO_A` e 5 de `NO_B`. A primeira já existia antes destes testes, e as outras 10 vieram do `verificar-app.mjs`. Nenhuma foi apagada. Elas aparecem na página `/distribuicao`.

## Não feito

Teste de queda de um nó, teste de reinício dos nós, e qualquer alteração na `lb` e na `db`. A pasta `~/streaming-novo` ficou nos dois nós e é só a cópia de entrega.

## Correções depois da verificação (27/10/2026)

Os comandos foram rodados por quem tem a senha do `sudo`, no PowerShell do Windows.

### Relógio da `app-a` e da `db` atrasado

Comparando os relógios (UTC): o Windows e a `app-b` estavam em 27/10 22:42, e a `app-a` e a `db` em 26/10 23:52, quase 23 horas atrasadas. O `timedatectl` dizia que o NTP estava sincronizado, o que não batia com o atraso. A causa mais provável é a VM ter sido pausada, ou ter salvo e restaurado o estado, no VirtualBox: isso congela o relógio da VM. Por isso o `now()` do banco gravava `data_hora` errada e o backup da `app-a` ganhou o nome do dia errado. A contagem por nó não era afetada.

Correção: `sudo systemctl restart systemd-timesyncd`, que força uma sincronização nova. Não foi preciso acertar a hora com `date -s`.

| Máquina | Antes | Depois |
| --- | --- | --- |
| Windows | 27/10 22:48:14 | referência |
| app-a | 26/10 23:52 | 27/10 22:48:15, NTP sincronizado |
| app-b | certo | 27/10 22:48:16 |
| db | 26/10 23:52 | 27/10 22:48:17, NTP sincronizado |

A diferença de 1 a 3 segundos é só o tempo entre um SSH e outro. Se o atraso voltar depois de pausar ou restaurar uma VM, confira com `date -u` e repita o `restart` do `systemd-timesyncd`.

### Linhas de teste apagadas

As 11 linhas de teste de `reproducoes` (NO_A 6, NO_B 5) foram apagadas com `TRUNCATE reproducoes RESTART IDENTITY`, depois de corrigir o relógio da `db`. A `/distribuicao` passou a mostrar "Nenhuma reprodução registrada ainda".

### Catálogo com 9 vídeos

O [`banco/04-mais-videos.sql`](../../banco/04-mais-videos.sql) acrescentou seis filmes abertos, o que atende o item 7.1.5 do guia: ver [05-banco-de-dados.md](../01-especificacoes/05-banco-de-dados.md#catálogo-ampliado-para-9-vídeos). Verificação só com leitura pela `lb`:

| Teste | Resultado |
| --- | --- |
| `/` | Lista os 9 vídeos |
| `/?categoria=2` | Só os 3 de Ficção científica: Tears of Steel, Elephants Dream e Cosmos Laundromat |
| `/teste-banco` | `No NO_A: o banco tem 9 videos` e `No NO_B: o banco tem 9 videos`, alternando |
| `/distribuicao` | "Nenhuma reprodução registrada ainda" |

A página `/videos/<id>` dos vídeos novos não foi aberta, para não gravar reprodução e deixar a contagem zerada para a apresentação.

## Pendente

- Abrir no navegador `/videos/<id>` de um vídeo novo e conferir o player (grava uma reprodução; apagar depois com `TRUNCATE reproducoes RESTART IDENTITY` se a contagem tiver de ficar zerada).
- Teste de queda real e teste de reinício dos nós com a aplicação completa.
- Apagar `~/streaming-novo` e os backups antigos em `/opt/streaming.bak-*` quando o grupo não precisar mais.
