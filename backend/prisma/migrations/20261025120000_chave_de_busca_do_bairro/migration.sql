-- DT-06: bairro é texto livre, e "Jd. América" não achava "jardim america".
--
-- A rota ganha uma chave de busca por bairro, calculada pela aplicação em
-- `chaveDeBairro()` (src/shared/utils/bairro.ts). A busca de caronas compara só
-- as chaves; as colunas originais continuam guardando o que o motorista digitou,
-- para exibir.
--
-- As rotas que já existem são preenchidas aqui, com as mesmas regras em SQL. A
-- função é temporária de propósito: mantê-la no banco criaria uma segunda fonte
-- da verdade, que divergiria da aplicação na primeira abreviação nova.

-- AlterTable
ALTER TABLE "rota" ADD COLUMN "origem_bairro_chave" TEXT,
ADD COLUMN "destino_bairro_chave" TEXT;

CREATE FUNCTION "chave_de_bairro_migracao"(texto TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(string_agg(
    CASE palavra
      WHEN 'jd' THEN 'jardim'
      WHEN 'jdm' THEN 'jardim'
      WHEN 'vl' THEN 'vila'
      WHEN 'pq' THEN 'parque'
      WHEN 'res' THEN 'residencial'
      WHEN 'resid' THEN 'residencial'
      WHEN 'cj' THEN 'conjunto'
      WHEN 'conj' THEN 'conjunto'
      WHEN 'lot' THEN 'loteamento'
      WHEN 'cond' THEN 'condominio'
      WHEN 'ind' THEN 'industrial'
      WHEN 'sta' THEN 'santa'
      WHEN 'sto' THEN 'santo'
      WHEN 'nsa' THEN 'nossa'
      WHEN 'sra' THEN 'senhora'
      ELSE palavra
    END, ' ' ORDER BY posicao), '')
  FROM regexp_split_to_table(
    lower(translate(
      texto,
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )),
    '[^a-z0-9]+'
  ) WITH ORDINALITY AS t(palavra, posicao)
  WHERE palavra <> '' AND palavra NOT IN ('de', 'da', 'do', 'das', 'dos', 'e')
$$;

UPDATE "rota" SET
  "origem_bairro_chave" = "chave_de_bairro_migracao"("origem_bairro"),
  "destino_bairro_chave" = "chave_de_bairro_migracao"("destino_bairro");

DROP FUNCTION "chave_de_bairro_migracao"(TEXT);

ALTER TABLE "rota" ALTER COLUMN "origem_bairro_chave" SET NOT NULL,
ALTER COLUMN "destino_bairro_chave" SET NOT NULL;

-- DropIndex
DROP INDEX "rota_origem_bairro_destino_bairro_sentido_idx";

-- CreateIndex
CREATE INDEX "rota_origem_bairro_chave_destino_bairro_chave_sentido_idx" ON "rota"("origem_bairro_chave", "destino_bairro_chave", "sentido");
