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

const banco = new Pool({
  host: process.env.BANCO_HOST,
  port: process.env.BANCO_PORTA,
  database: process.env.BANCO_NOME,
  user: process.env.BANCO_USUARIO,
  password: process.env.BANCO_SENHA,
});

app.get('/', (req, res) => {
  res.send('Ola! Quem respondeu foi o no ' + NOME_DO_NO);
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

app.listen(PORTA, () => {
  console.log('No ' + NOME_DO_NO + ' ouvindo na porta ' + PORTA);
});
