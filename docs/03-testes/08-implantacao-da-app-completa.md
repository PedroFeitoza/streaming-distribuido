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
| Guia 7.1.5: pelo menos 8 vídeos | **Falhou**: o banco tem 3 |
| `/?categoria=1` (RF02) | OK, só Animação |
| `/videos/1` (RF03 e RF04) | OK, título, categoria, duração e `iframe` de `embed/aqz-KE-bpKQ` |
| Gravação da reprodução com o nó da barra (RF05) | OK |
| `/distribuicao` (RF06) | OK, a contagem bate com as aberturas (NO_A 5, NO_B 5 nos testes) |
| Sem estado nos nós | OK, os dois mostram a mesma contagem, vinda do banco |
| Página 404 com a barra | OK |
| Entradas maliciosas na URL | OK, não viram SQL |
| `/teste-banco` pela `lb` | OK |

Resultado: 15 de 16 verificações. A falha não é da implantação: faltam vídeos no banco.

## Linhas de teste em `reproducoes`

Ficaram 11 linhas: 6 de `NO_A` e 5 de `NO_B`. A primeira já existia antes destes testes, e as outras 10 vieram do `verificar-app.mjs`. Nenhuma foi apagada. Elas aparecem na página `/distribuicao`.

## Não feito

Teste de queda de um nó, teste de reinício dos nós, e qualquer alteração na `lb` e na `db`. A pasta `~/streaming-novo` ficou nos dois nós e é só a cópia de entrega.

## Problema encontrado: relógio da `app-a` e da `db` atrasado

Comparando os relógios no fim da tarde de 27/10 (UTC): o Windows e a `app-b` estavam em 22:42, e a `app-a` e a `db` em 26/10 23:52, quase 23 horas atrasadas. O `timedatectl` das duas VMs diz que o NTP está ligado e sincronizado, o que não bate com o atraso. A causa mais provável é a VM ter sido pausada, ou ter salvo e restaurado o estado no VirtualBox, sem o relógio ser corrigido depois. Nada foi alterado.

Consequência: o `now()` do banco preenche `reproducoes.data_hora` com a data errada, e os backups da `app-a` ganham o nome do dia errado. A contagem por nó não é afetada. Se o relógio da `db` for corrigido, as linhas já gravadas continuam com a data antiga, mais um motivo para apagar as linhas de teste antes da apresentação.

## Pendente

- Acrescentar vídeos até chegar a 8 ou mais (guia 7.1.5), com IDs do YouTube conferidos.
- Decidir se as linhas de teste de `reproducoes` são apagadas antes da apresentação (`TRUNCATE reproducoes RESTART IDENTITY`).
- Corrigir o relógio da `app-a` e da `db` (ver "Problema encontrado"); exige `sudo`.
- Teste de queda real e teste de reinício dos nós com a aplicação completa.
- Apagar `~/streaming-novo` e os backups antigos em `/opt/streaming.bak-*` quando o grupo não precisar mais.
