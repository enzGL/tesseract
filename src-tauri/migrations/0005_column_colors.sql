-- Cores padrão do quadro: "A fazer" cinza, "Fazendo" amarelo, "Feito" verde.
-- Só pinta colunas padrão que ainda não têm cor; cor escolhida pela pessoa fica como está.
UPDATE board_columns SET color = CASE name
    WHEN 'A fazer' THEN '#8A93B4'
    WHEN 'Fazendo' THEN '#E0A800'
    WHEN 'Feito'   THEN '#1D6B45'
  END
  WHERE color IS NULL AND name IN ('A fazer', 'Fazendo', 'Feito');
