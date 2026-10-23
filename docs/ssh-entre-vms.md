# SSH com chaves entre as VMs (etapa 3)

> **Em andamento.** O par de chaves da `lb` foi gerado; a cópia da chave pública para as outras VMs e os testes ainda não foram concluídos. As seções marcadas como **pendente** serão preenchidas quando o resultado chegar.

## Objetivo

Permitir que a `lb` entre por SSH na `app-a`, `app-b` e `db` sem digitar senha, para facilitar testes, deploy e a simulação de queda de nó.

## Como funciona

O SSH com chave usa um par. A chave **privada** fica só na máquina de origem (a `lb`), e a **pública** é copiada para `~/.ssh/authorized_keys` do destino. Quem prova que tem a privada entra sem senha. A chave privada nunca sai da `lb` e não vai para o repositório; a pública também não é versionada, seguindo a regra do [acesso remoto](acesso-remoto.md).

## Passos

### 1. Gerar o par de chaves na `lb` (feito)

```bash
ssh-keygen -t ed25519 -N '' -C sdadmin@lb -f ~/.ssh/id_ed25519
```

- `-t ed25519`: tipo de chave moderno, curto e seguro.
- `-N ''`: sem frase-senha. Aceitável aqui porque é um laboratório isolado; assim a `lb` consegue usar a chave em scripts, sem ninguém digitar.
- `-C sdadmin@lb`: comentário que identifica a chave, para saber de onde ela veio.
- `-f ~/.ssh/id_ed25519`: onde gravar (a privada) e `id_ed25519.pub` (a pública).

**Conferir:** `ls -l ~/.ssh/id_ed25519*` mostra os dois arquivos, e a privada deve ter permissão `-rw-------`.

### 2. Copiar a chave pública para cada VM (pendente)

```bash
ssh-copy-id sdadmin@192.168.56.11
ssh-copy-id sdadmin@192.168.56.12
ssh-copy-id sdadmin@192.168.56.13
```

`ssh-copy-id` conecta com a senha uma única vez e acrescenta a chave pública ao `~/.ssh/authorized_keys` do destino, criando a pasta e ajustando as permissões que o SSH exige (ele ignora a chave se a pasta estiver aberta para outros). Na primeira conexão com cada VM, o SSH pergunta se confia na impressão digital do servidor: responder `yes` grava a VM no `known_hosts`. A senha de cada VM é digitada por quem é dono dela.

### 3. Testar sem senha (pendente)

```bash
for h in 11 12 13; do ssh -o BatchMode=yes sdadmin@192.168.56.$h hostname; done
```

`-o BatchMode=yes` proíbe qualquer pergunta, inclusive de senha: se a chave não funcionar, o comando falha em vez de ficar esperando. Deve imprimir `app-a`, `app-b` e `db`.

## Resultado

| Destino | Esperado | Obtido |
| --- | --- | --- |
| `sdadmin@192.168.56.11` | `app-a`, sem senha | **pendente** |
| `sdadmin@192.168.56.12` | `app-b`, sem senha | **pendente** |
| `sdadmin@192.168.56.13` | `db`, sem senha | **pendente** |

## Relação com o acesso do Windows

O login do Windows para as três VMs de aplicação e banco por chave já foi testado (ver [testes-iniciais.md](testes-iniciais.md)). Esta etapa acrescenta o caminho da `lb` para elas.
