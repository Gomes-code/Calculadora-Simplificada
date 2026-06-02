# Calculadora de Carbono Simplificada TPF

Aplicação local em **Flask + SQLite** para consulta simplificada do banco SINAPI com fatores de emissão mínimo, médio e máximo.

## Como abrir

No Windows, dê dois cliques em:

```bat
INICIAR_CALCULADORA_TPF.bat
```

O script cria o ambiente virtual `.venv`, instala as dependências e inicia a aplicação em:

```text
http://127.0.0.1:5000
```

## O que mudou nesta versão

- Interface revisada com fonte menor, cabeçalho mais limpo e layout mais harmônico.
- As categorias aparecem em **abas**, no estilo de formulário por seção.
- A página ficou mais curta: apenas a categoria ativa aparece na tela.
- O painel de resultados não fica mais suspenso durante a rolagem.
- O painel superior apresenta:
  - cenário mínimo, médio ou máximo;
  - total da construção;
  - taxa kgCO₂e/m²;
  - maior categoria emissora;
  - variação em relação à simulação anterior;
  - histórico das últimas 5 simulações.
- A aba **Resultados** consolida total, taxa em tCO₂e/m², contribuição por categoria e comparação com faixas de referência.
- A descrição completa da composição selecionada permanece visível na aba ativa.
- A lista de opções mostra descrição completa, unidade e status dos dados.
- O cálculo foi mantido com tratamento de unidade:
  - composições em `M2`: o valor informado entra diretamente como área/quantidade em m²;
  - composições em outra unidade, como `M3`, `M`, `KG` ou `UN`: o usuário informa a área de referência em m² e uma taxa da unidade por m²;
  - a calculadora converte antes de somar as emissões.
- Superestrutura segue filtrada para itens associados a **pilares, vigas e lajes**.
- Telhamento segue filtrado para composições de **TELHAMENTO**, relacionadas ao tipo de telha.
- Incluídas faixas de referência: SindusCon/SP (2024), de 0,10 a 0,52 tCO₂e/m², e Caldas et al. (2017), Belizário (2022) e Melo et al. (2023), de 0,27 a 0,39 tCO₂e/m².

## Exemplo de conversão

Se uma composição de concreto está em `M3`, mas o projetista quer informar a área de referência:

- Área de referência: `100 m²`
- Taxa de conversão: `0,12 M3/m²`

A quantidade convertida será:

```text
100 × 0,12 = 12 M3
```

O cálculo de emissão será:

```text
12 M3 × fator de emissão da composição em kgCO2e/M3
```

## Recriar o banco SQLite

Caso a planilha `data/BD sinapi.xlsx` seja atualizada, rode:

```bash
python build_database.py
```

O banco será recriado em:

```text
data/carbono_sinapi.db
```

## Observação sobre dados incompletos

Quando `is_complete` é falso, a aplicação exibe:

```text
s/dados escolha outra opção e informe a equipe de sustentabilidade
```

Essas composições não entram no total da simulação.


## Ajustes v4.1

- Cartões de composição mais limpos, sem sobreposição dos selos de unidade/status.
- Campo de conversão aceita digitação decimal com vírgula ou ponto.
- Quadro de resultado atual reorganizado para leitura mais clara.
