-- NeuraOAB — parcelamento em até 10x no cartão pro plano ANUAL (Asaas)
-- Execute este script uma vez no projeto Supabase (SQL Editor), depois de
-- schema_asaas.sql. Aditivo e idempotente — seguro re-rodar.
--
-- CONTEXTO: a versão anterior deste recurso (ver criar-cobranca/index.ts)
-- usava POST /v3/payments com installmentCount fixo em 10 — o Asaas cria as
-- 10 cobranças de antemão, sem o aluno poder escolher quantas vezes.
-- Confirmado que isso NÃO é "em até 10x" de verdade (o aluno não escolhe
-- nada); o recurso que deixa o ALUNO escolher (1x a 10x, com o valor de
-- cada parcela recalculado) é outro produto do Asaas — "Asaas Checkout"
-- (POST /v3/checkouts, chargeTypes: ["INSTALLMENT"]) — usado agora só pra
-- CREDIT_CARD + YEARLY.
--
-- IMPORTANTE — o formato exato do webhook "CHECKOUT_PAID" NÃO está
-- documentado com exemplo pela Asaas (só CHECKOUT_CREATED tem exemplo
-- publicado, e ele nem mostra o campo externalReference sendo ecoado de
-- volta). webhook-asaas/index.ts casa a cobrança por
-- "cobrancas.asaas_checkout_id = body.checkout.id" (o id que O PRÓPRIO
-- ASAAS devolve na criação do checkout, ver criar-cobranca/index.ts —
-- deveria estar sempre presente, diferente de externalReference) — mas
-- convém validar isso com um pagamento de teste real assim que possível, e
-- olhar o log de "cobranca não encontrada" (que agora inclui o corpo cru do
-- evento) se o primeiro teste não bater.

alter table cobrancas add column if not exists asaas_checkout_id text;
create index if not exists idx_cobrancas_asaas_checkout on cobrancas (asaas_checkout_id);

-- ROTEIRO pra colocar isso no ar:
--   1. Rode este arquivo inteiro no SQL Editor.
--   2. Recole criar-cobranca/index.ts e webhook-asaas/index.ts atualizados
--      no editor de Edge Functions.
--   3. Faça UM pagamento de teste real (cartão + anual) e confira nos logs
--      de webhook-asaas se "CHECKOUT_PAID" chegou e achou a cobrança. Se
--      cair no ramo "cobranca não encontrada", o log agora inclui o corpo
--      inteiro do evento — copie o JSON e ajuste findCobrancaCheckout() em
--      webhook-asaas/index.ts pro campo certo.
