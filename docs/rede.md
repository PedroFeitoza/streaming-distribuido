# Rede das máquinas virtuais

Como a rede das quatro VMs foi configurada. A criação das VMs está em [vms.md](vms.md).

> Situação em 23/10/2026. Itens marcados como **pendente** ainda não foram concluídos ou testados.

## Os dois adaptadores

| Adaptador VirtualBox | Interface no Ubuntu | Tipo | Endereço | Para quê |
| --- | --- | --- | --- | --- |
| 1 | `enp0s3` | NAT | `10.0.2.15` por DHCP (igual em todas) | Internet, `apt install` |
| 2 | `enp0s8` | Host-only | IP fixo `192.168.56.x/24` | Comunicação entre as VMs e com o host Windows |

Pelo NAT a VM sai para a internet através do host, como atrás de um roteador, mas nenhuma outra VM consegue chegar até ela por esse caminho. Por isso existe o segundo adaptador.

## IPs

| VM | IP `enp0s8` | Situação |
| --- | --- | --- |
| Host Windows | 192.168.56.1 | — |
| lb | 192.168.56.10 | aplicado e testado |
| app-a | 192.168.56.11 | aplicado e testado |
| app-b | 192.168.56.12 | aplicado e testado |
| db | 192.168.56.13 | aplicado e testado |

## DHCP ativo na rede host-only

A rede host-only do VirtualBox **tem um servidor DHCP ligado**, distribuindo endereços de `192.168.56.101` a `192.168.56.254`. O campo "DHCP: Disabled" mostrado na listagem dos adaptadores host-only é enganoso; quem confirma é:

```powershell
VBoxManage list dhcpservers   # Enabled: Yes
```

Consequência: logo após a instalação, a `enp0s8` já veio com IP do DHCP (`.102` na `app-a`, `.104` na `app-b`, `.103` na `db`, `.105` na `lb`), porque o instalador grava `dhcp4: true` nas duas interfaces. Os IPs do projeto (`.10` a `.13`) ficam fora da faixa do DHCP, então não há conflito, mas a `enp0s8` precisa de `dhcp4: false`. Se só fosse acrescentado o IP fixo, a interface ficaria com dois endereços (o do DHCP e o fixo).

## Netplan

O netplan descreve a rede em arquivos YAML em `/etc/netplan/` e gera a configuração para o `systemd-networkd`. O arquivo usado é o criado pelo instalador, `/etc/netplan/50-cloud-init.yaml`.

Exemplo da `app-a`:

```yaml
network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: true
    enp0s8:
      dhcp4: false
      addresses:
        - 192.168.56.11/24
```

| Linha | Significado |
| --- | --- |
| `enp0s3: dhcp4: true` | O adaptador NAT continua pegando IP, gateway e DNS por DHCP. É por ele que sai a rota padrão para a internet. |
| `enp0s8: dhcp4: false` | Desliga o DHCP da rede host-only nessa interface, para ela ter só o IP fixo. |
| `addresses: - 192.168.56.11/24` | IP fixo. `/24` é a máscara 255.255.255.0, ou seja, toda a rede `192.168.56.x`. |
| (sem `gateway` / `routes` na `enp0s8`) | De propósito. Com gateway nos dois adaptadores a VM teria duas rotas padrão e poderia perder a internet. |

YAML usa espaços (nunca Tab) para a indentação, e ela define a hierarquia.

Os arquivos de cada VM ficam em [`infra/netplan/`](../infra/netplan/). Existem os das quatro VMs (`lb`, `app-a`, `app-b` e `db`). Os comandos usados para gravar e aplicar o arquivo, um a um, estão em [comandos-vms.md](comandos-vms.md#parte-3--configurar-dentro-da-vm).

### Aplicar

```bash
sudo chmod 600 /etc/netplan/50-cloud-init.yaml   # evita o aviso "permissions too open"
sudo netplan apply
```

`sudo netplan try` é uma alternativa ao digitar direto no console: aplica a configuração e desfaz sozinho em 120 s se não for confirmada com Enter. Como a configuração foi digitada remotamente pelo console (sem como apertar Enter no momento certo), foi usado `netplan apply`.

Na `app-b` e na `db`, o arquivo original foi guardado antes em `50-cloud-init.yaml.bak` (na `db`, em `~/50-cloud-init.yaml.bak`).

### Desativar a rede do cloud-init

O cloud-init pode reescrever o `50-cloud-init.yaml` no boot e trazer o `dhcp4: true` de volta. Para impedir:

```bash
echo 'network: {config: disabled}' | sudo tee /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg
```

Aplicado nas quatro VMs. Na `lb` o backup do arquivo original ficou em `/root/50-cloud-init.yaml.bak`.

## Testes

Na VM:

```bash
hostname
ip -br a                # enp0s8 UP 192.168.56.x/24, só esse IPv4
ip route                # uma única rota default, via 10.0.2.2 dev enp0s3
ping -c 3 ubuntu.com    # internet pelo NAT
ping -c 3 192.168.56.10 # alcança a lb
```

No Windows (PowerShell):

```powershell
ping 192.168.56.11
ssh sdadmin@192.168.56.11
```

Para conferir que a configuração é permanente, reiniciar a VM (`sudo reboot`) e rodar `ip -br a` de novo.

### Resultados

| Teste | app-a | app-b | db |
| --- | --- | --- | --- |
| `hostname` | `app-a` | `app-b` | `db` |
| `ip -br a` | `enp0s8` só com `192.168.56.11/24` | `enp0s8` só com `192.168.56.12/24` | `enp0s8` só com `192.168.56.13/24` |
| `ip route` | uma rota default, via `enp0s3` | — | uma rota default, via `enp0s3` |
| `ping ubuntu.com` | 3/3 | 2/2 | 3/3 |
| Ping do Windows | ok | ok | 3/3, porta 22 aberta |
| `ssh` por chave do Windows | ok | ok | ok |
| `ping 192.168.56.10` (lb) | a confirmar | a confirmar | a confirmar |

A `lb` alcança as três VMs (ver abaixo). O ping no sentido contrário, de cada VM para a `lb`, está **a confirmar**. Os resultados completos de todos os testes estão em [testes-iniciais.md](testes-iniciais.md); aqui ficam os da configuração de rede.

### Resultados da `lb`

| Teste | Resultado |
| --- | --- |
| `ip -br a` | `enp0s8` com `192.168.56.10/24` |
| `ping ubuntu.com` (NAT) | 0% de perda |
| `ssh sdadmin@192.168.56.10` a partir do Windows | ok |
| `lb` para `192.168.56.11`, `.12` e `.13`: ping e porta 22 | todos ok |
| Reinício da `lb` | IP `192.168.56.10` mantido |

A `enp0s8` da `lb` chegou com `192.168.56.105` do DHCP antes do ajuste para `dhcp4: false`.
