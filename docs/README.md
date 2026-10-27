# Documentação

Índice da documentação do projeto. Os documentos ficam em pastas numeradas por tipo e, dentro de cada pasta, os arquivos também são numerados na ordem em que foram feitos, para facilitar a consulta.

## Índice

### 01-especificacoes: como as coisas são e por quê

| Arquivo | Conteúdo |
| --- | --- |
| [01-vms.md](01-especificacoes/01-vms.md) | Tabela das quatro VMs, recursos, comandos `VBoxManage`, escolhas do instalador, problemas encontrados e pendências |
| [02-rede.md](01-especificacoes/02-rede.md) | Adaptadores NAT e host-only, DHCP da host-only, netplan explicado, cloud-init |
| [03-ssh-entre-vms.md](01-especificacoes/03-ssh-entre-vms.md) | Etapa 3: SSH com chaves da `lb` para as outras VMs |
| [04-nginx-e-upstream.md](01-especificacoes/04-nginx-e-upstream.md) | Etapa 4: Nginx na `lb` com upstream para `app-a` e `app-b` |
| [05-banco-de-dados.md](01-especificacoes/05-banco-de-dados.md) | Banco `streaming`: as três tabelas, SQL de criação, dados de exemplo, campo `arquivo` com vídeo do YouTube e permissões |
| [06-aplicacao.md](01-especificacoes/06-aplicacao.md) | Aplicação completa: rotas, barra do nó, distribuição, YouTube ou `.mp4`, banco fora do ar, implantação nos nós e notas para os testes de carga |

### 02-comandos: o que foi digitado, com explicação

| Arquivo | Conteúdo |
| --- | --- |
| [01-criacao-e-rede-das-vms.md](02-comandos/01-criacao-e-rede-das-vms.md) | Comandos de criação das VMs e de configuração de rede, um a um, com o que cada opção faz |

### 03-testes: o que foi testado e o resultado

| Arquivo | Conteúdo |
| --- | --- |
| [01-testes-iniciais.md](03-testes/01-testes-iniciais.md) | Testes das quatro VMs: rede, conectividade, SSH por chave, falhas encontradas e pendências |
| [02-balanceamento.md](03-testes/02-balanceamento.md) | Teste de balanceamento round-robin pela `lb` |
| [03-teste-de-queda.md](03-testes/03-teste-de-queda.md) | Teste de queda de um nó, **simulado** na `lb` com `iptables` (a queda real segue pendente) |
| [04-teste-da-db.md](03-testes/04-teste-da-db.md) | Instalação e configuração do PostgreSQL na `db`, criação das tabelas e teste de conexão como `app_streaming` a partir de `app-a` e `app-b` |
| [05-implantacao-da-app.md](03-testes/05-implantacao-da-app.md) | Implantação da aplicação base (Express e `/teste-banco`) em `app-a` e `app-b`, e teste de balanceamento com o banco |
| [06-teste-local-da-app.md](03-testes/06-teste-local-da-app.md) | Teste da aplicação completa num PC, sem as VMs: páginas, gravação das reproduções, carga e o defeito dos nós caindo junto com o banco |
| [07-verificacao-da-entrega.md](03-testes/07-verificacao-da-entrega.md) | Verificação item a item contra os requisitos e o guia, queda de nó, entradas maliciosas, carga indicativa e o script de implantação testado num nó simulado |
| [08-implantacao-da-app-completa.md](03-testes/08-implantacao-da-app-completa.md) | Implantação da aplicação completa em `app-a` e `app-b` e verificação pela `lb` (15 de 16; falta chegar a 8 vídeos) |

### Fora das pastas numeradas

- `acesso-remoto.md`: acesso do grupo às VMs pela VPN (entra com o PR #2; depois do merge, pode ser movido para uma pasta `04-acesso-remoto/`).

Os arquivos de configuração das máquinas ficam em [`infra/`](../infra/), os scripts SQL em [`banco/`](../banco/) e os scripts em [`scripts/`](../scripts/).

## Padrão para novos documentos

1. **Pasta pelo tipo:** `01-especificacoes` (decisões e configuração), `02-comandos` (comandos executados) ou `03-testes` (testes e resultados). Se surgir um tipo novo, crie a próxima pasta numerada (`04-...`).
2. **Arquivo `NN-nome-em-minusculas.md`:** `NN` é o próximo número livre da pasta, com dois dígitos, e o nome usa letras minúsculas, sem acentos, com hífens (`04-nginx-e-upstream.md`). Uma etapa ou rodada nova vira um arquivo novo, sem sobrescrever o anterior.
3. **Um assunto por arquivo.** Se um arquivo passar de umas 300 linhas ou misturar assuntos, divida.
4. **Atualize este índice** e, se for o caso, o link no README da raiz.
5. **Links relativos** entre documentos, conferidos depois de mover ou renomear arquivos. Use `git mv` para preservar o histórico.
6. **Marque o que falta** como "pendente" ou "a confirmar", e documente só o que foi realmente executado.
7. **Nunca** inclua senhas, chaves (privadas ou públicas), e-mails ou caminhos da máquina de quem executou. Use marcadores como `<PASTA_DAS_VMS>`.
