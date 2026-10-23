# Testes iniciais das VMs

Registro dos testes que **foram executados** nas VMs até agora e dos resultados obtidos. O que ainda não foi testado está marcado como **pendente**. A criação das VMs está em [vms.md](vms.md), a rede em [rede.md](rede.md) e os comandos em [comandos-vms.md](comandos-vms.md).

> Situação em 23/10/2026. Os testes das VMs de aplicação e do banco foram feitos antes de a `lb` ter IP; os da `lb` vieram depois e estão na seção própria.

## Resumo

| VM | Rede (IP fixo, NAT, rota) | Do Windows (ping e porta 22) | Entre as VMs | SSH por chave |
| --- | --- | --- | --- | --- |
| lb (.10) | ok | ok (ping e SSH) | ok: alcança .11, .12 e .13 (ping e porta 22); o sentido inverso é **pendente** | ok (Windows) |
| app-a (.11) | ok | ok | ok (app-b e db) | ok |
| app-b (.12) | ok | ok | ok (app-a e db) | ok |
| db (.13) | ok | ok | ok (app-a e app-b) | ok |

## Como ler as tabelas

- **Comando:** onde roda: `(VM)` no console ou SSH da própria VM, `(Windows)` no PowerShell do host.
- **Esperado:** o resultado que indica que a configuração está certa.
- **Obtido:** o que de fato apareceu.

## app-a (192.168.56.11)

| Teste | Comando | Esperado | Obtido |
| --- | --- | --- | --- |
| Hostname | `hostname` (VM) | `app-a` | `app-a` (após corrigir o nome, ver [Falhas](#falhas-e-causas)) |
| /etc/hosts | `cat /etc/hosts` (VM) | `127.0.1.1 app-a` | `127.0.1.1 app-a` |
| Interfaces e IPs | `ip -br a` (VM) | `enp0s3` com 10.0.2.15; `enp0s8` só com `192.168.56.11/24` | conforme esperado |
| Rota padrão única | `ip route` (VM) | uma única `default via 10.0.2.2 dev enp0s3` | conforme esperado |
| Internet pelo NAT | `ping -c 3 ubuntu.com` (VM) | 3 respostas | 3 de 3 |
| Ping do Windows | `ping 192.168.56.11` (Windows) | responde | responde |
| Porta 22 | conexão TCP na porta 22 (Windows) | aberta | aberta |
| Ping para a lb | `ping -c 3 192.168.56.10` (VM) | responde | **falhou** na primeira rodada (*Destination Host Unreachable*, a `lb` ainda sem IP); **repetir** agora que ela tem IP |
| Ping cruzado | `ping` para `.12` e `.13` (VM) | responde | responde, cerca de 1 ms |
| Login SSH por chave | `ssh sdadmin@192.168.56.11 hostname` (Windows) | `app-a`, sem pedir senha | `app-a`, sem senha |
| IP após reiniciar | `sudo reboot` e `ip -br a` (VM) | continua `192.168.56.11/24` | **pendente** |

## app-b (192.168.56.12)

| Teste | Comando | Esperado | Obtido |
| --- | --- | --- | --- |
| Hostname | `hostname` (VM) | `app-b` | `app-b` |
| Interfaces e IPs | `ip -br a` (VM) | `enp0s3` com 10.0.2.15; `enp0s8` só com `192.168.56.12/24` | conforme esperado |
| Rota padrão única | `ip route` (VM) | uma única `default` pela `enp0s3` | não registrado individualmente; mesma configuração da app-a e da db, sem gateway na `enp0s8` |
| Internet pelo NAT | `ping -c 3 ubuntu.com` (VM) | respostas | 2 de 2 |
| Ping do Windows | `ping 192.168.56.12` (Windows) | responde | responde (o primeiro pacote se perde, ver [Falhas](#falhas-e-causas)) |
| Porta 22 | conexão TCP na porta 22 (Windows) | aberta | aberta |
| Ping para a lb | `ping -c 3 192.168.56.10` (VM) | responde | **falhou** na primeira rodada (*Destination Host Unreachable*, a `lb` ainda sem IP); **repetir** agora que ela tem IP |
| Ping cruzado | `ping` para `.11` e `.13` (VM) | responde | responde, cerca de 1 ms |
| Login SSH por chave | `ssh sdadmin@192.168.56.12 hostname` (Windows) | `app-b`, sem pedir senha | `app-b`, sem senha |
| IP após reiniciar | `sudo reboot` e `ip -br a` (VM) | continua `192.168.56.12/24` | **pendente** |

## db (192.168.56.13)

| Teste | Comando | Esperado | Obtido |
| --- | --- | --- | --- |
| Hostname | `hostname` (VM) | `db` | `db` |
| Interfaces e IPs | `ip -br a` (VM) | `enp0s3` com 10.0.2.15; `enp0s8` só com `192.168.56.13/24` | conforme esperado (o `.103` do DHCP saiu) |
| Rota padrão única | `ip route` (VM) | uma única `default` pela `enp0s3` | conforme esperado |
| Internet pelo NAT | `ping -c 3 ubuntu.com` (VM) | 3 respostas | 3 de 3 |
| Ping do Windows | `ping 192.168.56.13` (Windows) | responde | 3 de 3 |
| Porta 22 | conexão TCP na porta 22 (Windows) | aberta | aberta |
| Ping para a lb | `ping -c 3 192.168.56.10` (VM) | responde | **falhou** na primeira rodada (*Destination Host Unreachable*, a `lb` ainda sem IP); **repetir** agora que ela tem IP |
| Ping cruzado | `ping` para `.11` e `.12` (VM) | responde | responde, cerca de 1 ms |
| Login SSH por chave | `ssh sdadmin@192.168.56.13 hostname` (Windows) | `db`, sem pedir senha | `db`, sem senha |
| IP após reiniciar | `sudo reboot` e `ip -br a` (VM) | continua `192.168.56.13/24` | **pendente** |
| Tamanho de `/` | `df -h /` (VM) | cerca de 15 GB | 9,75 GB, porque o LVM ficou marcado (ver [Falhas](#falhas-e-causas)) |

## lb (192.168.56.10)

| Teste | Comando | Esperado | Obtido |
| --- | --- | --- | --- |
| VM criada | `VBoxManage showvminfo lb` (Windows) | 1024 MB, 1 CPU, NAT + host-only, disco e ISO | conforme esperado |
| Instalação | tela do console | instalador concluído | interrompido na fase "Updating system" (1 GB de RAM, lenta); atualizações **pendentes** |
| Interfaces e IPs | `ip -br a` (VM) | `enp0s8` com `192.168.56.10/24` | `192.168.56.10/24` |
| Internet pelo NAT | `ping ubuntu.com` (VM) | respostas | 0% de perda |
| Ping e SSH do Windows | `ssh sdadmin@192.168.56.10` (Windows) | abre sessão | ok |
| lb para as outras VMs | ping e porta 22 para `.11`, `.12`, `.13` (VM) | responde e abre | todos ok |
| IP após reiniciar | reiniciar e `ip -br a` (VM) | continua `192.168.56.10/24` | mantido |

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
| Repasse de pacotes (*Forwarding*) | interface do Tailscale no Windows | habilitado | aparecia **Disabled** |
| Colega pinga uma VM pela VPN | `ping 192.168.56.10` (colega) | responde | **pendente**: nenhum colega entrou ainda |

Detalhes e comandos em [acesso-remoto.md](acesso-remoto.md), no PR #2.

## Falhas e causas

| O que falhou | Causa | Solução |
| --- | --- | --- |
| `ping 192.168.56.10` falhou nas VMs e no Windows (*Destination Host Unreachable*) | A `lb` ainda estava instalando e não tinha o IP fixo. A mensagem indica que ninguém respondeu ao ARP para o `.10`. | A `lb` recebeu o IP fixo e passou a responder. **Pendente**: repetir o ping a partir de app-a, app-b e db. |
| Instalação da `lb` parada em "Updating system" | Só 1 GB de RAM; a fase de atualizações de segurança é lenta. Os avisos `perl: warning: Setting locale failed` são inofensivos. | Instalação interrompida e VM reiniciada; `sudo apt update && sudo apt upgrade` fica **pendente**. |
| `app-b` com dois IPs na `enp0s8` (`.12` e `.104`) | O `.104` veio do DHCP da host-only e pode ter permanecido ativo. | **Pendente**: reconferir com `ip -br a`; deve restar só o `.12`. |
| `enp0s8` veio com IP do DHCP (`.102`, `.104`, `.103`) | A rede host-only tem DHCP ativo, e o instalador grava `dhcp4: true` nas duas interfaces. | `dhcp4: false` na `enp0s8` e editar o `50-cloud-init.yaml`, em vez de acrescentar outro arquivo. |
| `sudo` recusou a senha na app-b (*3 incorrect password attempts*) | Erro de digitação da senha; o comando seguinte, enviado pelo console, caiu no campo de senha e gastou as tentativas. | Rodar `sudo -v` de novo, olhar a tela antes de enviar outro comando e digitar a senha com calma. |
| `sudo` travado na db | O `sudo` pediu a senha no meio de um comando e ele foi cancelado com Ctrl+C. | `sudo -v` digitado pelo próprio usuário antes de enviar os comandos. |
| Hostname da app-a aparecia como `app-b` | A VM foi instalada com o nome errado. | `hostnamectl set-hostname` e `sed` no `/etc/hosts`; `exec bash` atualizou o prompt. |
| `sed` com erros *No such file or directory* e *extra characters* | Crases (`` ` ``) em vez de aspas simples (`'`) na expressão. | `sudo sed -i 's/app-b/app-a/g' /etc/hosts`. |
| Mensagem `lear: not found` | A primeira letra de um comando (`clear`) se perdeu ao ser enviada ao console. | Começar os comandos seguintes com um Enter vazio. Não afetou o resultado. |
| Primeiro pacote do ping do Windows se perde | O Windows ainda descobre o endereço da VM (ARP). | Normal; os pacotes seguintes respondem. |
| `/` da db com 9,75 GB em vez de 15 GB | LVM marcado no instalador. | Mantido por enquanto; pode ser expandido com `lvextend` e `resize2fs`. |
| Aviso de mídia (cdrom) no reboot | O Ubuntu pede para remover a ISO. | Inofensivo; Enter. |
| *Forwarding: Disabled* no Tailscale do Windows | Repasse de pacotes ainda não ligado. | **Pendente**: verificar quando um colega testar; plano B é anunciar a rota a partir da `lb`. |

## Acesso de laboratório (remover no fim)

Na `lb` foram criados uma chave SSH de laboratório (`claude-lab`) em `authorized_keys` e o arquivo `/etc/sudoers.d/90-lab` com `sudo` sem senha. São aceitáveis só em laboratório isolado e **devem ser removidos no fim do trabalho** (ver [vms.md](vms.md#acesso-de-laboratório)).

## Pendências

- [ ] `lb`: `sudo apt update && sudo apt upgrade`, Nginx e upstream.
- [ ] Ping de app-a, app-b e db para a `lb`.
- [ ] Reiniciar app-a, app-b e db e conferir que o IP fixo continua (`ip -br a`); a `lb` já foi testada.
- [ ] `app-b`: reconferir os IPs da `enp0s8` e a rota padrão única (`ip -br a`, `ip route`).
- [ ] Colega entrar na VPN e pingar/acessar uma VM.
- [ ] Decidir sobre a expansão do LVM da db.
- [ ] Remover o acesso de laboratório da `lb`.
