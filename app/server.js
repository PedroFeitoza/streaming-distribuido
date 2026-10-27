const os = require('os');
const path = require('path');
const express = require('express');
const { Pool } = require('pg');

const app = express();

const variaveis = ['NOME_DO_NO', 'PORTA', 'BANCO_HOST', 'BANCO_PORTA',
  'BANCO_NOME', 'BANCO_USUARIO', 'BANCO_SENHA'];

for (const nome of variaveis) {
  if (!process.env[nome]) {
    console.error('Variavel de ambiente nao definida: ' + nome);
    process.exit(1);
  }
}

const NOME_DO_NO = process.env.NOME_DO_NO;
const PORTA = process.env.PORTA;

// O Pool guarda so conexoes abertas com o banco, nao dados.
// connectionTimeoutMillis: se o banco nao responder em 5 s, a pagina da erro
// em vez de ficar carregando para sempre.
const banco = new Pool({
  host: process.env.BANCO_HOST,
  port: process.env.BANCO_PORTA,
  database: process.env.BANCO_NOME,
  user: process.env.BANCO_USUARIO,
  password: process.env.BANCO_SENHA,
  connectionTimeoutMillis: 5000,
});

// Se o banco cair ou reiniciar, as conexoes paradas no Pool dao erro. Sem este
// tratamento o Node encerra o processo e os dois nos caem junto com o banco.
banco.on('error', (erro) => {
  console.error('Conexao com o banco perdida: ' + erro.message);
});

// Uma cor por no, para o balanceamento aparecer na tela.
const CORES_DOS_NOS = { NO_A: '#1d4ed8', NO_B: '#c2410c' };
const COR_PADRAO = '#4b5563';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Funcoes que todas as paginas podem usar.
app.locals.corDoNo = (nome) => CORES_DOS_NOS[nome] || COR_PADRAO;
app.locals.formatarDuracao = (segundos) => {
  const minutos = Math.floor(segundos / 60);
  const resto = String(segundos % 60).padStart(2, '0');
  return minutos + ':' + resto;
};

// Arquivos de video locais, se o grupo usar .mp4 em vez do YouTube.
// Ficam em /opt/streaming/public/videos e sao servidos em /videos/<arquivo>.
app.use('/videos', express.static(path.join(__dirname, 'public', 'videos'), { index: false }));

// Toda pagina recebe os dados da barra do topo. O no-store impede o navegador
// de reaproveitar uma pagina antiga: a barra sempre mostra quem respondeu agora.
app.use((req, res, next) => {
  res.locals.no = {
    nome: NOME_DO_NO,
    maquina: os.hostname(),
    hora: new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
  };
  res.set('Cache-Control', 'no-store');
  next();
});

// Catalogo, com filtro opcional por categoria: /?categoria=2
app.get('/', async (req, res) => {
  const filtro = req.query.categoria;
  const categoriaId = /^\d{1,9}$/.test(filtro) ? Number(filtro) : null;

  const categorias = await banco.query('SELECT id, nome FROM categorias ORDER BY nome');

  let sql = 'SELECT v.id, v.titulo, v.duracao_segundos, c.nome AS categoria '
    + 'FROM videos v JOIN categorias c ON c.id = v.categoria_id';
  const parametros = [];
  if (categoriaId) {
    sql += ' WHERE v.categoria_id = $1';
    parametros.push(categoriaId);
  }
  sql += ' ORDER BY v.titulo';
  const videos = await banco.query(sql, parametros);

  res.render('catalogo', {
    titulo: 'Catálogo',
    categorias: categorias.rows,
    videos: videos.rows,
    categoriaId,
  });
});

// Detalhe do video. Cada abertura grava uma reproducao com o nome deste no:
// e com essa coluna que o banco mostra como o balanceador dividiu o trafego.
app.get('/videos/:id', async (req, res, next) => {
  if (!/^\d{1,9}$/.test(req.params.id)) return next();

  const resultado = await banco.query(
    'SELECT v.id, v.titulo, v.descricao, v.duracao_segundos, v.arquivo, c.nome AS categoria '
    + 'FROM videos v JOIN categorias c ON c.id = v.categoria_id WHERE v.id = $1',
    [req.params.id]);
  const video = resultado.rows[0];
  if (!video) return next();

  const reproducao = await banco.query(
    'INSERT INTO reproducoes (video_id, no_responsavel) VALUES ($1, $2) RETURNING id',
    [video.id, NOME_DO_NO]);

  res.render('video', {
    titulo: video.titulo,
    video,
    reproducaoId: reproducao.rows[0].id,
    arquivoLocal: /\.(mp4|webm)$/i.test(video.arquivo),
  });
});

// Pagina da demonstracao: reproducoes por no, contadas no banco compartilhado.
app.get('/distribuicao', async (req, res) => {
  const porNo = await banco.query(
    'SELECT no_responsavel, COUNT(*)::int AS total FROM reproducoes '
    + 'GROUP BY no_responsavel ORDER BY no_responsavel');
  const ultimas = await banco.query(
    "SELECT r.id, to_char(r.data_hora, 'DD/MM HH24:MI:SS') AS quando, "
    + 'r.no_responsavel, v.titulo '
    + 'FROM reproducoes r JOIN videos v ON v.id = r.video_id '
    + 'ORDER BY r.id DESC LIMIT 10');
  const total = porNo.rows.reduce((soma, linha) => soma + linha.total, 0);

  res.render('distribuicao', {
    titulo: 'Distribuição por nó',
    porNo: porNo.rows,
    ultimas: ultimas.rows,
    total,
  });
});

app.get('/teste-banco', async (req, res) => {
  try {
    const resultado = await banco.query('SELECT COUNT(*) AS total FROM videos');
    res.send('No ' + NOME_DO_NO + ': o banco tem ' + resultado.rows[0].total + ' videos');
  } catch (erro) {
    console.error(erro);
    res.status(500).send('Erro ao falar com o banco: ' + erro.message);
  }
});

app.use((req, res) => {
  res.status(404).render('erro', {
    titulo: 'Página não encontrada',
    mensagem: 'O endereço ' + req.path + ' não existe.',
  });
});

// O Express 5 manda para ca os erros das rotas async (por exemplo, banco fora do ar).
app.use((erro, req, res, next) => {
  console.error(erro);
  res.status(500).render('erro', {
    titulo: 'Erro no servidor',
    mensagem: 'O nó ' + NOME_DO_NO + ' não conseguiu atender: ' + (erro.message || erro.code),
  });
});

app.listen(PORTA, () => {
  console.log('No ' + NOME_DO_NO + ' ouvindo na porta ' + PORTA);
});
