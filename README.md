# Calculadora de Imposto de Renda

Simulador de Imposto de Renda de Pessoa Física (IRPF) em HTML, CSS e JavaScript puro. A pessoa informa quanto ganha, responde sobre despesas que abatem imposto e descobre quanto paga de imposto, quanto sobra e qual declaração compensa mais (simplificada ou completa).

Feito para ser simples: 3 passos, linguagem sem jargão, funciona bem no celular e não pede cadastro nem login.

## Como funciona

1. **Quanto você ganha?** Valor mensal ou anual, com máscara de moeda.
2. **Despesas que abatem imposto** (opcional): dependentes, saúde, educação, previdência (INSS/PGBL) e pensão alimentícia. Dá também para informar o **imposto que você já pagou** (o IRRF do contracheque).
3. **Resultado:** imposto estimado, **restituição ou imposto a pagar** (quando o IRRF é informado), gráfico de rosca (imposto x o que fica com você), comparativo simplificada x completa com o **ponto de equilíbrio** (a partir de quanto de gasto dedutível a completa passa a compensar), alíquota efetiva e alíquota da faixa. Dá para **mandar o resultado no WhatsApp** com um toque ou **baixar uma imagem** (formato stories) para compartilhar.

O resultado fica embaçado até o desbloqueio pelo plano mensal (veja [Plano mensal](#plano-mensal)).

## Outras calculadoras (grátis, sem desbloqueio)

Na primeira tela, em "Outras calculadoras grátis":

- **Salário reverso:** você diz quanto quer tirar de líquido por mês e o site calcula o salário bruto necessário, já descontando INSS (tabela 2026) e IRRF da folha (com a redução da Lei 15.270/2025, que zera o imposto até R$ 5.000).
- **13º salário e férias:** mostra quanto cai de INSS e IRRF no 13º (tributação exclusiva, com as duas parcelas) e no mês das férias (salário + 1/3 constitucional), comparando com um mês normal.
- **CLT ou PJ:** soma tudo o que a CLT entrega (11 salários + mês de férias + 13º líquidos, mais o FGTS de 8%) e mostra quanto você precisa faturar como PJ, dada a alíquota do Simples Nacional, para empatar.
- **MEI: quanto sobra?** faturamento mensal menos o DAS fixo de 2026 (R$ 82,05 comércio, R$ 86,05 serviços, R$ 87,05 os dois), com o peso do DAS, a projeção anual e aviso se passar do limite de R$ 81.000/ano (sobe para R$ 110.000 em 2027).

## Regras de cálculo

Ano-calendário **2026** (declaração de 2027), conforme a Receita Federal e a Lei 15.270/2025.

| Regra | Valor |
|---|---|
| Faixa de alíquota zero (anual) | até R$ 29.145,60 |
| Alíquotas da tabela progressiva | 0%, 7,5%, 15%, 22,5% e 27,5% |
| Redução do imposto (Lei 15.270/2025) | até R$ 60.000/ano zera o imposto; de R$ 60.000,01 a R$ 88.200 a redução diminui aos poucos; acima disso não há redução |
| Dedução por dependente | R$ 2.275,08 por ano |
| Dedução com educação | até R$ 3.561,50 por pessoa por ano |
| Dedução com saúde | sem limite |
| Desconto simplificado | 20% da renda, até R$ 17.640 por ano |

Todos os valores ficam no objeto `CONFIG`, no topo do `script.js`, com a fonte e a data de conferência. Para atualizar em um novo ano, basta alterar esse objeto.

### O que o simulador não calcula

- Imposto mínimo para rendas acima de R$ 600 mil por ano e tributação de dividendos (o site mostra um aviso).
- O limite de 12% da renda para dedução de PGBL (está explicado no texto de ajuda do campo).
- Regras específicas de aposentados, ganho de capital, aluguéis, 13º salário ou carnê-leão.

> Simulação informativa. Não substitui a declaração oficial na Receita Federal: https://www.gov.br/receitafederal

## Como rodar

Não precisa instalar nada. Baixe o projeto e abra o `index.html` no navegador.

O site é um **PWA**: publicado (ex.: GitHub Pages), pode ser instalado na tela inicial do celular e funciona offline depois da primeira visita (service worker em `sw.js`; ao mudar o site, incremente a `VERSAO` dele para atualizar o cache).

```
git clone //github.com/gubialves/calculadora-imposto-renda.git
cd calculadora-imposto-renda
# abra o index.html no navegador
```

## Estrutura

```
├── index.html   # estrutura da página e acessibilidade
├── style.css    # visual (cores em variáveis CSS)
├── script.js    # CONFIG, funções de cálculo e interface
├── manifest.webmanifest + sw.js + ícones   # PWA (instalável, offline)
├── README.md
└── LICENSE
```

O `script.js` é dividido em 4 partes: configuração (`CONFIG`), cálculo (funções puras, sem acesso à tela), interface e testes.

## Testes

Os cálculos são funções puras e podem ser testados sem abrir a página.

No navegador, abra o console e digite:

```js
CalculaIR.rodarTestes()
```

No Node.js:

```
node -e "console.log(require('./script.js').rodarTestes())"
```

Cenários cobertos (valores calculados à mão a partir da tabela):

| # | Cenário | Imposto esperado por ano | Melhor opção |
|---|---|---|---|
| 1 | Renda isenta: R$ 3.000/mês | R$ 0,00 | empate |
| 2 | Faixa intermediária: R$ 6.000/mês | R$ 3.387,01 | simplificada |
| 3 | Renda alta: R$ 15.000/mês | R$ 33.744,34 | simplificada |
| 4 | Com dependentes: R$ 10.000/mês, 2 dependentes | R$ 17.244,34 | simplificada |
| 5 | Com deduções: R$ 12.000/mês, 2 dependentes, saúde, educação e INSS | R$ 16.255,81 | completa |
| 6 | Restituição: R$ 6.000/mês com R$ 400/mês já retidos | R$ 3.387,01 | simplificada (restituição de R$ 1.412,99) |
| 7 | Ponto de equilíbrio: R$ 6.000/mês | a completa passa a compensar acima de R$ 14.400 de deduções/ano | – |

## Plano mensal

O resultado aparece embaçado e é liberado por um plano mensal de R$ 5,00. A configuração fica em `CONFIG.plano`, no `script.js`:

- `precoMensal`: valor mostrado no botão.
- `linkPagamento`: link do checkout (Pix recorrente, Mercado Pago, Stripe etc.). Vazio, o botão só mostra um aviso.
- `permitirDemo`: com `true`, abrir a página com `?demo=1` libera o resultado, só para testes. Deixe `false` ao publicar.

Importante: como o cálculo roda no navegador, o bloqueio é visual. Para proteger de verdade, o cálculo e a confirmação da assinatura precisam ficar em um servidor.

## Acessibilidade

- Contraste mínimo WCAG AA, foco visível e navegação por teclado.
- Todos os campos têm rótulo e há suporte a leitor de tela.
- Respeita `prefers-reduced-motion`.

## Privacidade

O cálculo roda inteiramente no navegador. O site não coleta nem envia os valores informados. Não usa fontes nem scripts de terceiros.

## Publicar com GitHub Pages

1. Vá em **Settings → Pages**.
2. Em *Source*, escolha **Deploy from a branch**, branch `main` e pasta `/ (root)`.
3. Aguarde 1 a 2 minutos. O site ficará em `https://gabriel434henrique-cell.github.io/calculadora-imposto-renda/`.

## Fontes

- Lei nº 15.270, de 26/11/2025 (isenção até R$ 5.000 por mês e redução gradual até R$ 7.350 por mês)
- Receita Federal: tabelas do IRPF 2026 e do exercício 2027

## Autor

Gabriel Henrique Alves de Souza
[GitHub](https://github.com/gabriel434henrique-cell) · [LinkedIn](https://www.linkedin.com/in/gabriel-henrique-alves-5b13872a7)

## Licença

MIT. Veja o arquivo `LICENSE`.
