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

  /* Salário mínimo 2026: R$ 1.621,00.
     Fonte: Decreto nº 12.797, de 23/12/2025. Conferido em 23/11/2026. */
  salarioMinimo: 1621,

  /* Tabela MENSAL do IRRF (folha de pagamento), a partir de janeiro/2026.
     Fonte: Receita Federal – "Tributação 2026" (Lei 15.191/2025).
     Conferido em 23/11/2026. */
  tabelaMensal: [
    { ate: 2428.80, aliquota: 0,     deduzir: 0 },
    { ate: 2826.65, aliquota: 0.075, deduzir: 182.16 },
    { ate: 3751.05, aliquota: 0.15,  deduzir: 394.16 },
    { ate: 4664.68, aliquota: 0.225, deduzir: 675.49 },
    { ate: Infinity, aliquota: 0.275, deduzir: 908.73 }
  ],

  /* Regras do IRRF mensal: desconto simplificado de R$ 607,20, dependente de
     R$ 189,59/mês e a redução da Lei 15.270/2025 (art. 3º-A da Lei 9.250/1995):
       • rendimento até R$ 5.000 ........ reduz até R$ 312,89 (zera o imposto)
       • R$ 5.000,01 a R$ 7.350 ........ reduz R$ 978,62 − 0,133145 × rendimento
       • acima de R$ 7.350 ............. sem redução
     A redução olha o RENDIMENTO bruto do mês, não a base de cálculo, e nunca
     passa do imposto apurado. Vale também para o 13º salário.
     Fonte: Receita Federal – tabela de redução mensal 2026. Conferido em 23/11/2026. */
  irrfMensal: {
    descontoSimplificado: 607.20,
    dependente: 189.59,
    reducao: {
      limiteIsencao: 5000,
      reducaoMaxima: 312.89,
      constante: 978.62,
      coeficiente: 0.133145,
      limiteFinal: 7350
    }
  },

  /* MEI 2026: DAS mensal fixo = 5% do salário mínimo (INSS, R$ 81,05) +
     R$ 1 de ICMS (comércio/indústria) e/ou R$ 5 de ISS (serviços). O valor
     não muda com o faturamento. Limite de faturamento: R$ 81.000/ano em 2026
     (média de R$ 6.750/mês); sobe para R$ 110.000 em 2027.
     Fonte: LC 123/2006, Portal do Empreendedor e Sebrae. Conferido em 23/11/2026. */
  mei: {
    das: { comercio: 82.05, servicos: 86.05, ambos: 87.05 },
    limiteAnual: 81000,
    limiteAnual2027: 110000
  },

  /* INSS 2026 (empregado CLT), alíquotas progressivas com parcela a deduzir.
     Teto do salário de contribuição: R$ 8.475,55 (contribuição máx. R$ 988,09).
     Fonte: Portaria Interministerial MPS/MF nº 13, de 09/01/2026.
     Conferido em 23/11/2026. */
  inss: {
    teto: 8475.55,
    faixas: [
      { ate: 1621.00,  aliquota: 0.075, deduzir: 0 },
      { ate: 2902.84,  aliquota: 0.09,  deduzir: 24.32 },
      { ate: 4354.27,  aliquota: 0.12,  deduzir: 111.40 },
      { ate: Infinity, aliquota: 0.14,  deduzir: 198.49 }
    ]
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
  // TODO(Gabriel): colar o link de checkout em linkPagamento (ainda vazio de propósito).
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
 * Ponto de equilíbrio: a dedução a partir da qual a declaração completa
 * passa a dar imposto MENOR que a simplificada, para a renda informada.
 * Busca binária sobre calcularOpcao (o imposto só diminui quando a dedução
 * aumenta). Devolve null quando não faz sentido (imposto já zero).
 */
function pontoDeEquilibrio(rendaAnual, cfg = CONFIG) {
  const renda = Math.max(0, Number(rendaAnual) || 0);
  if (renda <= 0) return null;
  const impostoSimplificada = calcularOpcao(renda, descontoSimplificado(renda, cfg), cfg).imposto;
  if (impostoSimplificada <= 0) return null;
  const impostoCompleta = (d) => calcularOpcao(renda, d, cfg).imposto;
  let lo = 0, hi = renda;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (impostoCompleta(mid) < impostoSimplificada - 0.005) hi = mid; else lo = mid;
  }
  return arredondar(hi);
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


/**
 * Contribuição mensal ao INSS de um salário CLT, pela tabela progressiva
 * de 2026 (parcela a deduzir chega ao mesmo resultado da conta faixa a faixa).
 * Acima do teto, a contribuição para de crescer.
 */
function contribuicaoInss(salarioBruto, cfg = CONFIG) {
  const base = Math.min(Math.max(0, Number(salarioBruto) || 0), cfg.inss.teto);
  if (base <= 0) return 0;
  const f = cfg.inss.faixas.find((x) => base <= x.ate) || cfg.inss.faixas[cfg.inss.faixas.length - 1];
  return arredondar(Math.max(0, base * f.aliquota - f.deduzir));
}

/**
 * Descontos mensais de um salário CLT: INSS + IRRF da folha, com a redução
 * da Lei 15.270/2025. A base do imposto usa a MELHOR dedução entre o
 * simplificado (R$ 607,20) e as legais (INSS + dependentes), como faz a
 * fonte pagadora. A redução olha o salário bruto, não a base.
 */
function descontosMensais(salarioBruto, dependentes = 0, cfg = CONFIG) {
  const bruto = Math.max(0, Number(salarioBruto) || 0);
  const dep = Math.min(cfg.limites.maxDependentes, Math.max(0, Math.floor(dependentes || 0)));
  const inss = contribuicaoInss(bruto, cfg);
  const deducao = arredondar(Math.max(inss + dep * cfg.irrfMensal.dependente, cfg.irrfMensal.descontoSimplificado));
  const base = arredondar(Math.max(0, bruto - deducao));

  const f = cfg.tabelaMensal.find((x) => base <= x.ate) || cfg.tabelaMensal[cfg.tabelaMensal.length - 1];
  const impostoTabela = arredondar(Math.max(0, base * f.aliquota - f.deduzir));

  const r = cfg.irrfMensal.reducao;
  let reducaoBruta = 0;
  if (bruto <= r.limiteIsencao) reducaoBruta = r.reducaoMaxima;
  else if (bruto <= r.limiteFinal) reducaoBruta = r.constante - r.coeficiente * bruto;
  const reducao = arredondar(Math.min(Math.max(0, reducaoBruta), impostoTabela));

  const irrf = arredondar(Math.max(0, impostoTabela - reducao));
  return {
    bruto,
    dependentes: dep,
    inss,
    deducao,
    base,                       // valor sobre o qual o imposto do mês é calculado
    impostoTabela,
    reducao,
    irrf,
    liquido: arredondar(bruto - inss - irrf)
  };
}

/**
 * Salário reverso: dado o LÍQUIDO mensal desejado, encontra o BRUTO
 * necessário por busca binária (o líquido só cresce quando o bruto cresce).
 * Devolve null para valor inválido. O bruto é arredondado para cima, para o
 * líquido nunca ficar abaixo do pedido.
 */
function brutoParaLiquido(liquidoDesejado, dependentes = 0, cfg = CONFIG) {
  const alvo = Math.max(0, Number(liquidoDesejado) || 0);
  if (alvo <= 0) return null;
  let lo = alvo;
  let hi = Math.max(alvo * 3, cfg.salarioMinimo * 2);
  let guarda = 0;
  while (descontosMensais(hi, dependentes, cfg).liquido < alvo && guarda++ < 30) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (descontosMensais(mid, dependentes, cfg).liquido < alvo) lo = mid; else hi = mid;
  }
  const bruto = Math.ceil(hi * 100) / 100;
  return { alvo, bruto, descontos: descontosMensais(bruto, dependentes, cfg) };
}


/**
 * 13º salário: tributação EXCLUSIVA na fonte. O INSS incide sobre o 13º
 * separado do salário do mês, e a base do imposto é o 13º bruto menos INSS
 * e dependentes (sem desconto simplificado). A redução da Lei 15.270/2025
 * também vale para o 13º (art. 3º-A, §3º, da Lei 9.250/1995), olhando o
 * valor bruto do 13º. Devolve também as duas parcelas: a 1ª (paga até
 * 30/11) é metade do bruto, sem descontos; os descontos caem todos na 2ª.
 */
function decimoTerceiro(salarioBruto, dependentes = 0, cfg = CONFIG) {
  const bruto = Math.max(0, Number(salarioBruto) || 0);
  const dep = Math.min(cfg.limites.maxDependentes, Math.max(0, Math.floor(dependentes || 0)));
  const inss = contribuicaoInss(bruto, cfg);
  const base = arredondar(Math.max(0, bruto - inss - dep * cfg.irrfMensal.dependente));

  const f = cfg.tabelaMensal.find((x) => base <= x.ate) || cfg.tabelaMensal[cfg.tabelaMensal.length - 1];
  const impostoTabela = arredondar(Math.max(0, base * f.aliquota - f.deduzir));

  const r = cfg.irrfMensal.reducao;
  let reducaoBruta = 0;
  if (bruto <= r.limiteIsencao) reducaoBruta = r.reducaoMaxima;
  else if (bruto <= r.limiteFinal) reducaoBruta = r.constante - r.coeficiente * bruto;
  const reducao = arredondar(Math.min(Math.max(0, reducaoBruta), impostoTabela));

  const irrf = arredondar(Math.max(0, impostoTabela - reducao));
  const liquido = arredondar(bruto - inss - irrf);
  const primeiraParcela = arredondar(bruto / 2);
  return {
    bruto,
    inss,
    base,
    impostoTabela,
    reducao,
    irrf,
    liquido,
    primeiraParcela,
    segundaParcela: arredondar(liquido - primeiraParcela)
  };
}

/**
 * Férias: no mês das férias entra o salário + 1/3 constitucional, tudo
 * tributado junto (INSS e IRRF caem sobre o total). Compara o mês de férias
 * com um mês normal e devolve quanto os descontos aumentam e quanto a mais
 * cai na conta. (A escolha de 30, 20 ou 10 dias muda a composição, mas o
 * total do mês é sempre salário + 1/3 sobre o período gozado; aqui usamos
 * o gozo integral, que é o caso mais comum.)
 */
function calcularFerias(salarioBruto, dependentes = 0, cfg = CONFIG) {
  const salario = Math.max(0, Number(salarioBruto) || 0);
  const terco = arredondar(salario / 3);
  const mesNormal = descontosMensais(salario, dependentes, cfg);
  const mesFerias = descontosMensais(salario + terco, dependentes, cfg);
  const descontoExtra = arredondar((mesFerias.inss + mesFerias.irrf) - (mesNormal.inss + mesNormal.irrf));
  return {
    salario,
    terco,
    bruto: mesFerias.bruto,                    // salário + 1/3
    inss: mesFerias.inss,
    irrf: mesFerias.irrf,
    reducao: mesFerias.reducao,
    impostoTabela: mesFerias.impostoTabela,
    liquido: mesFerias.liquido,
    liquidoMesNormal: mesNormal.liquido,
    descontoExtra,
    aMaisQueMesNormal: arredondar(mesFerias.liquido - mesNormal.liquido)
  };
}


/**
 * CLT x PJ: soma tudo o que a CLT entrega no ano — 11 meses normais, 1 mês
 * de férias (salário + 1/3), 13º líquido e o FGTS (8% sobre salários, 13º e
 * o terço de férias; é dinheiro da pessoa, só que guardado) — e devolve o
 * "pacote mensal". O faturamento PJ necessário é o pacote dividido por
 * (1 − alíquota do Simples), porque o PJ só desconta o imposto sobre o
 * faturamento. Arredondado para cima para nunca ficar abaixo do pacote.
 */
function cltVersusPJ(salarioBruto, dependentes = 0, aliquotaPJ = 0.06, cfg = CONFIG) {
  const salario = Math.max(0, Number(salarioBruto) || 0);
  if (salario <= 0) return null;
  const aliquota = Math.min(0.9, Math.max(0, Number(aliquotaPJ) || 0));
  const mes = descontosMensais(salario, dependentes, cfg);
  const ferias = calcularFerias(salario, dependentes, cfg);
  const d13 = decimoTerceiro(salario, dependentes, cfg);

  const liquidoAnual = arredondar(11 * mes.liquido + ferias.liquido + d13.liquido);
  const fgtsAnual = arredondar(0.08 * (12 * salario + d13.bruto + ferias.terco));
  const pacoteAnual = arredondar(liquidoAnual + fgtsAnual);
  const pacoteMensal = arredondar(pacoteAnual / 12);
  const faturamentoPJ = Math.ceil((pacoteMensal / (1 - aliquota)) * 100) / 100;

  return { salario, aliquotaPJ: aliquota, liquidoAnual, fgtsAnual, pacoteAnual, pacoteMensal, faturamentoPJ };
}


/**
 * MEI: quanto sobra do faturamento depois do DAS. O DAS é fixo (não muda
 * com o faturamento) e o limite de 2026 é R$ 81.000/ano (R$ 6.750/mês de
 * média). Devolve também a projeção anual e o excesso, se houver.
 */
function simularMei(faturamentoMensal, atividade = 'servicos', cfg = CONFIG) {
  const faturamento = Math.max(0, Number(faturamentoMensal) || 0);
  const das = cfg.mei.das[atividade] || cfg.mei.das.servicos;
  const anual = arredondar(faturamento * 12);
  const excedeu = anual > cfg.mei.limiteAnual;
  return {
    faturamento,
    atividade,
    das,
    sobra: arredondar(faturamento - das),
    percentualDas: faturamento > 0 ? das / faturamento : 0,
    anual,
    limiteAnual: cfg.mei.limiteAnual,
    limiteAnual2027: cfg.mei.limiteAnual2027,
    mediaMensalPermitida: arredondar(cfg.mei.limiteAnual / 12),
    excedeu,
    excesso: excedeu ? arredondar(anual - cfg.mei.limiteAnual) : 0
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
  $$('[data-tela]').forEach((s) => { s.hidden = true; });
  $('.progresso').hidden = false;

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
  // A estimativa do imposto é grátis; só o detalhe (comparativo, restituição) é pago.
  if (!(estado.renda > 0)) return '';
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
  // GRÁTIS: imposto estimado, gráfico, alíquotas e botões de compartilhar.
  // PAGO: detalhe (comparativo simplificada x completa, ponto de equilíbrio,
  // restituição). Sem o plano, essa parte é montada com um EXEMPLO fictício
  // (nunca com os números da pessoa) e fica embaçada. Assim os valores reais
  // do detalhe não ficam no código da página.
  const bloqueado = !estado.assinante;
  const r = calcularDoEstado();
  const rd = bloqueado
    ? simular({ rendaAnual: 84000, dependentes: 1, saude: 6000 })
    : r;
  const mensal = estado.visao === 'mensal';
  const divisor = mensal ? 12 : 1;
  const unidade = mensal ? 'por mês' : 'por ano';
  const imposto = r.imposto / divisor;
  const sobra = r.sobra / divisor;
  

  const abreTitulo = '<h1 id="t3" class="headline" tabindex="-1">';
  const fechaTitulo = '</h1>';
  const titulo = r.imposto <= 0
    ? `${abreTitulo}Boa notícia: <span class="valor-destaque verde">você não pagará imposto</span>${fechaTitulo}
       <p class="headline-sub">Com os dados informados, o imposto estimado para ${CONFIG.anoCalendario} é <strong>R$ 0,00</strong>.</p>`
    : `${abreTitulo}Você pagará <span class="valor-destaque">${moeda(imposto)}</span> de imposto ${unidade}${fechaTitulo}
       <p class="headline-sub">Estimativa para o ano-calendário ${CONFIG.anoCalendario}, calculada no acerto anual (declaração de ${CONFIG.exercicio}).</p>`;

  // Comparativo simplificada x completa
  const divisorD = bloqueado ? 12 : divisor;
  const unidadeD = bloqueado ? 'por mês' : unidade;
  const semDespesas = rd.deducoes.total === 0;
  const textoSimp = `Desconto automático de 20% da renda (no máximo ${moeda(CONFIG.simplificado.tetoAnual / divisorD)} ${unidadeD}), sem precisar comprovar nada: <strong>${moeda(rd.simplificada.deducao / divisorD)}</strong>`;
  const textoComp = semDespesas
    ? 'Você não informou despesas, então não há o que abater.'
    : `Soma das suas despesas que abatem imposto: <strong>${moeda(rd.completa.deducao / divisorD)}</strong>`;
  const extraComp = rd.deducoes.educacaoExcedente > 0
    ? '<p class="opcao-detalhe">Seus gastos com educação passaram do limite, então usamos o valor máximo permitido.</p>'
    : '';

  const nomeMelhor = rd.melhor === 'completa' ? 'declaração completa' : 'declaração simplificada';
  let linhaEconomia = '<p class="economia">As duas opções dão o mesmo valor de imposto.</p>';
  if (rd.melhor !== 'empate') {
    linhaEconomia = `<p class="economia">Escolhendo a ${nomeMelhor}, você paga <strong>${moeda(rd.economia / divisorD)}</strong> a menos ${unidadeD}.</p>`;
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

  // Ponto de equilíbrio: quando a pessoa ainda está melhor na simplificada,
  // mostra a partir de quanto de dedução a completa passaria a compensar.
  let linhaEquilibrio = '';
  if (!bloqueado && rd.melhor !== 'completa') {
    const pe = pontoDeEquilibrio(r.rendaAnual);
    if (pe !== null && pe > r.completa.deducao) {
      linhaEquilibrio = `<p class="dica">Vale guardar recibo? Se os seus gastos que abatem imposto passarem de <strong>${moeda(pe / divisor)}</strong> ${unidade}, a declaração completa passa a dar imposto menor que a simplificada. Saúde entra sem limite; educação tem teto por pessoa.</p>`;
    }
  }

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

  // Bloqueado: se a pessoa informou o IRRF, mostra só um bloco-exemplo embaçado.
  if (bloqueado && r.retido > 0) {
    blocoRestituicao = `
    <section class="bloco bloco-restituicao" aria-labelledby="h-rest">
      <h2 class="bloco-titulo" id="h-rest">Restituição ou imposto a pagar</h2>
      <p class="restituicao-linha">Você deve <strong class="verde-texto">receber de volta cerca de R$ 1.234,56</strong> por ano</p>
      <p class="dica">Já descontaram R$ 5.678,90 do seu salário. A diferença volta para você na restituição.</p>
    </section>`;
  }

  const fieldsetVisao = `
    <fieldset class="periodo visao">
      <legend class="sr-only">Mostrar valores por</legend>
      <label class="segmento"><input type="radio" name="visao" value="mensal"${mensal ? ' checked' : ''}><span>Por mês</span></label>
      <label class="segmento"><input type="radio" name="visao" value="anual"${mensal ? '' : ' checked'}><span>Por ano</span></label>
    </fieldset>`;

  const preco = moeda(CONFIG.plano.precoMensal);
  const cartaoDesbloqueio = `
    <div class="trava-card" role="region" aria-labelledby="t3-trava">
      <svg class="icone trava-icone" aria-hidden="true"><use href="#i-lock"/></svg>
      <h2 id="t3-trava" class="trava-titulo">Quer o detalhe?</h2>
      <p>Veja qual declaração compensa mais (simplificada ou completa), a partir de quanto de recibo vale a completa e quanto você recebe de restituição.</p>
      <p class="trava-preco"><strong>${preco}</strong> por mês</p>
      <button type="button" class="btn btn-primario" id="btn-desbloquear">Desbloquear por ${preco}/mês</button>
    </div>`;

  $('#resultado').innerHTML = `
    ${titulo}
    ${fieldsetVisao}

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

    <div class="trava">
    <div class="resultado-conteudo${bloqueado ? ' bloqueado' : ''}"${bloqueado ? ' aria-hidden="true" inert' : ''}>
    ${blocoRestituicao}

    <section class="bloco" aria-labelledby="h-comp">
      <h2 class="bloco-titulo" id="h-comp">Declaração simplificada ou completa?</h2>
      <div class="comparativo">
        ${htmlOpcao('simplificada', 'Declaração simplificada', rd.simplificada, rd, divisorD, textoSimp)}
        ${htmlOpcao('completa', 'Declaração completa', rd.completa, rd, divisorD, textoComp, extraComp)}
      </div>
      ${linhaEconomia}
      ${linhaEquilibrio}
    </section>
    </div>
    ${bloqueado ? cartaoDesbloqueio : ''}
    </div>

    <div class="resultado-acoes">
      <button type="button" class="btn btn-zap" id="btn-zap">
        <svg class="icone" aria-hidden="true"><use href="#i-whatsapp"/></svg>Mandar no WhatsApp
      </button>
      <button type="button" class="btn btn-primario" id="btn-compartilhar">
        <svg class="icone" aria-hidden="true"><use href="#i-share"/></svg>Compartilhar resultado
      </button>
      <button type="button" class="btn btn-secundario" id="btn-imagem">
        <svg class="icone" aria-hidden="true"><use href="#i-image"/></svg>Baixar imagem pra stories
      </button>
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
  const btnZap = $('#btn-zap');
  if (btnZap) btnZap.addEventListener('click', () => compartilharWhatsApp(r));
  const btnCompartilhar = $('#btn-compartilhar');
  if (btnCompartilhar) btnCompartilhar.addEventListener('click', () => compartilhar(r));
  const btnImagem = $('#btn-imagem');
  if (btnImagem) btnImagem.addEventListener('click', () => baixarImagem(r));
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

/** Gera uma imagem PNG (formato stories, 1080x1920) com o resultado, para
    a pessoa postar onde quiser. Tudo desenhado em canvas, sem enviar nada. */
function gerarImagemResultado(r) {
  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Fundo azul-escuro com leve degradê
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1b2f7a');
  grad.addColorStop(1, '#14235f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const centroX = W / 2;
  const txt = (texto, y, tamanho, cor, peso = 400) => {
    ctx.fillStyle = cor;
    ctx.font = `${peso} ${tamanho}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(texto, centroX, y);
  };
  const dinheiro = (v) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Marca
  txt('CALCULA IR', 150, 44, '#9db4ff', 800);

  // Manchete
  if (r.imposto <= 0) {
    txt('Não vou pagar', 340, 96, '#ffffff', 800);
    txt('imposto de renda', 450, 96, '#ffffff', 800);
  } else {
    txt(dinheiro(r.imposto / 12), 380, 130, '#ffffff', 800);
    txt('de imposto de renda por mês', 470, 52, '#c9d6ff', 400);
  }

  // Rosca: imposto x o que fica com a pessoa
  const cx = centroX, cy = 780, raio = 210, grosso = 64;
  const pct = r.rendaAnual > 0 ? r.imposto / r.rendaAnual : 0;
  ctx.lineWidth = grosso;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#17a05a';
  ctx.beginPath(); ctx.arc(cx, cy, raio, 0, 2 * Math.PI); ctx.stroke();
  if (pct > 0) {
    ctx.strokeStyle = '#e0474f';
    ctx.beginPath(); ctx.arc(cx, cy, raio, -Math.PI / 2, -Math.PI / 2 + pct * 2 * Math.PI); ctx.stroke();
  }
  txt((pct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%', cy + 6, 92, '#ffffff', 800);
  txt('vai para o imposto', cy + 62, 38, '#c9d6ff');

  // Fatos principais
  let y = 1180;
  const linha = (rotulo, valor, corValor = '#ffffff') => {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9db4ff'; ctx.font = "400 40px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText(rotulo, 120, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = corValor; ctx.font = "800 46px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText(valor, W - 120, y);
    y += 88;
  };
  linha('Fica comigo', dinheiro(r.sobra / 12) + '/mês', '#5be3a1');
  if (r.retido > 0 && r.saldo > 0.005) linha('Restituição', dinheiro(r.saldo) + '/ano', '#5be3a1');
  if (r.retido > 0 && r.saldo < -0.005) linha('Ainda vou pagar', dinheiro(-r.saldo) + '/ano', '#ff9aa0');
  if (r.melhor !== 'empate') {
    linha('Melhor declaração', r.melhor === 'completa' ? 'Completa' : 'Simplificada', '#f5b82e');
  }

  // Rodapé com o endereço do site (encolhe a fonte se for comprido)
  let endereco = (window.location.host + window.location.pathname).replace(/^www\./, '').replace(/\/$/, '');
  if (endereco.length > 34) endereco = window.location.host.replace(/^www\./, '');
  txt('Simule o seu em menos de 1 minuto:', H - 160, 38, '#c9d6ff');
  txt(endereco, H - 100, endereco.length > 26 ? 34 : 46, '#ffffff', 800);

  return canvas;
}

/** Baixa a imagem do resultado como PNG. */
function baixarImagem(r) {
  const canvas = gerarImagemResultado(r);
  canvas.toBlob((blob) => {
    if (!blob) { avisoRapido('Não consegui gerar a imagem. Tente de novo.'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meu-imposto-de-renda.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    avisoRapido('Imagem baixada! É só postar nos stories.');
  }, 'image/png');
}

/** Texto de compartilhamento: só o resultado, sem a renda informada. */
function textoCompartilhamento(r) {
  const textoImposto = r.imposto <= 0
    ? 'não vou pagar imposto de renda'
    : `vou pagar cerca de ${moeda(r.imposto / 12)} de imposto por mês (${percentual(r.aliquotaEfetiva)} do que ganho)`;
  return `Simulei meu Imposto de Renda no Calcula IR: ${textoImposto}. Simule o seu em menos de 1 minuto:`;
}

/** Monta o link wa.me com o texto codificado (funciona no celular e no PC). */
function urlWhatsApp(texto) {
  return 'https://wa.me/?text=' + encodeURIComponent(texto);
}

/** Abre o WhatsApp já com o resultado pronto para enviar. */
function compartilharWhatsApp(r) {
  const url = window.location.href.split('#')[0];
  window.open(urlWhatsApp(`${textoCompartilhamento(r)} ${url}`), '_blank', 'noopener,noreferrer');
}

async function compartilhar(r) {
  const texto = textoCompartilhamento(r);
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

/* ---------- Ferramentas (outras calculadoras) ---------- */

/** Mostra a tela de uma ferramenta e esconde o passo a passo principal. */
function mostrarFerramenta(id) {
  [1, 2, 3].forEach((i) => { $('#passo-' + i).hidden = true; });
  $$('[data-tela]').forEach((s) => { s.hidden = s.dataset.tela !== id; });
  $('.progresso').hidden = true;
  window.scrollTo({ top: 0, behavior: prefereMenosMovimento() ? 'auto' : 'smooth' });
  const titulo = $('#tela-' + id + ' h1');
  if (titulo) titulo.focus({ preventScroll: true });
}

/** Contador (+/−) genérico usado pelas ferramentas. */
function ligarContador(input, aoMudar, { max = 99 } = {}) {
  const definir = (n) => {
    const valor = Math.min(max, Math.max(0, n));
    input.value = String(valor);
    aoMudar(valor);
  };
  input.addEventListener('input', () => {
    const digitos = input.value.replace(/\D/g, '').slice(0, 2);
    definir(digitos ? parseInt(digitos, 10) : 0);
  });
  $$('button', input.closest('.contador')).forEach((b) => {
    b.addEventListener('click', () => definir((parseInt(input.value, 10) || 0) + Number(b.dataset.passo)));
  });
}

function iniciarFerramentas() {
  $$('[data-ferramenta]').forEach((botao) => {
    botao.addEventListener('click', () => mostrarFerramenta(botao.dataset.ferramenta));
  });
  $$('[data-voltar]').forEach((botao) => {
    botao.addEventListener('click', () => irParaPasso(1));
  });
  iniciarReverso();
  iniciarDecimoFerias();
  iniciarCltPJ();
  iniciarMei();
}

/* ---------- Ferramenta: MEI ---------- */
function renderizarMei(r) {
  const nomeAtividade = { comercio: 'comércio/indústria', servicos: 'serviços', ambos: 'comércio e serviços' }[r.atividade];
  const avisoLimite = r.excedeu
    ? `<div class="aviso" role="note"><svg class="icone" aria-hidden="true"><use href="#i-info"/></svg>
         <p style="margin:0">Atenção: ${moeda(r.faturamento)} por mês dá ${moeda(r.anual)} por ano, <strong>${moeda(r.excesso)} acima do limite do MEI</strong> (${moeda(r.limiteAnual)} em 2026). Passar do limite obriga o desenquadramento para microempresa — vale falar com um contador antes.</p></div>`
    : '';
  $('#mei-saida').innerHTML = `
    <section class="bloco" aria-labelledby="h-mei">
      <h2 class="bloco-titulo" id="h-mei">Do seu faturamento sobram</h2>
      <p class="headline"><span class="valor-destaque verde">${moeda(r.sobra)}</span> por mês depois do DAS</p>
      <div class="explica">
        ${linhaExplica('Faturamento', moeda(r.faturamento), 'Tudo o que entra no mês com a sua atividade de MEI.')}
        ${linhaExplica('DAS (' + nomeAtividade + ')', '− ' + moeda(r.das), 'Boleto fixo do MEI: INSS de R$ 81,05 mais os impostos da atividade. Não muda com o faturamento e vence todo dia 20.')}
        ${linhaExplica('Peso do DAS', percentual(r.percentualDas), 'Quanto do seu faturamento vai para o boleto. Quanto mais você fatura, mais leve fica.')}
        ${linhaExplica('Projeção no ano', moeda(r.anual), `O limite do MEI em 2026 é ${moeda(r.limiteAnual)} (média de ${moeda(r.mediaMensalPermitida)} por mês). Em 2027 sobe para ${moeda(r.limiteAnual2027)}.`)}
      </div>
      ${avisoLimite}
      <p class="dica">O DAS já inclui o INSS, que garante aposentadoria por idade, auxílio-doença e salário-maternidade. Esta conta não inclui outros custos do negócio (material, internet, contador).</p>
    </section>`;
}

function iniciarMei() {
  const input = $('#mei-faturamento');
  const erro = $('#mei-erro');
  let faturamento = 0;
  ligarMascaraMoeda(input, (valor) => {
    faturamento = valor;
    if (valor > 0) { erro.textContent = ''; erro.hidden = true; }
  });
  $('#form-mei').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!(faturamento > 0)) {
      erro.textContent = 'Digite o faturamento do mês para calcular.';
      erro.hidden = false;
      input.focus();
      return;
    }
    const atividade = (($('input[name="mei-atividade"]:checked') || {}).value) || 'servicos';
    renderizarMei(simularMei(faturamento, atividade));
  });
}

/* ---------- Ferramenta: CLT x PJ ---------- */
function renderizarCltPJ(r) {
  const aliquotaTxt = (r.aliquotaPJ * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const liquidoMedio = r.pacoteAnual - r.fgtsAnual;
  $('#pj-saida').innerHTML = `
    <section class="bloco" aria-labelledby="h-pj">
      <h2 class="bloco-titulo" id="h-pj">Para empatar com a sua CLT</h2>
      <p class="headline">O PJ precisa faturar <span class="valor-destaque">${moeda(r.faturamentoPJ)}</span> por mês</p>
      <div class="explica">
        ${linhaExplica('Líquido CLT no ano', moeda(liquidoMedio), '11 salários normais + mês de férias + 13º, já sem INSS e imposto. Por mês, dá ' + moeda(arredondar(liquidoMedio / 12)) + '.')}
        ${linhaExplica('FGTS no ano', '+ ' + moeda(r.fgtsAnual), 'A empresa deposita 8% sobre salários, 13º e férias. Não cai no contracheque, mas é dinheiro seu (demissão sem justa causa, casa própria, aposentadoria).')}
        ${linhaExplica('Pacote CLT por mês', moeda(r.pacoteMensal), 'A média mensal de tudo o que a CLT te dá: líquido + FGTS.')}
        ${linhaExplica('Faturamento PJ', moeda(r.faturamentoPJ), `Com ${aliquotaTxt} de imposto, sobram ${moeda(r.pacoteMensal)} líquidos — o mesmo pacote da CLT.`)}
      </div>
      <p class="dica">Acima desse valor, o PJ passa a render mais que a CLT. A conta não inclui benefícios (vale-refeição, plano de saúde) nem custo de contador, e o PJ não tem 13º, férias pagas, FGTS nem seguro-desemprego — o preço da estabilidade é seu.</p>
    </section>`;
}

function iniciarCltPJ() {
  const input = $('#pj-salario');
  const erro = $('#pj-erro');
  let salario = 0;
  let dependentes = 0;
  ligarMascaraMoeda(input, (valor) => {
    salario = valor;
    if (valor > 0) { erro.textContent = ''; erro.hidden = true; }
  });
  ligarContador($('#pj-dependentes'), (n) => { dependentes = n; }, { max: CONFIG.limites.maxDependentes });
  $('#form-cltpj').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!(salario > 0)) {
      erro.textContent = 'Digite o salário bruto da CLT para comparar.';
      erro.hidden = false;
      input.focus();
      return;
    }
    const aliquota = Number(($('input[name="pj-aliquota"]:checked') || {}).value || 0.06);
    renderizarCltPJ(cltVersusPJ(salario, dependentes, aliquota));
  });
}

/* ---------- Ferramenta: 13º salário e férias ---------- */
function linhaExplica(nome, valor, texto) {
  return `
    <div class="explica-item">
      <span class="explica-nome">${nome}</span>
      <span class="explica-valor">${valor}</span>
      <p>${texto}</p>
    </div>`;
}

function renderizarDecimoFerias(salario, dependentes) {
  const d13 = decimoTerceiro(salario, dependentes);
  const fer = calcularFerias(salario, dependentes);

  const textoIrrf13 = d13.irrf > 0
    ? `− ${moeda(d13.irrf)}`
    : 'R$ 0,00';
  const detalheIrrf13 = d13.irrf > 0
    ? (d13.reducao > 0
      ? `A tabela daria ${moeda(d13.impostoTabela)}, mas a lei nova de 2025 abate ${moeda(d13.reducao)}.`
      : 'Imposto exclusivo na fonte: não entra na declaração do ano.')
    : (d13.impostoTabela > 0
      ? `A tabela daria ${moeda(d13.impostoTabela)}, mas a lei nova de 2025 zera o imposto do 13º até R$ 5.000.`
      : 'Com esse valor, o 13º fica na faixa em que a tabela não cobra imposto.');

  $('#df-saida').innerHTML = `
    <section class="bloco" aria-labelledby="h-d13">
      <h2 class="bloco-titulo" id="h-d13">Seu 13º salário</h2>
      <p class="headline">Cai na conta <span class="valor-destaque verde">${moeda(d13.liquido)}</span> de 13º líquido</p>
      <div class="explica">
        ${linhaExplica('13º bruto', moeda(d13.bruto), 'Igual a um salário inteiro, para quem trabalhou o ano todo na empresa.')}
        ${linhaExplica('INSS', '− ' + moeda(d13.inss), 'Descontado do 13º separado do salário do mês, pela tabela de 2026.')}
        ${linhaExplica('Imposto de renda', textoIrrf13, detalheIrrf13)}
      </div>
      <div class="explica">
        ${linhaExplica('1ª parcela (até 30/11)', moeda(d13.primeiraParcela), 'Metade do valor bruto, sem nenhum desconto.')}
        ${linhaExplica('2ª parcela (até 20/12)', moeda(d13.segundaParcela), 'O restante, já com INSS e imposto descontados.')}
      </div>
    </section>

    <section class="bloco" aria-labelledby="h-ferias">
      <h2 class="bloco-titulo" id="h-ferias">Seu mês de férias</h2>
      <p class="headline">Entra <span class="valor-destaque verde">${moeda(fer.aMaisQueMesNormal)}</span> a mais que um mês normal</p>
      <div class="explica">
        ${linhaExplica('Total do mês', moeda(fer.bruto), 'Salário + 1/3 constitucional de férias, pagos até 2 dias antes do início.')}
        ${linhaExplica('INSS', '− ' + moeda(fer.inss), 'Incide sobre o total do mês (salário + 1/3).')}
        ${linhaExplica('Imposto de renda', fer.irrf > 0 ? '− ' + moeda(fer.irrf) : 'R$ 0,00', fer.reducao > 0
          ? `A tabela daria ${moeda(fer.impostoTabela)}, mas a lei nova de 2025 abate ${moeda(fer.reducao)}.`
          : 'Calculado sobre o total do mês, pela tabela de 2026.')}
        ${linhaExplica('Líquido do mês', moeda(fer.liquido), `Um mês normal fecha com ${moeda(fer.liquidoMesNormal)}; nas férias os descontos sobem ${moeda(fer.descontoExtra)}.`)}
      </div>
      <p class="dica">Conta com o gozo integral das férias. Vender 1/3 (abono pecuniário) muda os valores: o abono e o terço sobre ele não têm descontos.</p>
    </section>`;
}

function iniciarDecimoFerias() {
  const input = $('#df-salario');
  const erro = $('#df-erro');
  let salario = 0;
  let dependentes = 0;
  ligarMascaraMoeda(input, (valor) => {
    salario = valor;
    if (valor > 0) { erro.textContent = ''; erro.hidden = true; }
  });
  ligarContador($('#df-dependentes'), (n) => { dependentes = n; }, { max: CONFIG.limites.maxDependentes });
  $('#form-decimo').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!(salario > 0)) {
      erro.textContent = 'Digite seu salário bruto para calcular.';
      erro.hidden = false;
      input.focus();
      return;
    }
    renderizarDecimoFerias(salario, dependentes);
  });
}

/* ---------- Ferramenta: salário reverso ---------- */
function renderizarReverso(resultado) {
  const d = resultado.descontos;
  const linha = (nome, valor, texto) => `
    <div class="explica-item">
      <span class="explica-nome">${nome}</span>
      <span class="explica-valor">${valor}</span>
      <p>${texto}</p>
    </div>`;
  $('#rev-saida').innerHTML = `
    <section class="bloco" aria-labelledby="h-rev-resultado">
      <h2 class="bloco-titulo" id="h-rev-resultado">Seu salário bruto precisa ser</h2>
      <p class="headline"><span class="valor-destaque">${moeda(resultado.bruto)}</span> por mês</p>
      <div class="explica">
        ${linha('Salário bruto', moeda(d.bruto), 'É o valor que aparece no contracheque antes de qualquer desconto.')}
        ${linha('INSS', '− ' + moeda(d.inss), 'Contribuição previdenciária pela tabela progressiva de 2026.')}
        ${linha('Imposto de renda', d.irrf > 0 ? '− ' + moeda(d.irrf) : 'R$ 0,00', d.reducao > 0
          ? `A tabela daria ${moeda(d.impostoTabela)}, mas a lei nova de 2025 abate ${moeda(d.reducao)}.`
          : 'Retido na fonte pela tabela mensal de 2026.')}
        ${linha('Líquido', moeda(d.liquido), 'O que cai na sua conta todo mês, sem contar outros descontos.')}
      </div>
      <p class="dica">Estimativa para salário CLT em 2026, sem dependentes${resultado.descontos.dependentes > 0 ? ' além dos ' + resultado.descontos.dependentes + ' informados' : ''}. Não entram outros descontos do contracheque, como vale-transporte e plano de saúde.</p>
    </section>`;
}

function iniciarReverso() {
  const input = $('#rev-liquido');
  const erro = $('#rev-erro');
  let liquido = 0;
  let dependentes = 0;
  ligarMascaraMoeda(input, (valor) => {
    liquido = valor;
    if (valor > 0) { erro.textContent = ''; erro.hidden = true; }
  });
  ligarContador($('#rev-dependentes'), (n) => { dependentes = n; }, { max: CONFIG.limites.maxDependentes });
  $('#form-reverso').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!(liquido > 0)) {
      erro.textContent = 'Digite quanto você quer receber de líquido por mês.';
      erro.hidden = false;
      input.focus();
      return;
    }
    renderizarReverso(brutoParaLiquido(liquido, dependentes));
  });
}

function iniciar() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline fica para a próxima */ });
    });
  }
  if (CONFIG.plano.permitirDemo) {
    estado.assinante = new URLSearchParams(window.location.search).get('demo') === '1';
  }
  iniciarPasso1();
  iniciarPasso2();
  iniciarFerramentas();
  atualizarTextosDoPeriodo();
  irParaPasso(1, { foco: false });
  window.scrollTo(0, 0);
}


/* ============================================================================
   4) TESTES – 7 cenários com resultado esperado
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

function rodarTesteEquilibrio() {
  // Com R$ 72.000/ano a simplificada abate R$ 14.400 (20%). A completa passa
  // a vencer logo acima desse valor (base cai na faixa de 27,5%).
  const pe = pontoDeEquilibrio(72000);
  return { cenario: '7) Ponto de equilíbrio', esperado: '~14400', obtido: String(pe), ok: pe !== null && Math.abs(pe - 14400) < 1 };
}

/* Cenários das funções MENSAIS (INSS, IRRF da folha e salário reverso).
   Valores esperados calculados à mão com as tabelas oficiais de 2026:
   8) INSS de R$ 3.000 → 3.000 × 12% − 111,40 = 248,60
   9) INSS no teto (R$ 10.000) → 8.475,55 × 14% − 198,49 = 988,09
  10) Salário de R$ 5.000 → IRRF zero (a redução de até 312,89 cobre os 312,89
      da tabela) e líquido de 5.000 − 501,51 = 4.498,49
  11) Salário de R$ 6.000 → INSS 641,51; base 5.358,49; imposto 564,85;
      redução 978,62 − 0,133145 × 6.000 = 179,75; IRRF 385,10;
      líquido 4.973,39
  12) Reverso: para tirar R$ 5.000 líquidos, o bruto fica entre R$ 6.000 e
      R$ 6.100 e o líquido final não fica abaixo do pedido */
const CENARIOS_MENSAIS = [
  { nome: '8) INSS de R$ 3.000', obtido: () => contribuicaoInss(3000), esperado: 248.60 },
  { nome: '9) INSS no teto', obtido: () => contribuicaoInss(10000), esperado: 988.09 },
  { nome: '10) IRRF zero em R$ 5.000', obtido: () => descontosMensais(5000).irrf, esperado: 0 },
  { nome: '11) Líquido de R$ 6.000', obtido: () => descontosMensais(6000).liquido, esperado: 4973.39 },
  /* 13º de R$ 4.500: INSS 431,51; base 4.068,49; tabela 239,92, zerada pela
     redução (13º ≤ 5.000). Líquido = 4.068,49. */
  { nome: '12) 13º de R$ 4.500 sem IRRF', obtido: () => decimoTerceiro(4500).liquido, esperado: 4068.49 },
  /* 13º de R$ 8.000: INSS 921,51; base 7.078,49; imposto 1.037,85, sem
     redução (acima de 7.350). Líquido = 8.000 − 921,51 − 1.037,85 = 6.040,64. */
  { nome: '13) 13º de R$ 8.000', obtido: () => decimoTerceiro(8000).liquido, esperado: 6040.64 },
  /* Férias de R$ 4.500: mês fecha com salário + 1/3 = 6.000 (líquido
     4.973,39) e os descontos sobem 595,10 em relação ao mês normal. */
  { nome: '14) Férias de R$ 4.500', obtido: () => calcularFerias(4500).liquido, esperado: 4973.39 },
  { nome: '15) Desconto extra das férias', obtido: () => calcularFerias(4500).descontoExtra, esperado: 595.10 },
  /* CLT de R$ 6.000: ano = 11 × 4.973,39 + férias (8.000 brutos → 6.040,64)
     + 13º (4.973,39) = 65.721,32; FGTS = 8% × 80.000 = 6.400;
     pacote mensal = 6.010,11; PJ a 6% → 6.010,11 ÷ 0,94 = 6.393,74. */
  { nome: '16) Ano CLT de R$ 6.000', obtido: () => cltVersusPJ(6000).liquidoAnual, esperado: 65721.32 },
  { nome: '17) FGTS de R$ 6.000', obtido: () => cltVersusPJ(6000).fgtsAnual, esperado: 6400 },
  { nome: '18) PJ para empatar R$ 6.000 CLT', obtido: () => cltVersusPJ(6000).faturamentoPJ, esperado: 6393.74 },
  /* MEI: DAS de serviços R$ 86,05; faturando R$ 4.000 sobram R$ 3.913,95.
     Faturando R$ 7.000 o ano dá R$ 84.000, R$ 3.000 acima do limite. */
  { nome: '19) MEI serviços com R$ 4.000', obtido: () => simularMei(4000, 'servicos').sobra, esperado: 3913.95 },
  { nome: '20) MEI acima do limite', obtido: () => simularMei(7000, 'comercio').excesso, esperado: 3000 }
];

function rodarTesteWhatsApp() {
  // O link wa.me precisa codificar o texto (acentos, espaços e o "R$").
  const url = urlWhatsApp('Simulei meu IR: R$ 100,00 & você?');
  const esperado = 'https://wa.me/?text=' + encodeURIComponent('Simulei meu IR: R$ 100,00 & você?');
  return { cenario: '21) Link do WhatsApp', esperado, obtido: url, ok: url === esperado };
}

function rodarTestesMensais() {
  const resultados = CENARIOS_MENSAIS.map((c) => {
    const obtido = c.obtido();
    return { cenario: c.nome, esperado: String(c.esperado), obtido: String(obtido), ok: Math.abs(obtido - c.esperado) < 0.015 };
  });
  const reverso = brutoParaLiquido(5000);
  resultados.push({
    cenario: '22) Reverso de R$ 5.000 líquidos',
    esperado: 'bruto entre 6000 e 6100 e líquido >= 5000',
    obtido: `bruto ${reverso.bruto}, líquido ${reverso.descontos.liquido}`,
    ok: reverso.bruto > 6000 && reverso.bruto < 6100 && reverso.descontos.liquido >= 5000 && reverso.descontos.liquido < 5001
  });
  return resultados;
}

function rodarTestes() {
  const resultados = CENARIOS_TESTE.map((c) => {
    const r = simular(c.entrada);
    const ok = Math.abs(r.imposto - c.esperado.imposto) < 0.015 && r.melhor === c.esperado.melhor
      && (c.esperado.saldo === undefined || Math.abs(r.saldo - c.esperado.saldo) < 0.015);
    return { cenario: c.nome, esperado: `${c.esperado.imposto} (${c.esperado.melhor})`, obtido: `${r.imposto} (${r.melhor})`, ok };
  });
  resultados.push(rodarTesteEquilibrio());
  resultados.push(...rodarTestesMensais());
  resultados.push(rodarTesteWhatsApp());
  if (typeof console !== 'undefined' && console.table) console.table(resultados);
  return resultados;
}


/* ---------- Exportação e início ---------- */
const CalculaIR = {
  CONFIG, arredondar, paraAnual, indiceDaFaixa, impostoPelaTabela, reducaoDoImposto,
  descontoSimplificado, deducoesCompletas, calcularOpcao, pontoDeEquilibrio, simular,
  contribuicaoInss, descontosMensais, brutoParaLiquido, decimoTerceiro, calcularFerias, cltVersusPJ, simularMei,
  textoCompartilhamento, urlWhatsApp,
  rodarTestes, CENARIOS_TESTE, CENARIOS_MENSAIS, gerarImagemResultado
};

if (typeof module !== 'undefined' && module.exports) module.exports = CalculaIR;

if (typeof document !== 'undefined') {
  window.CalculaIR = CalculaIR;
  iniciar();
}
