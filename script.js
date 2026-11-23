'use strict';

/* ============================================================================
   Calcula IR – simulador de Imposto de Renda de Pessoa Física
   ----------------------------------------------------------------------------
   Estrutura deste arquivo:
     1) CONFIG ............ tabela, limites e regras (ATUALIZE SÓ AQUI todo ano)
     2) CÁLCULO ........... funções puras, sem DOM (testáveis no Node/console)
     3) INTERFACE ......... telas, máscara de moeda, gráfico, acessibilidade
     4) TESTES ............ 5 cenários com resultado esperado (rodarTestes())
   ============================================================================ */


/* ============================================================================
   1) CONFIGURAÇÃO
   Regras do ANO-CALENDÁRIO 2026 (declaração entregue em 2027).
   Valores conferidos em 23/11/2026 nas fontes abaixo. Confira sempre no site
   oficial: https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda
   ============================================================================ */
const CONFIG = {
  anoCalendario: 2026,
  exercicio: 2027,
  verificadoEm: '23/11/2026',

  /* Tabela progressiva ANUAL (alíquota e parcela a deduzir).
     Fonte: Receita Federal – tabela do exercício 2027 (ano-calendário 2026).
     Faixa 0% sobe para R$ 29.145,60 (= 12 × R$ 2.428,80, tabela mensal vigente
     desde maio/2025, Lei 15.191/2025 e MP 1.294/2025). Conferido em 23/11/2026. */
  tabelaAnual: [
    { ate: 29145.60,  aliquota: 0,     deduzir: 0 },
    { ate: 33919.80,  aliquota: 0.075, deduzir: 2185.92 },
    { ate: 45012.60,  aliquota: 0.15,  deduzir: 4729.91 },
    { ate: 55976.16,  aliquota: 0.225, deduzir: 8105.85 },
    { ate: Infinity,  aliquota: 0.275, deduzir: 10904.66 }
  ],

  /* Redução do imposto no ajuste anual (isenção ampliada).
     Fonte: Lei 15.270, de 26/11/2025, art. 11-A da Lei 9.250/1995, em vigor a
     partir do ano-calendário 2026. Conferido em 23/11/2026.
       • até R$ 60.000/ano ........ reduz até R$ 2.694,15 (zera o imposto)
       • R$ 60.000,01 a 88.200 .... reduz R$ 8.429,73 − 0,095575 × rendimentos
       • acima de R$ 88.200 ....... sem redução
     A redução nunca passa do imposto calculado (não gera crédito). */
  reducaoAnual: {
    limiteIsencao: 60000,
    reducaoMaxima: 2694.15,
    constante: 8429.73,
    coeficiente: 0.095575,
    limiteFinal: 88200
  },

  /* Deduções do modelo COMPLETO.
     Fonte: Receita Federal – "Tributação 2026" (valores inalterados pela
     Lei 15.270/2025). Conferido em 23/11/2026. */
  deducoes: {
    dependenteAnual: 2275.08,       // R$ 189,59 por mês × 12
    educacaoPorPessoa: 3561.50,     // limite anual por pessoa (você + dependentes)
    saudeTemLimite: false           // saúde não tem teto (exige comprovante)
    // Previdência (INSS) e pensão alimentícia judicial: dedução integral.
    // Atenção: PGBL só abate até 12% da renda bruta – ver texto de ajuda na tela.
  },

  /* Modelo SIMPLIFICADO: desconto de 20% da renda, limitado a R$ 17.640/ano.
     Fonte: Receita Federal (limite anual do desconto simplificado, 2026). */
  simplificado: {
    percentual: 0.20,
    tetoAnual: 17640
  },

  /* Avisos (não calculados aqui). Lei 15.270/2025: imposto mínimo para quem
     recebe mais de R$ 600 mil por ano e tributação de dividendos. */
  avisoImpostoMinimoAcimaDe: 600000,

  limites: { maxDependentes: 20, maxDigitosValor: 10 },

  /* Plano mensal que libera o resultado (o resultado aparece embaçado antes).
     linkPagamento: cole aqui o link de checkout/assinatura (Pix recorrente,
     Mercado Pago, Stripe, Hotmart etc.). Enquanto estiver vazio, o botão só avisa.
     permitirDemo: com true, abrir o site com ?demo=1 mostra o resultado liberado,
     só para você testar. Coloque false antes de publicar. */
  plano: { precoMensal: 5, linkPagamento: '', permitirDemo: true }
};


/* ============================================================================
   2) CÁLCULO – funções puras (sem acesso à tela)
   Todos os valores em reais, por ANO, a menos que o nome diga o contrário.
   ============================================================================ */

/** Arredonda para centavos. */
function arredondar(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** Converte a renda informada (mensal ou anual) para anual. */
function paraAnual(valor, periodo) {
  return periodo === 'mensal' ? valor * 12 : valor;
}

/** Descobre em qual faixa da tabela anual um valor se encaixa (0 a 4). */
function indiceDaFaixa(base, cfg = CONFIG) {
  const i = cfg.tabelaAnual.findIndex((f) => base <= f.ate);
  return i === -1 ? cfg.tabelaAnual.length - 1 : i;
}

/** Imposto pela tabela progressiva, ainda sem a redução da lei nova. */
function impostoPelaTabela(base, cfg = CONFIG) {
  if (!(base > 0)) return { imposto: 0, faixa: 0, aliquota: 0 };
  const faixa = indiceDaFaixa(base, cfg);
  const { aliquota, deduzir } = cfg.tabelaAnual[faixa];
  return { imposto: arredondar(Math.max(0, base * aliquota - deduzir)), faixa, aliquota };
}

/** Redução do imposto (Lei 15.270/2025), limitada ao imposto calculado. */
function reducaoDoImposto(rendimentosAnuais, impostoTabela, cfg = CONFIG) {
  const r = cfg.reducaoAnual;
  let reducao = 0;
  if (rendimentosAnuais <= r.limiteIsencao) {
    reducao = r.reducaoMaxima;
  } else if (rendimentosAnuais <= r.limiteFinal) {
    reducao = r.constante - r.coeficiente * rendimentosAnuais;
  }
  return arredondar(Math.min(Math.max(0, reducao), impostoTabela));
}

/** Desconto do modelo simplificado: 20% da renda, até o teto. */
function descontoSimplificado(rendaAnual, cfg = CONFIG) {
  return arredondar(Math.min(rendaAnual * cfg.simplificado.percentual, cfg.simplificado.tetoAnual));
}

/**
 * Soma as deduções do modelo completo.
 * Valores já em base ANUAL. `dependentes` é uma quantidade de pessoas.
 * O teto de educação vale por pessoa: usamos (1 + dependentes) pessoas.
 */
function deducoesCompletas(d, cfg = CONFIG) {
  const dependentes = Math.max(0, Math.floor(d.dependentes || 0));
  const positivo = (x) => Math.max(0, Number(x) || 0);

  const valorDependentes = dependentes * cfg.deducoes.dependenteAnual;
  const tetoEducacao = (1 + dependentes) * cfg.deducoes.educacaoPorPessoa;
  const educacaoInformada = positivo(d.educacao);
  const educacao = Math.min(educacaoInformada, tetoEducacao);
  const saude = positivo(d.saude);
  const previdencia = positivo(d.previdencia);
  const pensao = positivo(d.pensao);

  return {
    dependentes: arredondar(valorDependentes),
    educacao: arredondar(educacao),
    educacaoExcedente: arredondar(educacaoInformada - educacao),
    saude: arredondar(saude),
    previdencia: arredondar(previdencia),
    pensao: arredondar(pensao),
    total: arredondar(valorDependentes + educacao + saude + previdencia + pensao)
  };
}

/** Calcula uma das duas opções (simplificada ou completa) com uma dedução. */
function calcularOpcao(rendaAnual, deducao, cfg = CONFIG) {
  const deducaoAplicada = Math.min(Math.max(0, deducao), rendaAnual);
  const base = arredondar(rendaAnual - deducaoAplicada);
  const tabela = impostoPelaTabela(base, cfg);
  const reducao = reducaoDoImposto(rendaAnual, tabela.imposto, cfg);
  return {
    deducao: arredondar(deducaoAplicada),
    base,                                   // "valor sobre o qual o imposto é calculado"
    impostoTabela: tabela.imposto,
    reducao,
    imposto: arredondar(Math.max(0, tabela.imposto - reducao)),
    faixa: tabela.faixa,
    aliquotaFaixa: tabela.aliquota
  };
}

/**
 * Simulação completa.
 * entrada: { rendaAnual, dependentes, saude, educacao, previdencia, pensao, retido }
 * (todos os valores em reais por ano; dependentes = quantidade;
 *  retido = imposto já descontado na fonte, o IRRF do contracheque)
 */
function simular(entrada, cfg = CONFIG) {
  const rendaAnual = Math.max(0, Number(entrada.rendaAnual) || 0);
  const retido = Math.max(0, Number(entrada.retido) || 0);
  const ded = deducoesCompletas(entrada, cfg);

  const simplificada = calcularOpcao(rendaAnual, descontoSimplificado(rendaAnual, cfg), cfg);
  const completa = calcularOpcao(rendaAnual, ded.total, cfg);

  const diferenca = simplificada.imposto - completa.imposto;
  let melhor = 'empate';
  if (diferenca > 0.005) melhor = 'completa';
  else if (diferenca < -0.005) melhor = 'simplificada';

  const escolhida = melhor === 'completa' ? completa : simplificada;
  const imposto = escolhida.imposto;

  return {
    rendaAnual,
    retido,                                 // imposto já descontado na fonte (IRRF), por ano
    saldo: arredondar(retido - imposto),    // positivo: restituição a receber; negativo: imposto a pagar
    simplificada,
    completa,
    deducoes: ded,
    melhor,
    economia: arredondar(Math.abs(diferenca)),
    imposto,
    sobra: arredondar(rendaAnual - imposto),
    aliquotaEfetiva: rendaAnual > 0 ? imposto / rendaAnual : 0,
    aliquotaFaixa: escolhida.aliquotaFaixa,
    faixa: escolhida.faixa,
    reducao: escolhida.reducao,
    acimaDoImpostoMinimo: rendaAnual > cfg.avisoImpostoMinimoAcimaDe
  };
}


/* ============================================================================
   3) INTERFACE
   Só roda no navegador (no Node, apenas as funções acima são exportadas).
   ============================================================================ */

/* ---------- Formatação ---------- */
const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moeda = (v) => formatoMoeda.format(v);
const numeroBR = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentual = (v) => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';

/* ---------- Estado da tela (valores no período escolhido: mês ou ano) ---------- */
const estado = {
  assinante: false,    // true libera o resultado (ver CONFIG.plano)
  passo: 1,
  periodo: 'mensal',   // como a pessoa informou os valores
  visao: 'mensal',     // como o resultado é mostrado
  renda: 0,
  dependentes: 0,
  saude: 0,
  educacao: 0,
  previdencia: 0,
  pensao: 0,
  irrf: 0            // imposto já retido na fonte (não é dedução: é imposto já pago)
};

/** Converte o estado (mensal ou anual) na entrada anual da função `simular`. */
function calcularDoEstado() {
  const f = estado.periodo === 'mensal' ? 12 : 1;
  return simular({
    rendaAnual: estado.renda * f,
    dependentes: estado.dependentes,
    saude: estado.saude * f,
    educacao: estado.educacao * f,
    previdencia: estado.previdencia * f,
    pensao: estado.pensao * f,
    retido: estado.irrf * f
  });
}

/* ---------- Campos do passo 2 (textos em linguagem simples) ---------- */
const CAMPOS_DESPESAS = [
  {
    id: 'dependentes', tipo: 'contador', icone: 'i-users', rotulo: 'Dependentes',
    dica: 'Quantas pessoas você sustenta?',
    ajuda: 'Dependentes são pessoas que você sustenta, como filhos (até 21 anos, ou até 24 se estiverem na faculdade), cônjuge sem renda ou pais que moram com você e dependem do seu dinheiro. Cada dependente tira R$ 2.275,08 por ano do valor sobre o qual o imposto é calculado.'
  },
  {
    id: 'saude', tipo: 'moeda', icone: 'i-heart', rotulo: 'Saúde',
    dica: 'Médicos, dentista, psicólogo, exames e plano de saúde.',
    ajuda: 'Gastos com médicos, dentistas, psicólogos, exames, internações e plano de saúde, seus e dos seus dependentes. Guarde os recibos. Não existe limite de valor.'
  },
  {
    id: 'educacao', tipo: 'moeda', icone: 'i-cap', rotulo: 'Educação',
    dica: 'Escola, faculdade, pós e curso técnico.',
    ajuda: 'Mensalidades de escola, faculdade, pós-graduação e curso técnico, seus e dos dependentes. O limite é R$ 3.561,50 por pessoa a cada ano. Cursos de idiomas, cursos livres e material escolar não entram.'
  },
  {
    id: 'previdencia', tipo: 'moeda', icone: 'i-shield', rotulo: 'Previdência (INSS ou PGBL)',
    dica: 'INSS descontado do salário e previdência privada PGBL.',
    ajuda: 'É o INSS que sai do seu salário e o que você paga em previdência privada do tipo PGBL. O INSS entra por inteiro. O PGBL só vale até 12% da sua renda bruta do ano: se passar disso, informe apenas até esse limite.'
  },
  {
    id: 'pensao', tipo: 'moeda', icone: 'i-coins', rotulo: 'Pensão alimentícia',
    dica: 'Somente a paga por decisão da Justiça.',
    ajuda: 'Pensão alimentícia que você paga por determinação da Justiça (ou por escritura pública). Acordos informais, sem documento oficial, não entram.'
  }
];

/* Campo separado das deduções: imposto que JÁ FOI PAGO no ano (IRRF).
   Com ele o resultado mostra se sobra restituição ou se falta pagar. */
const CAMPO_IRRF = {
  id: 'irrf', tipo: 'moeda', icone: 'i-receipt', rotulo: 'Imposto que você já pagou',
  dica: 'Opcional. É o IRRF que já saiu do seu contracheque.',
  ajuda: 'É o imposto de renda que já foi descontado do seu salário ao longo do ano. No contracheque aparece como "IRRF". Some os meses, ou informe uma média, na mesma unidade (por mês ou por ano) usada nas despesas acima. Com esse valor a gente estima se você vai receber restituição ou ainda vai pagar imposto no acerto anual.'
};

/* ---------- Utilitários de tela ---------- */
const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
const $$ = (seletor, raiz = document) => Array.from(raiz.querySelectorAll(seletor));
const prefereMenosMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function avisoRapido(texto) {
  const el = $('#toast');
  el.textContent = texto;
  el.classList.add('visivel');
  clearTimeout(avisoRapido.t);
  avisoRapido.t = setTimeout(() => el.classList.remove('visivel'), 3200);
}

function atrasar(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------- Máscara de moeda: o usuário digita só números, os centavos entram sozinhos ---------- */
function ligarMascaraMoeda(input, aoMudar) {
  input.addEventListener('input', () => {
    const digitos = input.value.replace(/\D/g, '').slice(0, CONFIG.limites.maxDigitosValor);
    const valor = digitos ? parseInt(digitos, 10) / 100 : 0;
    input.value = digitos ? numeroBR(valor) : '';
    const fim = input.value.length;
    try { input.setSelectionRange(fim, fim); } catch (e) { /* alguns teclados não permitem */ }
    aoMudar(valor);
  });
}

function limparCampos() {
  $$('input[inputmode="numeric"]').forEach((i) => { i.value = ''; });
  $$('#campos-despesas input.contador-valor').forEach((i) => { i.value = '0'; });
}

/* ---------- Navegação entre os passos ---------- */
function irParaPasso(n, { foco = true } = {}) {
  estado.passo = n;
  [1, 2, 3].forEach((i) => { $('#passo-' + i).hidden = i !== n; });

  $('#progresso-texto').textContent = `Passo ${n} de 3`;
  $('.barra').setAttribute('aria-valuenow', String(n));
  $('#barra-preenchida').style.width = (n / 3) * 100 + '%';

  if (n === 2) $('#unidade-despesas').textContent = estado.periodo === 'mensal' ? 'por mês' : 'por ano';
  if (n === 3) renderizarResultado();
  renderizarPrevias();

  window.scrollTo({ top: 0, behavior: prefereMenosMovimento() ? 'auto' : 'smooth' });
  if (foco) {
    const titulo = $('#passo-' + n + ' h1');
    if (titulo) titulo.focus({ preventScroll: true });
  }
}

/* ---------- Prévia em tempo real (passos 1 e 2) ---------- */
function textoDaPrevia() {
  // A estimativa é parte do resultado pago: só aparece para quem tem o plano.
  if (!estado.assinante || !(estado.renda > 0)) return '';
  const r = calcularDoEstado();
  const mensal = estado.periodo === 'mensal';
  const por = mensal ? 'por mês' : 'por ano';
  const valor = mensal ? r.imposto / 12 : r.imposto;
  if (r.imposto <= 0) return 'Estimativa rápida: com esses valores você <strong>não pagaria imposto</strong>.';
  return `Estimativa rápida: cerca de <strong>${moeda(valor)}</strong> de imposto ${por}.`;
}

function renderizarPrevias() {
  const html = textoDaPrevia();
  ['#previa-1', '#previa-2'].forEach((id) => {
    const el = $(id);
    el.innerHTML = html;
    el.hidden = !html;
  });
}
const renderizarPreviasSuave = atrasar(renderizarPrevias, 300);

/* ---------- Passo 1 ---------- */
function atualizarTextosDoPeriodo() {
  const mensal = estado.periodo === 'mensal';
  $('#rotulo-renda').textContent = mensal ? 'Quanto você ganha por mês?' : 'Quanto você ganha por ano?';
  $('#renda-dica').textContent = mensal
    ? 'Somamos 12 meses iguais para estimar o ano todo.'
    : 'Some tudo o que você recebeu (ou vai receber) em 2026.';
}

function mostrarErroRenda(texto) {
  const erro = $('#renda-erro');
  erro.textContent = texto || '';
  erro.hidden = !texto;
  $('.entrada-grande').classList.toggle('com-erro', Boolean(texto));
  $('#renda').setAttribute('aria-invalid', texto ? 'true' : 'false');
}

function iniciarPasso1() {
  const inputRenda = $('#renda');
  ligarMascaraMoeda(inputRenda, (valor) => {
    estado.renda = valor;
    if (valor > 0) mostrarErroRenda('');
    renderizarPreviasSuave();
  });

  $$('input[name="periodo"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      estado.periodo = radio.value;
      estado.visao = radio.value;
      atualizarTextosDoPeriodo();
      renderizarPrevias();
    });
  });

  $('#form-1').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!(estado.renda > 0)) {
      mostrarErroRenda('Digite quanto você ganha para continuar. Pode ser um valor aproximado.');
      inputRenda.focus();
      return;
    }
    irParaPasso(2);
  });
}

/* ---------- Passo 2 ---------- */
function htmlCampo(c) {
  const icone = `<span class="campo-icone"><svg class="icone" aria-hidden="true"><use href="#${c.icone}"/></svg></span>`;
  const botaoAjuda = `<button type="button" class="ajuda" aria-expanded="false" aria-controls="aj-${c.id}" aria-label="Explicação sobre ${c.rotulo}"></button>`;
  const painel = `<p class="ajuda-texto" id="aj-${c.id}" hidden>${c.ajuda}</p>`;

  const entrada = c.tipo === 'contador'
    ? `<div class="contador">
         <button type="button" data-passo="-1" aria-label="Diminuir o número de dependentes">−</button>
         <input id="f-${c.id}" class="contador-valor" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="0" aria-describedby="dica-${c.id}">
         <button type="button" data-passo="1" aria-label="Aumentar o número de dependentes">+</button>
       </div>`
    : `<div class="entrada-moeda">
         <span class="prefixo" aria-hidden="true">R$</span>
         <input id="f-${c.id}" type="text" inputmode="numeric" autocomplete="off" placeholder="0,00" aria-describedby="dica-${c.id}">
       </div>`;

  return `<div class="campo">
            <div class="campo-topo">${icone}<label class="campo-rotulo" for="f-${c.id}">${c.rotulo}</label>${botaoAjuda}</div>
            ${painel}${entrada}
            <p class="dica" id="dica-${c.id}">${c.dica}</p>
          </div>`;
}

function iniciarPasso2() {
  const area = $('#campos-despesas');
  area.innerHTML = CAMPOS_DESPESAS.map(htmlCampo).join('') + htmlCampo(CAMPO_IRRF);

  // Botões "?" abrem e fecham a explicação
  area.addEventListener('click', (ev) => {
    const botao = ev.target.closest('.ajuda');
    if (!botao) return;
    const painel = document.getElementById(botao.getAttribute('aria-controls'));
    const abrir = botao.getAttribute('aria-expanded') !== 'true';
    botao.setAttribute('aria-expanded', String(abrir));
    painel.hidden = !abrir;
  });

  // Campos de dinheiro
  CAMPOS_DESPESAS.filter((c) => c.tipo === 'moeda').forEach((c) => {
    ligarMascaraMoeda($('#f-' + c.id), (valor) => {
      estado[c.id] = valor;
      renderizarPreviasSuave();
    });
  });

  // Imposto já retido (IRRF): campo próprio, fora das deduções
  ligarMascaraMoeda($('#f-' + CAMPO_IRRF.id), (valor) => {
    estado.irrf = valor;
    renderizarPreviasSuave();
  });

  // Contador de dependentes
  const inputDep = $('#f-dependentes');
  const definirDependentes = (n) => {
    const limite = CONFIG.limites.maxDependentes;
    estado.dependentes = Math.min(limite, Math.max(0, n));
    inputDep.value = String(estado.dependentes);
    renderizarPreviasSuave();
  };
  inputDep.addEventListener('input', () => {
    const digitos = inputDep.value.replace(/\D/g, '').slice(0, 2);
    definirDependentes(digitos ? parseInt(digitos, 10) : 0);
  });
  $$('.contador button', area).forEach((b) => {
    b.addEventListener('click', () => definirDependentes(estado.dependentes + Number(b.dataset.passo)));
  });

  $('#form-2').addEventListener('submit', (ev) => { ev.preventDefault(); irParaPasso(3); });
  $('#btn-voltar-2').addEventListener('click', () => irParaPasso(1));
  $('#btn-pular').addEventListener('click', () => {
    Object.assign(estado, { dependentes: 0, saude: 0, educacao: 0, previdencia: 0, pensao: 0 });
    $$('input', area).forEach((i) => {
      if (i.id === 'f-' + CAMPO_IRRF.id) return; // o IRRF não é dedução
      i.value = i.classList.contains('contador-valor') ? '0' : '';
    });
    irParaPasso(3);
  });
}

/* ---------- Passo 3: resultado ---------- */
function htmlRosca(r) {
  const raio = 78;
  const circ = 2 * Math.PI * raio;
  const pct = r.rendaAnual > 0 ? r.imposto / r.rendaAnual : 0;
  const fatia = Math.min(circ, pct * circ);
  const rotulo = `Gráfico de rosca: ${percentual(pct)} da renda vai para o imposto e ${percentual(1 - pct)} fica com você.`;
  return `<svg class="rosca" viewBox="0 0 200 200" role="img" aria-label="${rotulo}">
      <g transform="rotate(-90 100 100)">
        <circle class="trilho" cx="100" cy="100" r="${raio}"/>
        <circle class="fatia" cx="100" cy="100" r="${raio}" stroke-dasharray="0 ${circ}" data-final="${fatia} ${circ}"/>
      </g>
      <text class="rosca-num" x="100" y="105">${percentual(pct)}</text>
      <text class="rosca-leg" x="100" y="125">vai para o imposto</text>
    </svg>`;
}

function htmlOpcao(chave, nome, opcao, r, divisor, textoDesconto, extra) {
  const eMelhor = r.melhor === chave;
  const selo = eMelhor
    ? `<span class="selo"><svg class="icone" aria-hidden="true"><use href="#i-check"/></svg>Melhor para você</span>`
    : '';
  const unidade = estado.visao === 'mensal' ? 'por mês' : 'por ano';
  return `<article class="opcao${eMelhor ? ' melhor' : ''}" aria-label="${nome}${eMelhor ? ', melhor para você' : ''}">
      ${selo}
      <h3 class="opcao-nome">${nome}</h3>
      <p class="opcao-valor">${moeda(opcao.imposto / divisor)} <small>${unidade}</small></p>
      <p class="opcao-detalhe">${textoDesconto}</p>
      <p class="opcao-detalhe">Valor sobre o qual o imposto é calculado: <strong>${moeda(opcao.base / divisor)}</strong></p>
      ${extra || ''}
    </article>`;
}

function renderizarResultado(manterFoco = false) {
  // Sem o plano, a tela é montada com um EXEMPLO fictício (nunca com os números
  // da pessoa) e fica embaçada. Assim os valores reais não ficam no código da página.
  const bloqueado = !estado.assinante;
  const r = bloqueado
    ? simular({ rendaAnual: 84000, dependentes: 1, saude: 6000 })
    : calcularDoEstado();
  const mensal = bloqueado ? true : estado.visao === 'mensal';
  const divisor = mensal ? 12 : 1;
  const unidade = mensal ? 'por mês' : 'por ano';
  const imposto = r.imposto / divisor;
  const sobra = r.sobra / divisor;
  const semDespesas = r.deducoes.total === 0;

  // Bloqueado: o título do exemplo é só texto (o <h1> verdadeiro está no cartão de desbloqueio).
  const abreTitulo = bloqueado ? '<p class="headline">' : '<h1 id="t3" class="headline" tabindex="-1">';
  const fechaTitulo = bloqueado ? '</p>' : '</h1>';
  const titulo = r.imposto <= 0
    ? `${abreTitulo}Boa notícia: <span class="valor-destaque verde">você não pagará imposto</span>${fechaTitulo}
       <p class="headline-sub">Com os dados informados, o imposto estimado para ${CONFIG.anoCalendario} é <strong>R$ 0,00</strong>.</p>`
    : `${abreTitulo}Você pagará <span class="valor-destaque">${moeda(imposto)}</span> de imposto ${unidade}${fechaTitulo}
       <p class="headline-sub">Estimativa para o ano-calendário ${CONFIG.anoCalendario}, calculada no acerto anual (declaração de ${CONFIG.exercicio}).</p>`;

  // Comparativo simplificada x completa
  const textoSimp = `Desconto automático de 20% da renda (no máximo ${moeda(CONFIG.simplificado.tetoAnual / divisor)} ${unidade}), sem precisar comprovar nada: <strong>${moeda(r.simplificada.deducao / divisor)}</strong>`;
  const textoComp = semDespesas
    ? 'Você não informou despesas, então não há o que abater.'
    : `Soma das suas despesas que abatem imposto: <strong>${moeda(r.completa.deducao / divisor)}</strong>`;
  const extraComp = r.deducoes.educacaoExcedente > 0
    ? '<p class="opcao-detalhe">Seus gastos com educação passaram do limite, então usamos o valor máximo permitido.</p>'
    : '';

  const nomeMelhor = r.melhor === 'completa' ? 'declaração completa' : 'declaração simplificada';
  let linhaEconomia = '<p class="economia">As duas opções dão o mesmo valor de imposto.</p>';
  if (r.melhor !== 'empate') {
    linhaEconomia = `<p class="economia">Escolhendo a ${nomeMelhor}, você paga <strong>${moeda(r.economia / divisor)}</strong> a menos ${unidade}.</p>`;
  }

  // Faixas
  const faixas = CONFIG.tabelaAnual.map((f, i) =>
    `<li${i === r.faixa ? ' aria-current="true"' : ''}>${f.aliquota === 0 ? 'Isento' : percentual(f.aliquota)}</li>`).join('');

  const textoFaixa = r.faixa === 0
    ? 'Sua renda ficou na faixa em que a tabela não cobra imposto.'
    : `É o percentual cobrado só sobre a parte da sua renda que cai na faixa de ${percentual(r.aliquotaFaixa)}, e não sobre tudo o que você ganha.`;
  const textoReducao = r.reducao > 0
    ? ` Além disso, a lei nova de 2025 tira ${moeda(r.reducao / divisor)} ${unidade} do seu imposto.`
    : '';

  const aviso = r.acimaDoImpostoMinimo
    ? `<div class="aviso" role="note"><svg class="icone" aria-hidden="true"><use href="#i-info"/></svg>
         <p style="margin:0">Para rendas acima de ${moeda(CONFIG.avisoImpostoMinimoAcimaDe)} por ano existe um imposto mínimo adicional, e dividendos têm regra própria. Este simulador não calcula essas partes.</p></div>`
    : '';

  // Restituição ou imposto a pagar (só quando a pessoa informou o IRRF).
  // Valores sempre ANUAIS: a restituição é um evento do acerto do ano.
  let blocoRestituicao = '';
  if (!bloqueado && r.retido > 0) {
    let linha, explicacao;
    if (r.saldo > 0.005) {
      linha = `Você deve <strong class="verde-texto">receber de volta cerca de ${moeda(r.saldo)}</strong> por ano`;
      explicacao = `Já descontaram ${moeda(r.retido)} do seu salário, mas o imposto devido é ${moeda(r.imposto)}. A diferença volta para você na restituição, depois que a declaração for enviada e processada.`;
    } else if (r.saldo < -0.005) {
      linha = `Você ainda vai <strong class="vermelho-texto">pagar cerca de ${moeda(-r.saldo)}</strong> no acerto do ano`;
      explicacao = `Já descontaram ${moeda(r.retido)} do seu salário, mas o imposto devido é ${moeda(r.imposto)}. A diferença é paga na declaração (dá para parcelar).`;
    } else {
      linha = 'Nem restituição nem imposto a pagar';
      explicacao = `O que já descontaram do seu salário (${moeda(r.retido)}) cobre quase exatamente o imposto devido (${moeda(r.imposto)}).`;
    }
    blocoRestituicao = `
    <section class="bloco bloco-restituicao" aria-labelledby="h-rest">
      <h2 class="bloco-titulo" id="h-rest">Restituição ou imposto a pagar</h2>
      <p class="restituicao-linha">${linha}</p>
      <p class="dica">${explicacao}</p>
    </section>`;
  }

  const fieldsetVisao = bloqueado ? '' : `
    <fieldset class="periodo visao">
      <legend class="sr-only">Mostrar valores por</legend>
      <label class="segmento"><input type="radio" name="visao" value="mensal"${mensal ? ' checked' : ''}><span>Por mês</span></label>
      <label class="segmento"><input type="radio" name="visao" value="anual"${mensal ? '' : ' checked'}><span>Por ano</span></label>
    </fieldset>`;

  const preco = moeda(CONFIG.plano.precoMensal);
  const cartaoDesbloqueio = `
    <div class="trava-card" role="region" aria-labelledby="t3">
      <svg class="icone trava-icone" aria-hidden="true"><use href="#i-lock"/></svg>
      <h1 id="t3" class="trava-titulo" tabindex="-1">Seu resultado está pronto</h1>
      <p>Veja quanto você paga de imposto, qual declaração compensa mais e suas alíquotas.</p>
      <p class="trava-preco"><strong>${preco}</strong> por mês</p>
      <button type="button" class="btn btn-primario" id="btn-desbloquear">Desbloquear por ${preco}/mês</button>
    </div>`;

  $('#resultado').innerHTML = `
    <div class="trava">
    <div class="resultado-conteudo${bloqueado ? ' bloqueado' : ''}"${bloqueado ? ' aria-hidden="true" inert' : ''}>
    ${titulo}
    ${fieldsetVisao}
    ${blocoRestituicao}

    <section class="bloco" aria-labelledby="h-rosca">
      <h2 class="bloco-titulo" id="h-rosca">Para onde vai o seu dinheiro</h2>
      <div class="rosca-bloco">
        ${htmlRosca(r)}
        <ul class="legenda">
          <li><span class="bolinha imposto" aria-hidden="true"></span><span class="nome">Imposto</span><span class="valor imposto">${moeda(imposto)}</span></li>
          <li><span class="bolinha sobra" aria-hidden="true"></span><span class="nome">Fica com você</span><span class="valor sobra">${moeda(sobra)}</span></li>
        </ul>
      </div>
      <p class="dica">Considera só o imposto de renda sobre o valor bruto informado. Outros descontos, como INSS, não entram nesta conta.</p>
    </section>

    <section class="bloco" aria-labelledby="h-comp">
      <h2 class="bloco-titulo" id="h-comp">Declaração simplificada ou completa?</h2>
      <div class="comparativo">
        ${htmlOpcao('simplificada', 'Declaração simplificada', r.simplificada, r, divisor, textoSimp)}
        ${htmlOpcao('completa', 'Declaração completa', r.completa, r, divisor, textoComp, extraComp)}
      </div>
      ${linhaEconomia}
    </section>

    <section class="bloco" aria-labelledby="h-aliq">
      <h2 class="bloco-titulo" id="h-aliq">Suas alíquotas</h2>
      <ol class="faixas" aria-label="Faixas da tabela do imposto">${faixas}</ol>
      <div class="explica">
        <div class="explica-item">
          <span class="explica-nome">Alíquota efetiva</span>
          <span class="explica-valor">${percentual(r.aliquotaEfetiva)}</span>
          <p>É quanto do que você ganha realmente vai para o imposto: de cada R$ 100, ${moeda(r.aliquotaEfetiva * 100)} ficam com o governo.</p>
        </div>
        <div class="explica-item">
          <span class="explica-nome">Alíquota da faixa</span>
          <span class="explica-valor">${r.faixa === 0 ? 'Isento' : percentual(r.aliquotaFaixa)}</span>
          <p>${textoFaixa}${textoReducao}</p>
        </div>
      </div>
    </section>

    ${aviso}
    </div>
    ${bloqueado ? cartaoDesbloqueio : ''}
    </div>

    <div class="resultado-acoes">
      ${bloqueado ? '' : `<button type="button" class="btn btn-primario" id="btn-compartilhar">
        <svg class="icone" aria-hidden="true"><use href="#i-share"/></svg>Compartilhar resultado
      </button>`}
      <button type="button" class="btn btn-secundario" id="btn-refazer">
        <svg class="icone" aria-hidden="true"><use href="#i-refresh"/></svg>Refazer simulação
      </button>
      <button type="button" class="btn btn-texto" id="btn-voltar-3">
        <svg class="icone" aria-hidden="true"><use href="#i-arrow-left"/></svg>Editar despesas
      </button>
    </div>`;

  // Animação do gráfico (respeita prefers-reduced-motion)
  const fatia = $('.rosca .fatia');
  if (fatia) {
    const final = fatia.dataset.final;
    if (prefereMenosMovimento() || manterFoco) fatia.setAttribute('stroke-dasharray', final);
    else requestAnimationFrame(() => requestAnimationFrame(() => fatia.setAttribute('stroke-dasharray', final)));
  }

  // Eventos dos elementos recém-criados
  $$('input[name="visao"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      estado.visao = radio.value;
      renderizarResultado(true);
      const marcado = $('input[name="visao"]:checked');
      if (marcado) marcado.focus();
    });
  });
  $('#btn-refazer').addEventListener('click', refazer);
  $('#btn-voltar-3').addEventListener('click', () => irParaPasso(2));
  const btnCompartilhar = $('#btn-compartilhar');
  if (btnCompartilhar) btnCompartilhar.addEventListener('click', () => compartilhar(r));
  const btnDesbloquear = $('#btn-desbloquear');
  if (btnDesbloquear) btnDesbloquear.addEventListener('click', desbloquear);
}

/** Leva a pessoa ao pagamento do plano mensal (link definido em CONFIG.plano). */
function desbloquear() {
  const link = CONFIG.plano.linkPagamento;
  if (link) {
    window.open(link, '_blank', 'noopener,noreferrer');
  } else {
    avisoRapido('O pagamento ainda não foi configurado. Defina plano.linkPagamento no CONFIG do script.js.');
  }
}

function refazer() {
  Object.assign(estado, {
    periodo: 'mensal', visao: 'mensal', renda: 0,
    dependentes: 0, saude: 0, educacao: 0, previdencia: 0, pensao: 0, irrf: 0
  });
  limparCampos();
  $('input[name="periodo"][value="mensal"]').checked = true;
  atualizarTextosDoPeriodo();
  mostrarErroRenda('');
  $$('.ajuda').forEach((b) => { b.setAttribute('aria-expanded', 'false'); });
  $$('.ajuda-texto').forEach((p) => { p.hidden = true; });
  irParaPasso(1);
  $('#renda').focus();
}

async function compartilhar(r) {
  // Compartilha só o resultado, sem a renda informada.
  const textoImposto = r.imposto <= 0
    ? 'não vou pagar imposto de renda'
    : `vou pagar cerca de ${moeda(r.imposto / 12)} de imposto por mês (${percentual(r.aliquotaEfetiva)} do que ganho)`;
  const texto = `Simulei meu Imposto de Renda no Calcula IR: ${textoImposto}. Simule o seu em menos de 1 minuto:`;
  const url = window.location.href.split('#')[0];

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Calcula IR', text: texto, url });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // a pessoa fechou a janela de compartilhar
    }
  }
  try {
    await navigator.clipboard.writeText(`${texto} ${url}`);
    avisoRapido('Resultado copiado! Agora é só colar onde quiser.');
  } catch (e) {
    avisoRapido('Não consegui copiar automaticamente. Tente de novo ou copie o endereço da página.');
  }
}

function iniciar() {
  if (CONFIG.plano.permitirDemo) {
    estado.assinante = new URLSearchParams(window.location.search).get('demo') === '1';
  }
  iniciarPasso1();
  iniciarPasso2();
  atualizarTextosDoPeriodo();
  irParaPasso(1, { foco: false });
  window.scrollTo(0, 0);
}


/* ============================================================================
   4) TESTES – 6 cenários com resultado esperado
   Valores esperados calculados à mão a partir da tabela em CONFIG.
   Rode no navegador: abra o console e digite  CalculaIR.rodarTestes()
   Ou no Node:  node -e "console.log(require('./script.js').rodarTestes())"
   ----------------------------------------------------------------------------
   1) Renda isenta – R$ 3.000/mês (R$ 36.000/ano), sem despesas
      Simplificada: desconto 20% = 7.200 → base 28.800 (≤ 29.145,60, faixa 0%)
      Completa (sem despesas): base 36.000 → 514,08, zerado pela redução de até 2.694,15
      Esperado: imposto R$ 0,00/ano · melhor: empate (as duas dão zero)

   2) Faixa intermediária – R$ 6.000/mês (R$ 72.000/ano), sem despesas
      Simplificada: desconto 14.400 → base 57.600 × 27,5% − 10.904,66 = 4.935,34
      Redução: 8.429,73 − 0,095575 × 72.000 = 1.548,33
      Esperado: imposto R$ 3.387,01/ano (R$ 282,25/mês) · melhor: simplificada

   3) Renda alta – R$ 15.000/mês (R$ 180.000/ano), sem despesas
      Simplificada: desconto limitado a 17.640 → base 162.360
      162.360 × 27,5% − 10.904,66 = 33.744,34 · sem redução (acima de 88.200)
      Esperado: imposto R$ 33.744,34/ano (R$ 2.812,03/mês) · melhor: simplificada

   4) Com dependentes – R$ 10.000/mês (R$ 120.000/ano), 2 dependentes
      Completa: dedução 2 × 2.275,08 = 4.550,16 → base 115.449,84 → 20.844,05
      Simplificada: base 102.360 → 17.244,34 (ganha: 4.550,16 < 17.640)
      Esperado: imposto R$ 17.244,34/ano (R$ 1.437,03/mês) · melhor: simplificada

   5) Com deduções – R$ 12.000/mês (R$ 144.000/ano), 2 dependentes,
      saúde R$ 1.500/mês, educação R$ 1.000/mês, INSS R$ 1.000/mês
      Deduções/ano: 4.550,16 + 18.000 + 10.684,50 (educação limitada a
      3 pessoas × 3.561,50) + 12.000 = 45.234,66 → base 98.765,34
      98.765,34 × 27,5% − 10.904,66 = 27.160,47 − 10.904,66 = 16.255,81 (completa)
      Simplificada: base 126.360 → 23.844,34
      Esperado: imposto R$ 16.255,81/ano (R$ 1.354,65/mês) · melhor: completa
   ============================================================================ */
const CENARIOS_TESTE = [
  { nome: '1) Renda isenta', entrada: { rendaAnual: 36000 }, esperado: { imposto: 0, melhor: 'empate' } },
  { nome: '2) Faixa intermediária', entrada: { rendaAnual: 72000 }, esperado: { imposto: 3387.01, melhor: 'simplificada' } },
  { nome: '3) Renda alta', entrada: { rendaAnual: 180000 }, esperado: { imposto: 33744.34, melhor: 'simplificada' } },
  { nome: '4) Com dependentes', entrada: { rendaAnual: 120000, dependentes: 2 }, esperado: { imposto: 17244.34, melhor: 'simplificada' } },
  {
    nome: '5) Com deduções',
    entrada: { rendaAnual: 144000, dependentes: 2, saude: 18000, educacao: 12000, previdencia: 12000 },
    esperado: { imposto: 16255.81, melhor: 'completa' }
  },
  {
    nome: '6) Restituição',
    entrada: { rendaAnual: 72000, retido: 4800 },
    esperado: { imposto: 3387.01, melhor: 'simplificada', saldo: 1412.99 }
  }
];

function rodarTestes() {
  const resultados = CENARIOS_TESTE.map((c) => {
    const r = simular(c.entrada);
    const ok = Math.abs(r.imposto - c.esperado.imposto) < 0.015 && r.melhor === c.esperado.melhor
      && (c.esperado.saldo === undefined || Math.abs(r.saldo - c.esperado.saldo) < 0.015);
    return { cenario: c.nome, esperado: `${c.esperado.imposto} (${c.esperado.melhor})`, obtido: `${r.imposto} (${r.melhor})`, ok };
  });
  if (typeof console !== 'undefined' && console.table) console.table(resultados);
  return resultados;
}


/* ---------- Exportação e início ---------- */
const CalculaIR = {
  CONFIG, arredondar, paraAnual, indiceDaFaixa, impostoPelaTabela, reducaoDoImposto,
  descontoSimplificado, deducoesCompletas, calcularOpcao, simular, rodarTestes, CENARIOS_TESTE
};

if (typeof module !== 'undefined' && module.exports) module.exports = CalculaIR;

if (typeof document !== 'undefined') {
  window.CalculaIR = CalculaIR;
  iniciar();
}
