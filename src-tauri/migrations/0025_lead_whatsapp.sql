-- 0025: WhatsApp publicado no site do lead (Prospecção). O telefone do Google Maps pode estar
-- desatualizado (caso real no teste de 2026-11-02: o número do Maps de uma academia já era de outra
-- empresa). "Achar no site" guarda aqui o número dos links wa.me / api.whatsapp.com do próprio site,
-- e a mensagem de abordagem passa a usar este número quando ele existe. Vazio = não achado.

ALTER TABLE leads ADD COLUMN whatsapp TEXT NOT NULL DEFAULT '';
