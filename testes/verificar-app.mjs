// Verifica a aplicacao pelo balanceador, contra o que o projeto entrega:
// requisitos RF01 a RF06 e RNF05 da documentacao e tarefas da secao 6 do guia.
//
// Uso (Node 18 ou mais novo, sem npm install):
//   node testes/verificar-app.mjs http://192.168.56.10              verificacao completa
//   node testes/verificar-app.mjs http://192.168.56.10 --queda 60   acompanha a queda de um no
// No PC, com o scripts/local rodando, use http://localhost:8080.
//
// A verificacao completa abre 10 vezes o primeiro video do catalogo, ou seja,
// grava 10 linhas em reproducoes. O modo --queda so le paginas.

const args = process.argv.slice(2);
const BASE = (args.find((a) => a.startsWith('http')) || 'http://localhost:8080').replace(/\/$/, '');

async function pegar(caminho) {
  const inicio = performance.now();
  const resposta = await fetch(BASE + caminho, { redirect: 'manual' });
  const html = await resposta.text();
  const barra = html.match(/class="barra-do-no" style="background: (#[0-9a-f]{6})">\s*Respondido pelo nó <strong>([^<]+)<\/strong>/);
  return {
    status: resposta.status,
    html,
    cabecalhos: resposta.headers,
    no: barra ? barra[2] : null,
    cor: barra ? barra[1] : null,
    ms: performance.now() - inicio,
  };
}

function lerCatalogo(html) {
  const linhas = [...html.matchAll(/<td><a href="\/videos\/(\d+)">(.*?)<\/a><\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>/g)];
  return linhas.map(([, id, titulo, categoria, duracao]) => ({ id: Number(id), titulo, categoria, duracao }));
}

function lerCategorias(html) {
  return [...html.matchAll(/<a href="\/\?categoria=(\d+)"\s*class="[^"]*">(.*?)<\/a>/g)]
    .map(([, id, nome]) => ({ id: Number(id), nome }));
}

function lerDistribuicao(html) {
  const porNo = {};
  for (const [, no, total] of html.matchAll(/<td>([^<]+)<\/td>\s*<td>(\d+)<\/td>\s*<td>\s*<div class="barra-pct"/g)) {
    porNo[no] = Number(total);
  }
  const total = html.match(/<tr><th>Total<\/th><th>(\d+)<\/th>/);
  return { porNo, total: total ? Number(total[1]) : 0 };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Modo --queda: 10 requisicoes por segundo em /, uma linha por segundo
// ---------------------------------------------------------------------------
if (args.includes('--queda')) {
  const segundos = Number(args[args.indexOf('--queda') + 1]) || 60;
  console.log(`Acompanhando ${BASE}/ por ${segundos} s, 10 requisicoes por segundo.`);
  console.log('Desligue um no (sudo systemctl stop streaming) e depois religue, nesse intervalo.\n');
  console.log('  seg  respostas          NO_A  NO_B  retentativas  falhas  mais lenta');

  const geral = { total: 0, falhas: 0, retentativas: 0, porNo: {}, maisLenta: 0 };
  const inicio = Date.now();
  for (let s = 0; s < segundos; s++) {
    const seg = { codigos: {}, porNo: {}, retentativas: 0, falhas: 0, maisLenta: 0 };
    while (Date.now() - inicio < (s + 1) * 1000) {
      const antes = Date.now();
      let r;
      try {
        r = await pegar('/');
      } catch (erro) {
        r = { status: erro.cause?.code || 'erro', ms: Date.now() - antes };
      }
      seg.codigos[r.status] = (seg.codigos[r.status] || 0) + 1;
      if (r.status !== 200) seg.falhas++;
      if (r.no) seg.porNo[r.no] = (seg.porNo[r.no] || 0) + 1;
      if ((r.cabecalhos?.get('x-upstream') || '').includes(',')) seg.retentativas++;
      seg.maisLenta = Math.max(seg.maisLenta, r.ms);
      await esperar(Math.max(0, 100 - (Date.now() - antes)));
    }
    const codigos = Object.entries(seg.codigos).map(([c, n]) => `${c}x${n}`).join(' ');
    console.log(`  ${String(s + 1).padStart(3)}  ${codigos.padEnd(17)}  ${String(seg.porNo.NO_A || 0).padStart(4)}  ${String(seg.porNo.NO_B || 0).padStart(4)}  `
      + `${String(seg.retentativas).padStart(12)}  ${String(seg.falhas).padStart(6)}  ${seg.maisLenta.toFixed(0).padStart(7)} ms`);
    geral.total += Object.values(seg.codigos).reduce((a, b) => a + b, 0);
    geral.falhas += seg.falhas;
    geral.retentativas += seg.retentativas;
    geral.maisLenta = Math.max(geral.maisLenta, seg.maisLenta);
    for (const [no, n] of Object.entries(seg.porNo)) geral.porNo[no] = (geral.porNo[no] || 0) + n;
  }
  console.log(`\nTotal: ${geral.total} requisicoes, ${geral.falhas} falhas vistas pelo cliente, `
    + `${geral.retentativas} retentativas no outro no (X-Upstream com dois enderecos), `
    + `mais lenta ${geral.maisLenta.toFixed(0)} ms.`);
  console.log('Por no:', JSON.stringify(geral.porNo));
  process.exit(geral.falhas === 0 ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Verificacao completa
// ---------------------------------------------------------------------------
const resultados = [];
function verificar(item, descricao, ok, detalhe = '') {
  resultados.push({ item, ok });
  console.log(`${ok ? 'OK   ' : 'FALHA'}  ${item.padEnd(10)} ${descricao}${detalhe ? '  (' + detalhe + ')' : ''}`);
}

console.log(`Verificando ${BASE}\n`);

// Balanceamento e barra do topo (guia 6.1 tarefa 7)
const paginas = [];
for (let i = 0; i < 8; i++) paginas.push(await pegar('/'));
const nos = paginas.map((p) => p.no);
const contagem = {};
for (const no of nos) contagem[no] = (contagem[no] || 0) + 1;
const nomesDosNos = Object.keys(contagem).filter((n) => n !== 'null');
verificar('guia 6.1.7', 'Toda resposta tem a barra com o nó', paginas.every((p) => p.status === 200 && p.no),
  nos.join(' '));
verificar('balanc.', 'As requisições se dividem entre dois nós', nomesDosNos.length >= 2
  && Math.max(...Object.values(contagem)) <= 6, JSON.stringify(contagem));
const alterna = nos.every((no, i) => i === 0 || no !== nos[i - 1]);
verificar('balanc.', 'Round-robin: nós alternam a cada requisição', alterna,
  alterna ? '' : 'pode ser outra pessoa usando o site ao mesmo tempo');
const corPorNo = {};
for (const p of paginas) if (p.no) corPorNo[p.no] = p.cor;
verificar('guia 6.1.7', 'Cada nó tem uma cor diferente', new Set(Object.values(corPorNo)).size === nomesDosNos.length,
  JSON.stringify(corPorNo));
verificar('barra', 'Páginas saem com Cache-Control: no-store',
  paginas.every((p) => p.cabecalhos.get('cache-control') === 'no-store'));

// RNF05: os dois nós devolvem a mesma página, tirando a barra
const semBarra = (html) => html.replace(/<div class="barra-do-no"[\s\S]*?<\/div>/, '');
const paginaPorNo = {};
for (const p of paginas) if (p.no && !paginaPorNo[p.no]) paginaPorNo[p.no] = semBarra(p.html);
const versoes = Object.values(paginaPorNo);
verificar('RNF05', 'Os nós geram o mesmo catálogo (só a barra muda)',
  versoes.length >= 2 && versoes.every((v) => v === versoes[0]));

// RF01: catalogo
const catalogo = lerCatalogo(paginas[0].html);
verificar('RF01', 'Catálogo lista os vídeos com título, categoria e duração',
  catalogo.length > 0 && catalogo.every((v) => v.titulo && v.categoria && /^\d+:\d{2}$/.test(v.duracao)),
  `${catalogo.length} vídeo(s): ` + catalogo.map((v) => `${v.titulo} ${v.duracao}`).join(', '));
verificar('guia 7.1.5', 'Catálogo com pelo menos 8 vídeos', catalogo.length >= 8, `tem ${catalogo.length}`);

// RF02: filtro por categoria
const categorias = lerCategorias(paginas[0].html);
let filtroOk = categorias.length > 0;
const idsFiltrados = [];
for (const categoria of categorias) {
  const lista = lerCatalogo((await pegar('/?categoria=' + categoria.id)).html);
  if (!lista.every((v) => v.categoria === categoria.nome)) filtroOk = false;
  idsFiltrados.push(...lista.map((v) => v.id));
}
const mesmosIds = idsFiltrados.length === catalogo.length
  && catalogo.every((v) => idsFiltrados.includes(v.id));
verificar('RF02', 'Filtro por categoria mostra só a categoria escolhida', filtroOk && mesmosIds,
  categorias.map((c) => c.nome).join(', '));

// RF03 e RF04: detalhe e player
const primeiro = catalogo[0];
const detalhe = await pegar('/videos/' + primeiro.id);
verificar('RF03', 'Detalhe mostra título, categoria e duração', detalhe.status === 200
  && detalhe.html.includes(`<h1>${primeiro.titulo}</h1>`)
  && detalhe.html.includes(`${primeiro.categoria} · ${primeiro.duracao}`), `/videos/${primeiro.id}`);
const iframe = detalhe.html.match(/<iframe class="player" src="https:\/\/www\.youtube\.com\/embed\/([A-Za-z0-9_-]+)"/);
const tagVideo = detalhe.html.match(/<video class="player" controls src="([^"]+)"/);
if (tagVideo) {
  const arquivo = await fetch(BASE + tagVideo[1]);
  verificar('RF04', 'Player <video> e arquivo servido pelo nó', arquivo.ok
    && (arquivo.headers.get('content-type') || '').startsWith('video/'), tagVideo[1]);
} else {
  verificar('RF04', 'Player do YouTube com o ID do vídeo', Boolean(iframe) && iframe[1].length === 11,
    iframe ? 'embed/' + iframe[1] : 'sem player');
}

// RF05 e RF06: cada abertura grava uma reproducao com o no que atendeu,
// e a pagina de distribuicao conta exatamente essas gravacoes
const antes = lerDistribuicao((await pegar('/distribuicao')).html);
const vistos = {};
const numeros = [];
let gravacaoOk = true;
for (let i = 0; i < 10; i++) {
  const p = await pegar('/videos/' + primeiro.id);
  const gravada = p.html.match(/Reprodução nº <strong>(\d+)<\/strong> registrada no banco pelo nó\s*<strong>([^<]+)<\/strong>/);
  if (p.status !== 200 || !gravada || gravada[2] !== p.no) gravacaoOk = false;
  if (gravada) numeros.push(Number(gravada[1]));
  vistos[p.no] = (vistos[p.no] || 0) + 1;
}
const depois = lerDistribuicao((await pegar('/distribuicao')).html);
verificar('RF05', 'Cada abertura grava uma reprodução com o nó da barra',
  gravacaoOk && new Set(numeros).size === 10, 'nºs ' + numeros.join(','));
const diferenca = {};
for (const no of Object.keys(depois.porNo)) diferenca[no] = depois.porNo[no] - (antes.porNo[no] || 0);
const bate = Object.keys(vistos).every((no) => diferenca[no] === vistos[no])
  && depois.total - antes.total === 10;
verificar('RF06', 'Distribuição conta exatamente as reproduções gravadas', bate,
  `abertas ${JSON.stringify(vistos)}, a página somou ${JSON.stringify(diferenca)}`);

// RF06 e sem estado: a pagina de distribuicao e igual nos dois nos
const distA = await pegar('/distribuicao');
const distB = await pegar('/distribuicao');
const numerosDist = (p) => JSON.stringify(lerDistribuicao(p.html));
verificar('sem estado', 'Os dois nós mostram a mesma contagem (vem do banco)',
  distA.no !== distB.no && numerosDist(distA) === numerosDist(distB),
  `${distA.no} e ${distB.no}: ${numerosDist(distA)}`);

// Erros e entradas invalidas
const p404 = await pegar('/videos/999999999');
const pNada = await pegar('/nao-existe');
verificar('erros', 'Vídeo e endereço inexistentes dão 404 com a barra',
  p404.status === 404 && pNada.status === 404 && p404.no && pNada.no);
const injecao = await pegar('/?categoria=' + encodeURIComponent('1; DROP TABLE videos'));
const injecaoId = await pegar('/videos/' + encodeURIComponent("1' OR '1'='1"));
const catalogoDepois = lerCatalogo((await pegar('/')).html);
verificar('segurança', 'Entradas maliciosas na URL não viram SQL',
  injecao.status === 200 && injecaoId.status === 404 && catalogoDepois.length === catalogo.length);

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} itens OK.`);
if (falhas.length) console.log('Com falha: ' + falhas.map((f) => f.item).join(', '));
process.exit(falhas.length === 0 ? 0 : 1);
