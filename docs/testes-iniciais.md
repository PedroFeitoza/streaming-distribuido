# Testes iniciais das VMs

Registro dos testes que **foram executados** nas VMs até agora e dos resultados obtidos. O que ainda não foi testado está marcado como **pendente**. A criação das VMs está em [vms.md](vms.md), a rede em [rede.md](rede.md) e os comandos em [comandos-vms.md](comandos-vms.md).

> Situação em 23/10/2026. A `lb` ainda estava na instalação do Ubuntu quando os testes abaixo foram feitos.

## Resumo

| VM | Rede (IP fixo, NAT, rota) | Do Windows (ping e porta 22) | Entre as VMs | SSH por chave |
| --- | --- | --- | --- | --- |
| lb (.10) | **pendente** (instalação em andamento) | falhou: sem IP | falhou: sem IP | **pendente** |
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
| Ping para a lb | `ping -c 3 192.168.56.10` (VM) | responde | **falhou**: *Destination Host Unreachable* |
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
| Ping para a lb | `ping -c 3 192.168.56.10` (VM) | responde | **falhou**: *Destination Host Unreachable* |
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
| Ping para a lb | `ping -c 3 192.168.56.10` (VM) | responde | **falhou**: *Destination Host Unreachable* |
| Ping cruzado | `ping` para `.11` e `.12` (VM) | responde | responde, cerca de 1 ms |
| Login SSH por chave | `ssh sdadmin@192.168.56.13 hostname` (Windows) | `db`, sem pedir senha | `db`, sem senha |
| IP após reiniciar | `sudo reboot` e `ip -br a` (VM) | continua `192.168.56.13/24` | **pendente** |
| Tamanho de `/` | `df -h /` (VM) | cerca de 15 GB | 9,75 GB, porque o LVM ficou marcado (ver [Falhas](#falhas-e-causas)) |

## lb (192.168.56.10)

| Teste | Comando | Esperado | Obtido |
| --- | --- | --- | --- |
| VM criada | `VBoxManage showvminfo lb` (Windows) | 1024 MB, 1 CPU, NAT + host-only, disco e ISO | conforme esperado |
| Instalação | tela do console | instalador concluído | ainda em "Updating system" |
| Ping e SSH do Windows | `ping 192.168.56.10` (Windows) | responde | **falhou**: ainda sem IP |
| IP fixo, hostname, rota, internet | `ip -br a`, `hostname`, `ip route`, `ping ubuntu.com` (VM) | como nas outras VMs | **pendente** |

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
| Colega pinga uma VM pela VPN | `ping 192.168.56.10` (colega) | responde | **pendente**: nenhum colega entrou ainda, e a `lb` não tem IP |

Detalhes e comandos em [acesso-remoto.md](acesso-remoto.md), no PR #2.

## Falhas e causas

| O que falhou | Causa | Solução |
| --- | --- | --- |
| `ping 192.168.56.10` falha em todas as VMs e no Windows (*Destination Host Unreachable*) | A `lb` ainda estava instalando e não tinha o IP fixo. A mensagem indica que ninguém respondeu ao ARP para o `.10`. | **Pendente**: terminar a instalação da `lb` e fixar o IP; repetir o ping nas outras VMs. |
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

## Pendências

- [ ] `lb`: concluir a instalação, fixar `192.168.56.10` e repetir os testes da tabela.
- [ ] Ping de app-a, app-b e db para a `lb` e da `lb` para elas.
- [ ] Reiniciar cada VM e conferir que o IP fixo continua (`ip -br a`).
- [ ] Rota padrão única na app-b, conferida individualmente com `ip route`.
- [ ] Colega entrar na VPN e pingar/acessar uma VM.
- [ ] Decidir sobre a expansão do LVM da db.
