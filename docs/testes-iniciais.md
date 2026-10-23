# Testes iniciais das VMs

Registro dos testes que **foram executados** nas quatro VMs (`lb`, `app-a`, `app-b` e `db`) e dos resultados obtidos. O que ainda não foi testado está marcado como **a confirmar**. A criação das VMs está em [vms.md](vms.md), a rede em [rede.md](rede.md), os comandos em [comandos-vms.md](comandos-vms.md) e o SSH entre as VMs em [ssh-entre-vms.md](ssh-entre-vms.md).

> Situação em 23/10/2026, com as quatro VMs de pé e com IP fixo. Tentativas feitas antes de a `lb` ter IP não contam como resultado e aparecem só em [Problemas encontrados](#problemas-encontrados).

## Resumo

| VM | IP | Rede e rota | Do Windows | SSH por chave | IP após reiniciar |
| --- | --- | --- | --- | --- | --- |
| lb | 192.168.56.10 | ok | ping e SSH ok | Windows ok | mantido |
| app-a | 192.168.56.11 | ok | ping, porta 22 e SSH ok | Windows ok; lb ok | a confirmar |
| app-b | 192.168.56.12 | ok | ping, porta 22 e SSH ok | Windows ok; lb ok | a confirmar |
| db | 192.168.56.13 | ok | ping, porta 22 e SSH ok | Windows ok; lb ok | a confirmar |

## Como ler as tabelas

- **Comando:** onde roda: `(VM)` no console ou SSH da própria VM, `(Windows)` no PowerShell do host.
- **Esperado:** o resultado que indica que a configuração está certa.
- **Obtido:** o que de fato apareceu.

## Testes em cada VM

| Teste | Comando | Esperado | lb | app-a | app-b | db |
| --- | --- | --- | --- | --- | --- | --- |
| Hostname | `hostname` (VM) | nome da VM | `lb` | `app-a` | `app-b` | `db` |
| IPs da `enp0s8` | `ip -br a` (VM) | `enp0s3` com 10.0.2.15; `enp0s8` só com o IP fixo | `192.168.56.10/24` | `192.168.56.11/24` | `192.168.56.12/24` | `192.168.56.13/24` |
| Rota padrão única | `ip route` (VM) | uma `default via 10.0.2.2 dev enp0s3` | a confirmar | ok | a confirmar | ok |
| Internet pelo NAT | `ping -c 3 ubuntu.com` (VM) | respostas | 0% de perda | 3 de 3 | 2 de 2 | 3 de 3 |
| Ping do Windows | `ping <IP>` (Windows) | responde | ok | ok | ok | 3 de 3 |
| Porta 22 do Windows | conexão TCP na porta 22 (Windows) | aberta | ok (SSH entra) | aberta | aberta | aberta |
| Login SSH por chave do Windows | `ssh sdadmin@<IP> hostname` (Windows) | nome da VM, sem senha | ok | `app-a` | `app-b` | `db` |
| IP após `sudo reboot` | `ip -br a` (VM) | IP fixo mantido | mantido | a confirmar | a confirmar | a confirmar |

## Conectividade entre as VMs

| Origem \ Destino | lb (.10) | app-a (.11) | app-b (.12) | db (.13) |
| --- | --- | --- | --- | --- |
| **lb** | — | ping e porta 22 ok | ping e porta 22 ok | ping e porta 22 ok |
| **app-a** | a confirmar | — | ping ok (cerca de 1 ms) | ping ok (cerca de 1 ms) |
| **app-b** | a confirmar | ping ok (cerca de 1 ms) | — | ping ok (cerca de 1 ms) |
| **db** | a confirmar | ping ok (cerca de 1 ms) | ping ok (cerca de 1 ms) | — |

Comandos: `ping -c 3 <IP>` e teste TCP na porta 22. Entre app-a, app-b e db foi testado o ping; a porta 22 entre elas não foi testada à parte.

## SSH por chave a partir da lb

Teste na `lb`: `for h in 11 12 13; do ssh -o BatchMode=yes sdadmin@192.168.56.$h hostname; done`. O `BatchMode=yes` faz o comando falhar se pedir senha.

| Destino | Esperado | Obtido |
| --- | --- | --- |
| `192.168.56.11` | `app-a`, sem senha | `app-a` |
| `192.168.56.12` | `app-b`, sem senha | `app-b` |
| `192.168.56.13` | `db`, sem senha | `db` |

O sentido inverso (nós para a `lb`) e o SSH entre os nós estão **a confirmar**. Detalhes em [ssh-entre-vms.md](ssh-entre-vms.md).

## Conferências feitas no host

| Teste | Comando | Esperado | Obtido |
| --- | --- | --- | --- |
| Configuração de cada VM | `VBoxManage showvminfo <vm>` | memória, CPUs, NIC 1 `nat`, NIC 2 `hostonly`, disco e ISO | conforme esperado nas 4 VMs |
| ISO íntegra | SHA256 do arquivo | igual ao publicado pela Canonical | igual |
| DHCP da host-only | `VBoxManage list dhcpservers` | desligado, segundo a listagem do adaptador | `Enabled: Yes`, faixa `.101` a `.254` (ver [rede.md](rede.md#dhcp-ativo-na-rede-host-only)) |

## Acesso remoto do grupo

| Teste | Comando | Esperado | Obtido |
| --- | --- | --- | --- |
| Tailscale instalado e logado | `tailscale status` (Windows) | PC online | online |
| Rota anunciada | `tailscale debug prefs` (Windows) | `192.168.56.0/24` em `AdvertiseRoutes` | anunciada |
| Rota aprovada e chave sem expiração | painel do Tailscale | rota ativa, expiração desligada | feito |
| Repasse de pacotes (*Forwarding*) | interface do Tailscale no Windows | habilitado | aparecia como desabilitado |
| Colega acessa uma VM pela VPN | `ping 192.168.56.10` (colega) | responde | a confirmar: nenhum colega entrou ainda |

Detalhes e comandos em [acesso-remoto.md](acesso-remoto.md), no PR #2.

## Problemas encontrados

O que deu errado pelo caminho, com a causa e a solução. Não são resultados de teste.

| Problema | Causa | Solução |
| --- | --- | --- |
| `ping 192.168.56.10` falhava nas VMs e no Windows (*Destination Host Unreachable*) | A `lb` ainda estava instalando e não tinha o IP fixo; ninguém respondia ao ARP para o `.10`. | Resolvido quando a `lb` recebeu o IP fixo. |
| Instalação da `lb` parada em "Updating system" | Só 1 GB de RAM; a fase de atualizações de segurança é lenta. Os avisos `perl: warning: Setting locale failed` são inofensivos. | Instalação interrompida; `sudo apt update && sudo apt upgrade` ficou **a fazer**. |
| `enp0s8` veio com IP do DHCP (`.102`, `.104`, `.103`, `.105`) | A rede host-only tem DHCP ativo, e o instalador grava `dhcp4: true` nas duas interfaces. | `dhcp4: false` na `enp0s8` e editar o `50-cloud-init.yaml`, em vez de acrescentar outro arquivo. |
| `app-b` apareceu com dois IPs (`.12` e `.104`) | O `.104` veio do DHCP e pode ter permanecido ativo. | **A reconferir** com `ip -br a`; deve restar só o `.12`. |
| `sudo` recusou a senha na app-b (*3 incorrect password attempts*) | Erro de digitação; o comando seguinte, enviado pelo console, caiu no campo de senha e gastou as tentativas. | `sudo -v` de novo, olhando a tela antes de enviar outro comando. |
| `sudo` travado na db | O `sudo` pediu a senha no meio de um comando e ele foi cancelado com Ctrl+C. | `sudo -v` digitado pelo próprio usuário antes de enviar os comandos. |
| Hostname da app-a aparecia como `app-b` | A VM foi instalada com o nome errado. | `hostnamectl set-hostname` e `sed` no `/etc/hosts`; `exec bash` atualizou o prompt. |
| `sed` com erros *No such file or directory* e *extra characters* | Crases (`` ` ``) em vez de aspas simples (`'`). | `sudo sed -i 's/app-b/app-a/g' /etc/hosts`. |
| Mensagem `lear: not found` | A primeira letra de um comando (`clear`) se perdeu ao ser enviada ao console. | Começar os comandos seguintes com um Enter vazio. |
| Primeiro pacote do ping do Windows se perde | O Windows ainda descobre o endereço da VM (ARP). | Normal; os pacotes seguintes respondem. |
| `/` da db com 9,75 GB em vez de 15 GB | LVM marcado no instalador. | Mantido; pode ser expandido com `lvextend` e `resize2fs`. |
| Aviso de mídia (cdrom) no reboot | O Ubuntu pede para remover a ISO. | Inofensivo; Enter. |
| *Forwarding* desabilitado no Tailscale do Windows | Repasse de pacotes ainda não ligado. | A verificar quando um colega testar; plano B é anunciar a rota a partir da `lb`. |

## Acesso de laboratório (remover no fim)

Na `lb` foram criados uma chave SSH de laboratório (`claude-lab`) em `authorized_keys` e o arquivo `/etc/sudoers.d/90-lab` com `sudo` sem senha. São aceitáveis só em laboratório isolado e **devem ser removidos no fim do trabalho** (ver [vms.md](vms.md#acesso-de-laboratório)).

## A confirmar

- [ ] Ping (e porta 22) de app-a, app-b e db para a `lb`.
- [ ] Reiniciar app-a, app-b e db e conferir que o IP fixo continua (`ip -br a`); só a `lb` foi testada.
- [ ] `ip route` na `lb` e na app-b: uma única rota padrão pelo NAT.
- [ ] `app-b`: reconferir que a `enp0s8` tem só o `.12`.
- [ ] `lb`: `sudo apt update && sudo apt upgrade`, depois Nginx e upstream.
- [ ] SSH por chave dos nós para a `lb` e entre os nós, se o grupo quiser.
- [ ] Colega entrar na VPN e acessar uma VM.
- [ ] Decidir sobre a expansão do LVM da db.
- [ ] Remover o acesso de laboratório da `lb` no fim.
