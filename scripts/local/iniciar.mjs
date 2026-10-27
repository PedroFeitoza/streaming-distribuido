// Ambiente de teste no PC, sem as VMs:
//  - PostgreSQL 16 temporario, preparado com os scripts de banco/ (como na db)
//  - os dois nos, rodando o mesmo app/server.js: NO_A na 3001 e NO_B na 3002
//  - um mini balanceador na 8080 que imita o Nginx da lb: alterna os nos a cada
//    requisicao e, se um no nao responder, tenta o outro (como o proxy_next_upstream)
// Uso:  cd scripts/local  ->  npm install  ->  npm start
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = path.join(RAIZ, 'app');
const PASTA_BANCO = path.join(os.tmpdir(), 'streaming-local-banco');
const PORTA_BANCO = 55432;
const PORTA_BALANCEADOR = 8080;
const SENHA_ADMIN = 'postgres_local';
const SENHA_APP = 'senha_local';
const NOS = [
  { nome: 'NO_A', porta: 3001, processo: null },
  { nome: 'NO_B', porta: 3002, processo: null },
];

if (!fs.existsSync(path.join(APP, 'node_modules', 'ejs'))) {
  console.error('Faltam as dependencias da aplicacao. Rode antes, na raiz do repositorio:');
  console.error('  cd app');
  console.error('  npm install');
  process.exit(1);
}

// 1. Banco: sempre comeca do zero, com o esquema, o catalogo e as permissoes do repositorio
console.log('Preparando o banco...');
fs.rmSync(PASTA_BANCO, { recursive: true, force: true });
const banco = new EmbeddedPostgres({
  databaseDir: PASTA_BANCO, user: 'postgres', password: SENHA_ADMIN,
  port: PORTA_BANCO, persistent: true, onLog: () => {},
});
let bancoLigado = false;
await banco.initialise();
await banco.start();
bancoLigado = true;
await banco.createDatabase('streaming');

const admin = new pg.Client({ host: '127.0.0.1', port: PORTA_BANCO, user: 'postgres',
  password: SENHA_ADMIN, database: 'streaming' });
await admin.connect();
await admin.query(`CREATE ROLE app_streaming LOGIN PASSWORD '${SENHA_APP}'`);
for (const arquivo of ['01-esquema.sql', '02-dados-exemplo.sql', '03-permissoes.sql']) {
  await admin.query(fs.readFileSync(path.join(RAIZ, 'banco', arquivo), 'utf8'));
}
await admin.end();

// 2. Nos: o mesmo codigo, so as variaveis de ambiente mudam (como o /etc/streaming.env)
function ligarNo(no) {
  const processo = spawn(process.execPath, ['server.js'], {
    cwd: APP,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NOME_DO_NO: no.nome,
      PORTA: String(no.porta),
      BANCO_HOST: '127.0.0.1',
      BANCO_PORTA: String(PORTA_BANCO),
      BANCO_NOME: 'streaming',
      BANCO_USUARIO: 'app_streaming',
      BANCO_SENHA: SENHA_APP,
    },
  });
  no.processo = processo;
  for (const saida of [processo.stdout, processo.stderr]) {
    readline.createInterface({ input: saida }).on('line', (linha) => console.log(`[${no.nome}] ${linha}`));
  }
  processo.on('exit', () => {
    if (no.processo === processo) no.processo = null;
  });
}

function desligarNo(no) {
  if (no.processo) no.processo.kill();
}

async function esperarNo(no) {
  for (let tentativa = 0; tentativa < 50; tentativa++) {
    try {
      const resposta = await fetch(`http://127.0.0.1:${no.porta}/teste-banco`);
      if (resposta.ok) return;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(no.nome + ' nao respondeu');
}

for (const no of NOS) ligarNo(no);
await Promise.all(NOS.map(esperarNo));

// 3. Mini balanceador: round-robin, e se o no da vez nao responder, tenta o outro
let vez = 0;
const balanceador = http.createServer((req, res) => {
  const ordem = vez === 0 ? [NOS[0], NOS[1]] : [NOS[1], NOS[0]];
  vez = 1 - vez;
  const tentados = [];

  const tentar = (i) => {
    if (res.headersSent) return res.destroy();
    if (i === ordem.length) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('502 Bad Gateway: nenhum no respondeu (' + tentados.join(', ') + ')');
    }
    const no = ordem[i];
    tentados.push('127.0.0.1:' + no.porta);
    const pedido = http.request(
      { host: '127.0.0.1', port: no.porta, method: req.method, path: req.url, headers: req.headers },
      (resposta) => {
        res.writeHead(resposta.statusCode, { ...resposta.headers, 'x-upstream': tentados.join(', ') });
        resposta.pipe(res);
      });
    pedido.on('error', () => tentar(i + 1));
    pedido.end();
  };
  tentar(0);
});
await new Promise((ok) => balanceador.listen(PORTA_BALANCEADOR, ok));

// 4. Comandos digitados no terminal
function mostrarEstado() {
  for (const no of NOS) {
    console.log(`  ${no.nome} (porta ${no.porta}): ${no.processo ? 'ligado' : 'DESLIGADO'}`);
  }
  console.log(`  banco (porta ${PORTA_BANCO}): ${bancoLigado ? 'ligado' : 'DESLIGADO'}`);
}

function ajuda() {
  console.log(`
Ambiente local pronto. Abra no navegador:  http://localhost:${PORTA_BALANCEADOR}
  (e o "balanceador"; recarregue a pagina e a barra alterna entre NO_A e NO_B)

  NO_A direto:  http://localhost:${NOS[0].porta}      NO_B direto:  http://localhost:${NOS[1].porta}
  Banco:        127.0.0.1:${PORTA_BANCO}, banco streaming, usuario app_streaming, senha ${SENHA_APP}

Digite uma letra e Enter:
  a  liga/desliga o NO_A    (como sudo systemctl stop/start streaming na app-a)
  b  liga/desliga o NO_B
  d  liga/desliga o banco
  s  mostra o que esta ligado
  q  encerra tudo e apaga o banco temporario
`);
}

let encerrando = false;
async function encerrar() {
  if (encerrando) return;
  encerrando = true;
  console.log('Encerrando...');
  for (const no of NOS) desligarNo(no);
  balanceador.close();
  if (bancoLigado) {
    try { await banco.stop(); } catch { /* ja parado */ }
  }
  try { fs.rmSync(PASTA_BANCO, { recursive: true, force: true }); } catch { /* apagado no proximo inicio */ }
  process.exit(0);
}

const comandos = readline.createInterface({ input: process.stdin });
comandos.on('line', async (linha) => {
  const comando = linha.trim().toLowerCase();
  if (comando === 'a' || comando === 'b') {
    const no = NOS[comando === 'a' ? 0 : 1];
    if (no.processo) {
      desligarNo(no);
      console.log(`${no.nome} desligado. O balanceador passa a usar so o outro no.`);
    } else {
      ligarNo(no);
      console.log(`${no.nome} ligando de novo...`);
    }
  } else if (comando === 'd') {
    if (bancoLigado) {
      await banco.stop();
      bancoLigado = false;
      console.log('Banco desligado. As paginas passam a mostrar erro 500, mas os nos continuam no ar.');
    } else {
      await banco.start();
      bancoLigado = true;
      console.log('Banco ligado de novo. Os nos voltam a funcionar sem reiniciar.');
    }
  } else if (comando === 's') {
    mostrarEstado();
  } else if (comando === 'q') {
    await encerrar();
  } else if (comando !== '') {
    ajuda();
  }
});
comandos.on('close', encerrar);
process.on('SIGINT', encerrar);

ajuda();
