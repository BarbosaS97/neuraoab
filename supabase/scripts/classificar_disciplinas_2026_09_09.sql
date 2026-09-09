-- NeuraOAB — preenche oab_questions.discipline das 252 questões que estavam
-- sem disciplina, classificadas uma a uma por IA (revisão de conteúdo
-- 2026-09-09) contra as 18 disciplinas já em uso no banco.
-- Execute no SQL Editor do Supabase. Idempotente (WHERE discipline IS NULL
-- protege contra sobrescrever uma classificação manual feita nesse meio tempo).
--
-- 26 das 252 ficaram na fronteira entre duas disciplinas plausíveis (ex.: uma
-- questão de quinto constitucional que tange tanto Ética Profissional quanto
-- Direito Constitucional) — em vez de forçar um palpite, viram "Outras" (uma
-- 19ª disciplina nova, não uma das 18 já existentes): aparecem como seu próprio
-- grupo nos filtros/estatísticas do aluno (ver q.discipline em estudos/estudos.js),
-- sem contar pras medalhas de categoria (mesmo tratamento que Ética Profissional/
-- Filosofia do Direito/ECA/Direito Digital já recebem em estudos/medals.js —
-- CATEGORY_DISCIPLINES não lista essas 4, então "Outras" só entra mais uma vez
-- num padrão que já existia, não precisa de nenhuma mudança de código). IDs
-- marcados com comentário inline abaixo.

-- Conferência ANTES de aplicar: quantas ainda sem disciplina agora
select count(*) as sem_disciplina_antes from oab_questions where discipline is null;

begin;

update oab_questions as q
set discipline = v.discipline
from (values
  ('002fa063-b9bb-437f-b4fd-e0e5089ce841'::uuid, 'Direito Constitucional'),
  ('0129ae07-dd7b-4c86-b4a4-ba160d6bc892'::uuid, 'Ética Profissional'),
  ('016ea951-5856-4ca8-89b3-fdfd7c7dba2a'::uuid, 'Filosofia do Direito e Direitos Humanos'),
  ('02641317-18b1-4797-a33c-653ad8047c87'::uuid, 'Direito Internacional e Migração'),
  ('0370232e-cdb9-4243-8f47-138e67d983b9'::uuid, 'Filosofia do Direito e Direitos Humanos'),
  ('049a0ba9-bf37-4cf1-8247-00d5ff34be03'::uuid, 'Filosofia do Direito e Direitos Humanos'),
  ('05f2f76f-e9ba-47a4-a38a-a6fbb3703e2b'::uuid, 'Direito Internacional e Migração'),
  ('0752eb32-3cb1-4d05-82d3-94cb45a25d6f'::uuid, 'Direito Civil'),
  ('075da654-ae3b-4898-9703-c66206f826f7'::uuid, 'Direito Administrativo'),
  ('07d8abe9-83e6-4174-9ec0-1262547b0de2'::uuid, 'Direito Constitucional'),
  ('0914385b-7737-4b7a-aa7b-7999d1469b4e'::uuid, 'Direito Constitucional'),
  ('099fa029-d853-4044-9fe5-32e7d13e7b7c'::uuid, 'Ética Profissional'),
  ('09b357b0-04e1-4c05-a098-dad8b5f8866f'::uuid, 'Direito Administrativo'),
  ('0a4e8d30-d26c-4663-8acc-c6bff1b56df0'::uuid, 'Direito Constitucional'),
  ('0bbc635c-4c3d-440a-b66d-e7e6a921e578'::uuid, 'Direito Constitucional'),
  ('0cc23caa-7a97-4574-8952-6503ba62b5bf'::uuid, 'Ética Profissional'),
  ('0e3fcb4a-3535-4609-be4f-fdc820e215a7'::uuid, 'Direito Processual Civil'),
  ('107dc90c-0a11-4496-92ae-4538bfe0dbf8'::uuid, 'Direito Constitucional'),
  ('10ce66d2-60f1-47ea-8057-b58056284828'::uuid, 'Direito Empresarial'),
  ('13b90f13-bf91-4dc0-b063-86f266d181be'::uuid, 'Filosofia do Direito e Direitos Humanos'),
  ('16a9d56a-d95e-497c-99ef-649334fc3e06'::uuid, 'Direito Previdenciário'),
  ('175457ad-2fd8-4dd1-8f50-90fbc7a227b6'::uuid, 'Direito Civil'),
  ('1768f048-8a73-48fc-a7c6-cdf13cce136f'::uuid, 'Direito Tributário'),
  ('177c65e1-ef96-4ff9-a4e7-296b3711da28'::uuid, 'Direito Administrativo'),
  ('18a8a968-0804-44c0-9dc1-8f541a44f46b'::uuid, 'Direito Administrativo'),
  ('19dd2f25-cdff-4af4-88c0-06a0cd12087a'::uuid, 'Direito Tributário'),
  ('1a232096-97e4-4335-aa80-5ca54bb08247'::uuid, 'Direito Internacional e Migração'),
  ('1b172d8a-2cb2-400a-8d7e-f6a36f0adfe6'::uuid, 'Direito Civil'),
  ('1b3fd049-dc93-4b0c-81b7-22d13d0efeff'::uuid, 'Direito Processual Civil'),
  ('1bd83863-43ef-44fa-88f2-ce5703ab66bf'::uuid, 'Outras'),  -- antes: Direito Constitucional, baixa confiança -> Outras
  ('1c04cdde-602e-45ed-b0fa-74817a688e4d'::uuid, 'Outras'),  -- antes: Direito Constitucional, baixa confiança -> Outras
  ('1ce9c4e2-4174-4195-8524-af95fdae7a41'::uuid, 'Direito Constitucional'),
  ('1d8cc275-c050-452b-ac1a-54f0d085d862'::uuid, 'Direito Empresarial'),
  ('1ef8cc9d-e51c-400e-8d34-08dd57aca743'::uuid, 'Direito Ambiental'),
  ('1fed4eab-1592-4e7f-b901-35223aa5465f'::uuid, 'Direito Ambiental'),
  ('20578c1f-2d87-45e6-8144-27b8ad9b9da8'::uuid, 'Outras'),  -- antes: Direito Constitucional, baixa confiança -> Outras
  ('228a5563-4f64-4ab8-bb6c-05a3a1b405a6'::uuid, 'Direito Penal'),
  ('23470172-30cc-423d-9baf-81972b208ea5'::uuid, 'Filosofia do Direito e Direitos Humanos'),
  ('2424ac90-12b4-4a4b-8d7d-3d4a4ab82c21'::uuid, 'Direito Civil'),
  ('24730cea-fbc8-4f1a-8cde-aab78ae57313'::uuid, 'Direito Civil'),
  ('24b2b3ee-3374-4957-a3c0-95908814eaa9'::uuid, 'Direito Civil'),
  ('27a6b74c-271d-4856-90d4-71ee1adf4d1a'::uuid, 'Outras'),  -- antes: Direito Constitucional, baixa confiança -> Outras
  ('299e7543-100c-47a3-bc5d-8a15b2c65b04'::uuid, 'Direito Constitucional'),
  ('2a182ffa-e334-46f2-a468-7b893b844e65'::uuid, 'Direito Empresarial'),
  ('2b01c6b1-cc45-4ff6-9555-20d3b73446d8'::uuid, 'Outras'),  -- antes: Direito Constitucional, baixa confiança -> Outras
  ('2b94f3e7-6c8a-4b87-a2df-e2925263a726'::uuid, 'Direito Civil'),
  ('2c32b33b-adbc-41ea-956b-1df99a4e814d'::uuid, 'Direito Constitucional'),
  ('2cd7e46c-cd38-4077-a128-cc21c34c964c'::uuid, 'Direito Constitucional'),
  ('2d096d7e-51ff-4cb6-9cb6-5ee060106f89'::uuid, 'Direito Administrativo'),
  ('2ea23824-7f2d-4042-8ae6-94ba3a5ca3f8'::uuid, 'Direito Empresarial'),
  ('2eedf66c-3f98-4f9f-8953-f14cd0d6186a'::uuid, 'Ética Profissional'),
  ('2f9e6135-3a04-47af-a4f7-981fefc1d4e9'::uuid, 'Direito Constitucional'),
  ('2fc7bb30-7fe0-4a75-9434-4a1c4a57b35f'::uuid, 'Direito Civil'),
  ('318ec141-ed8c-434a-819b-9bde97b221ca'::uuid, 'Direito Civil'),
  ('35966813-a27e-4d8b-ac4f-02365c2716e7'::uuid, 'Direito Empresarial'),
  ('3618b145-d8b3-4a0c-a7db-5a86f201ad93'::uuid, 'Direito do Trabalho'),
  ('3a142e6a-fb08-437c-83c0-bdfa85326987'::uuid, 'Direito Penal'),
  ('3d8b6ff4-8403-46ff-b483-b71c01450ee5'::uuid, 'Direito Empresarial'),
  ('3d8ead62-3d5d-4fa9-8881-709274508ac7'::uuid, 'Direito Penal'),
  ('3dbbad62-ef0d-4b28-a364-5b50bf0add33'::uuid, 'Direito Constitucional'),
  ('4065d164-5554-4e18-ba17-5051bb8f8949'::uuid, 'Direito Constitucional'),
  ('41ba1163-2fc5-4ce3-904d-989e0ccdf747'::uuid, 'Direito Constitucional'),
  ('43295e6f-81ff-4b50-a3a3-63b364a9437f'::uuid, 'Direito Processual Civil'),
  ('44c92618-e942-4031-9372-4f5d389719ab'::uuid, 'Direito Constitucional'),
  ('45e76138-c359-4e5a-90ee-1e140554d9ce'::uuid, 'Outras'),  -- antes: Direito Tributário, baixa confiança -> Outras
  ('46793136-3cba-4549-8547-5143b9bf1fa6'::uuid, 'Direito Constitucional'),
  ('46b8cb06-f929-41bf-860b-ff40fb98df66'::uuid, 'Direito Constitucional'),
  ('48f1b692-cc11-43a8-94a5-e4f0a6804982'::uuid, 'Direito Empresarial'),
  ('491416d7-dc9a-4085-b62b-60db9280e660'::uuid, 'Direito Empresarial'),
  ('4a84984f-b236-4afa-a33e-124653bdf9b2'::uuid, 'Direito Empresarial'),
  ('4b465d95-85d1-41fe-a985-6aec4063e90b'::uuid, 'Direito Civil'),
  ('4b8b9f3f-01b0-4760-838e-99dd48599c85'::uuid, 'Outras'),  -- antes: Direito Empresarial, baixa confiança -> Outras
  ('4c6cb9a7-2446-4f14-82a3-9e9e30ce617f'::uuid, 'Direito Constitucional'),
  ('4d96ecc2-de63-43c2-9a32-ecadbde40b6a'::uuid, 'Direito Civil'),
  ('4f1d97a7-b5ec-4875-9976-bca3a39cb3e8'::uuid, 'Direito Internacional e Migração'),
  ('4fd6557c-def4-4cf4-ae1b-5359e0a8b495'::uuid, 'Direito Processual Civil'),
  ('5031b5c2-ebb3-4b26-8ad8-96c6d38da131'::uuid, 'Outras'),  -- antes: Direito Administrativo, baixa confiança -> Outras
  ('5196b8f5-6b60-45db-9dc3-f9cdf8b7fe59'::uuid, 'Direito Constitucional'),
  ('539bad94-3d07-4623-8eb4-ca9f47f34aed'::uuid, 'Direito Penal'),
  ('560819e7-6031-44e6-a08a-c0cf92a16a72'::uuid, 'Direito Processual Civil'),
  ('5748aaf5-31f5-4e17-94ee-7e86e22d0cff'::uuid, 'Direito Constitucional'),
  ('57cdc0b2-16cf-4b22-b6df-ea5da6dadbb0'::uuid, 'Outras'),  -- antes: Direito Constitucional, baixa confiança -> Outras
  ('58fe244a-c872-45c0-be03-10b90637c1a3'::uuid, 'Ética Profissional'),
  ('5a47d199-4a70-4a17-a572-2e694d4e487e'::uuid, 'Direito Processual Civil'),
  ('5ab1a87a-1956-4267-bb17-734e22e65247'::uuid, 'Direito Civil'),
  ('5ac20959-9d59-4df8-8a43-c68ebbba8088'::uuid, 'Direito Civil'),
  ('5cf1cbce-75bd-4d21-8de0-0173ab22137b'::uuid, 'Direito Constitucional'),
  ('5cf6c12d-a3b8-459a-9038-955773d0ab79'::uuid, 'Outras'),  -- antes: Direito Constitucional, baixa confiança -> Outras
  ('5f4d8690-e9d0-4707-8754-26eb5edeea95'::uuid, 'Direito Constitucional'),
  ('5f9b806f-543e-4e8b-b559-c5d542e4fb70'::uuid, 'Direito Constitucional'),
  ('60380c03-899c-47c5-89b6-65d6fcff71ac'::uuid, 'Direito Previdenciário'),
  ('633b5db6-eb8d-44ab-bd39-ba98aeb89153'::uuid, 'Direito Constitucional'),
  ('635ab7b6-6ec0-47bf-a196-3c66e9856961'::uuid, 'Direito Processual Penal'),
  ('64683a66-03f4-437d-98a4-1ed5ac8f60a4'::uuid, 'Filosofia do Direito e Direitos Humanos'),
  ('649e4bb2-4ac4-456b-8faa-2c590f58187a'::uuid, 'Ética Profissional'),
  ('64d6a76f-2084-45c5-aa3e-f1e08d43611d'::uuid, 'Direito Constitucional'),
  ('65bba1a5-c06a-4f5b-92d8-fa89d439adfc'::uuid, 'Direito Processual Civil'),
  ('661fa6a1-3701-4e1b-9811-f8b149bfdae6'::uuid, 'Direito Processual Civil'),
  ('663af6eb-369e-4f10-98bb-1377bbf95efc'::uuid, 'Direito Tributário'),
  ('68991047-f4b9-45cc-bac2-d41f479982a6'::uuid, 'Ética Profissional'),
  ('68d7481d-982f-400f-902c-9a76e5cc8120'::uuid, 'Direito Processual Penal'),
  ('6a4e57f9-6a15-4b70-a269-9871cb429b9c'::uuid, 'Outras'),  -- antes: Direito Constitucional, baixa confiança -> Outras
  ('6b0597d3-2fc2-4d31-9676-fe2821cd3aed'::uuid, 'Ética Profissional'),
  ('6bd7c35a-f27f-4843-a384-644487fd70be'::uuid, 'Outras'),  -- antes: Ética Profissional, baixa confiança -> Outras
  ('6cb90bde-5d2b-41de-97b3-cc69d70df975'::uuid, 'Direito Empresarial'),
  ('6f642083-10b5-49b1-800e-9ad5926e02de'::uuid, 'Direito Empresarial'),
  ('7335fe02-dfef-46cb-b12b-a8f376ed2514'::uuid, 'Direito Civil'),
  ('74171b17-2012-4a39-81b1-481f46455b61'::uuid, 'Direito Processual Civil'),
  ('7537dcaa-9dc3-496a-8b41-b820781a4ba8'::uuid, 'Outras'),  -- antes: Direito Constitucional, baixa confiança -> Outras
  ('764a0ee8-6644-40c4-826a-f85ab2610567'::uuid, 'Direito Civil'),
  ('765c8795-e1ff-4a03-866b-219ef9610d75'::uuid, 'Direito Constitucional'),
  ('76b97c5e-0962-42e8-af6c-df19030cfb24'::uuid, 'Direito Processual Penal'),
  ('78770fe2-6d30-4717-8740-bf3098d0e049'::uuid, 'Direito Constitucional'),
  ('7a7bc515-ba8c-4df0-8885-5c277823a64d'::uuid, 'Direito Civil'),
  ('7aa317d4-f958-4474-85e4-5265e2016d8a'::uuid, 'Direito Constitucional'),
  ('7b7f5061-c166-4aa8-8669-7ea730b5666e'::uuid, 'Outras'),  -- antes: Direito Constitucional, baixa confiança -> Outras
  ('7bbe7642-81cc-460d-8318-9000b48b269a'::uuid, 'Outras'),  -- antes: Direito Civil, baixa confiança -> Outras
  ('7c79a20c-4ca1-4bb4-ab71-d1da2003dc21'::uuid, 'Direito Empresarial'),
  ('7ce13756-9c4b-4fc0-98d8-1b706596aaa9'::uuid, 'Direito Administrativo'),
  ('7fba127d-b2cf-4134-bcf3-21c7a18b6724'::uuid, 'Outras'),  -- antes: Direito Constitucional, baixa confiança -> Outras
  ('7fe73209-2e52-496d-94d8-837979aa9c90'::uuid, 'Direito Processual Penal'),
  ('8105af64-ef77-4e39-bf2b-8cad8559aded'::uuid, 'Direito Administrativo'),
  ('83ac4140-5e32-4feb-b9a7-0590df9b58c7'::uuid, 'Ética Profissional'),
  ('83ac9d72-30bd-4c75-9ce7-2ca9aab0ea51'::uuid, 'Direito Civil'),
  ('84207216-92d9-4944-ba58-b4c2a2c6ff23'::uuid, 'Direito Penal'),
  ('844bba22-841b-4803-b4c2-a4eadbbdc40f'::uuid, 'Direito Digital e Proteção de Dados'),
  ('85853923-c62a-462d-a5a4-ca8bbd39c698'::uuid, 'Direito Processual Civil'),
  ('868e5866-c311-4a75-a3f4-5f06ae01dec5'::uuid, 'Filosofia do Direito e Direitos Humanos'),
  ('878de680-b568-474c-ac6e-fd66a5ce15c2'::uuid, 'Direito Processual Civil'),
  ('88442709-7e8f-4eb5-adae-d48a6125c224'::uuid, 'Direito Administrativo'),
  ('88bae50f-7fe2-4334-bdf8-76911fc906da'::uuid, 'Direito Empresarial'),
  ('8a0bf76d-9d74-438f-b2f0-aa9ba4f9cc47'::uuid, 'Direito Constitucional'),
  ('8a2bd50e-b9bd-4bb9-ae26-880a6bd14831'::uuid, 'Direito Processual Penal'),
  ('8c366cb8-ecba-4aec-81bb-8d7efd09066a'::uuid, 'Direito Civil'),
  ('8cfa48f9-8b2b-4d3a-a97b-ee11f7076e19'::uuid, 'Direito Constitucional'),
  ('8d0ea7db-3e1d-4115-ae2c-e8fa85715962'::uuid, 'Direito Civil'),
  ('8f315386-f54c-4e3d-9dfe-28c51a646808'::uuid, 'Direito Ambiental'),
  ('9080d597-6cb8-497a-981a-72ced47ca363'::uuid, 'Direito Processual Penal'),
  ('916ccb2b-fddc-47a8-9a9c-2d0cae445707'::uuid, 'Direito Processual Civil'),
  ('9228ecde-c63e-4c9b-b98b-5f75bf949661'::uuid, 'Filosofia do Direito e Direitos Humanos'),
  ('9450fc6e-497d-4792-8209-3f8681613c06'::uuid, 'Direito Civil'),
  ('94790993-d08d-4216-bd2e-f1294fd5c7b8'::uuid, 'Direito Constitucional'),
  ('95988a53-a64e-4527-85bc-dc2caadc8bd6'::uuid, 'Ética Profissional'),
  ('968d69a6-889b-406b-a0cd-dc0c4f55133b'::uuid, 'Direito Civil'),
  ('96c52a85-7197-4006-9b6a-ff4b40777647'::uuid, 'Filosofia do Direito e Direitos Humanos'),
  ('972adb6a-6c95-4d66-9e57-b83de20bc8b8'::uuid, 'Direito Civil'),
  ('9747acde-e040-49ac-9c24-1090ee86db4e'::uuid, 'Direito Empresarial'),
  ('995d9d51-dca4-42a9-ae41-86e2db2e562e'::uuid, 'Ética Profissional'),
  ('99742d03-4d1a-462c-b6cd-3b426312a250'::uuid, 'Direito Penal'),
  ('9be3d645-fcdf-4f33-97e5-dc910ab9c9fc'::uuid, 'Direito Empresarial'),
  ('9e42798f-c6b8-4eeb-9801-c115cb46e72c'::uuid, 'Direito do Trabalho'),
  ('a06a0a39-94b3-41ae-9e4c-e07da3356aa5'::uuid, 'Ética Profissional'),
  ('a11b788a-560d-43f1-9d03-7a9968032051'::uuid, 'Direito Administrativo'),
  ('a2184460-d4ed-418b-b58a-fd632d506201'::uuid, 'Direito Constitucional'),
  ('a344c845-8427-4bcf-a01c-162b2ca6ade3'::uuid, 'Ética Profissional'),
  ('a3c3dd6e-a7b6-4ace-b5c1-c4217b007ad3'::uuid, 'Ética Profissional'),
  ('a3c6d481-89a0-49d9-a9ce-aef7feff0c2a'::uuid, 'Outras'),  -- antes: Direito Constitucional, baixa confiança -> Outras
  ('a55a196d-48a3-4037-9b10-18c95d6a347e'::uuid, 'Direito Processual Civil'),
  ('a57e51c1-2f0d-46b3-9d19-c00444fefe17'::uuid, 'Outras'),  -- antes: Direito Constitucional, baixa confiança -> Outras
  ('a58e3894-5adb-4090-ac72-89a866649102'::uuid, 'Outras'),  -- antes: Direito Processual Penal, baixa confiança -> Outras
  ('a5e11d19-8122-436d-9e03-e147af9fd1eb'::uuid, 'Outras'),  -- antes: Direito Constitucional, baixa confiança -> Outras
  ('a628075a-578d-4ff4-a83c-77c10b7d809d'::uuid, 'Filosofia do Direito e Direitos Humanos'),
  ('a753849f-1fed-4879-80e6-274f424be11b'::uuid, 'Direito Civil'),
  ('a76d5741-7a69-4780-9547-d897c3a7a69d'::uuid, 'Direito Civil'),
  ('a8325100-c775-4124-9a23-4421c76fd05a'::uuid, 'Direito Ambiental'),
  ('a8be9fa7-7900-4833-a51a-a3fe628666be'::uuid, 'Filosofia do Direito e Direitos Humanos'),
  ('ad4ddb70-5c7e-47f4-924c-d53316be73eb'::uuid, 'Direito Internacional e Migração'),
  ('ad7fa8e2-ba0c-4228-8a04-dd42def24b93'::uuid, 'Outras'),  -- antes: Ética Profissional, baixa confiança -> Outras
  ('ade5fdaf-d301-4ca7-991f-c3a11e4f06e1'::uuid, 'Direito Civil'),
  ('aea914a0-13ba-431e-a5ea-345657cc52e8'::uuid, 'Direito Civil'),
  ('af180768-a4db-4642-9409-62339fc4ed43'::uuid, 'Direito Civil'),
  ('af19144b-0724-44b6-aea3-59bab65e0153'::uuid, 'Direito Constitucional'),
  ('af57358b-75a7-430b-ad9b-f18123ac18c8'::uuid, 'Direito Processual Civil'),
  ('b213bb41-d625-4a4d-88d3-a333314916d5'::uuid, 'Ética Profissional'),
  ('b2351840-943b-410c-9094-8974dcca67cf'::uuid, 'Direito Constitucional'),
  ('b3239b1d-b04f-40c6-b643-9e35e64dfb07'::uuid, 'Direito do Consumidor'),
  ('b546a84d-6d87-4f8e-aad2-a7697ec91df8'::uuid, 'Outras'),  -- antes: Filosofia do Direito e Direitos Humanos, baixa confiança -> Outras
  ('b6d9a86f-9f1a-4968-94a6-5f440f56f720'::uuid, 'Direito Empresarial'),
  ('b86f75db-2a85-4400-bffd-80b6af8d680c'::uuid, 'Direito Ambiental'),
  ('ba4305b0-b6c1-4218-9aa9-bd747090c25c'::uuid, 'Direito Constitucional'),
  ('bade5828-aa11-4a6f-9889-60195d39560f'::uuid, 'Filosofia do Direito e Direitos Humanos'),
  ('bc30c14b-8ca7-45fe-ba3b-21e6c8b25cd5'::uuid, 'Direito Constitucional'),
  ('bca8a322-9c15-4319-919d-d2ea6faf0e04'::uuid, 'Direito Civil'),
  ('bcc0e6a4-84b3-448d-8a25-1b069472420f'::uuid, 'Direito Administrativo'),
  ('bdffb28d-e9a6-4b86-b4be-9379b67044b8'::uuid, 'Direito Civil'),
  ('be2ebfa5-30e3-452b-bac6-3ad7268cc9fe'::uuid, 'Direito Civil'),
  ('bed59275-b2c6-422e-9021-63573a0a915a'::uuid, 'Direito Penal'),
  ('c04dd331-9bd1-422d-aace-03ca32971ece'::uuid, 'Direito Processual Civil'),
  ('c51d3bca-ac92-4541-9cf7-1520aa2c270a'::uuid, 'Direito Empresarial'),
  ('c61842c9-bf06-4698-b5bb-82bc75059ba1'::uuid, 'Ética Profissional'),
  ('c78b3ba7-7899-4e50-8592-14111fccd948'::uuid, 'Outras'),  -- antes: Direito Processual Civil, baixa confiança -> Outras
  ('c90a86f2-8ba6-479f-bba8-0e6812d2b2b3'::uuid, 'Direito Processual Civil'),
  ('c9d683e7-64e4-4e84-bd27-4af94890ea7c'::uuid, 'Direito Processual Civil'),
  ('cb007403-3b88-4c86-8947-2af0fe428f89'::uuid, 'Filosofia do Direito e Direitos Humanos'),
  ('cdb34f76-33a1-4873-ba4f-041de9558af7'::uuid, 'Direito Constitucional'),
  ('cefbf445-5eb5-4553-b629-18804df90c0f'::uuid, 'Ética Profissional'),
  ('cfa26622-5f71-4754-8c39-3aced48f392c'::uuid, 'Direito Empresarial'),
  ('d013dcc9-6832-419e-a209-ce599ad670fe'::uuid, 'Direito Tributário'),
  ('d05c7fb5-1ae7-468a-9d13-377d3ba3f8b4'::uuid, 'Filosofia do Direito e Direitos Humanos'),
  ('d15ee4ee-fcc3-462d-9429-6ee4562aeab9'::uuid, 'Direito Constitucional'),
  ('d1befa2c-2981-4596-af9a-1c5a3b97962b'::uuid, 'Direito Civil'),
  ('d2aea8e8-d63e-4f39-9987-8e837fd7fc9a'::uuid, 'Direito Empresarial'),
  ('d40bb3af-a225-4f12-a0c2-2bccfb4b61e2'::uuid, 'Direito Administrativo'),
  ('d459e45c-1ecb-4d56-b57e-532d7c52340f'::uuid, 'Direito Previdenciário'),
  ('d53fcff4-6494-4daf-9d89-ebe02a79bdec'::uuid, 'Direito Tributário'),
  ('d6638edb-4027-4082-bc8e-3e6440b9b3f3'::uuid, 'Direito Constitucional'),
  ('d6c746d6-9246-47c5-89cc-d63844224a73'::uuid, 'Filosofia do Direito e Direitos Humanos'),
  ('d7188fd9-88a6-44f3-ae2c-29738baf3fd6'::uuid, 'Direito Civil'),
  ('d734ea35-6d14-4f75-8a1f-aa238cb71354'::uuid, 'Direito Tributário'),
  ('d7fc83d3-8265-490b-8dca-f709de9902b2'::uuid, 'Direito do Trabalho'),
  ('d96a1860-08c0-483c-b67d-6a94bafe74df'::uuid, 'Direito Administrativo'),
  ('d9b1df9b-6b68-4d38-9066-737c32c16f75'::uuid, 'Outras'),  -- antes: Direito Internacional e Migração, baixa confiança -> Outras
  ('d9da2382-5665-427a-9b4d-4583f2143d1e'::uuid, 'Direito Civil'),
  ('da52221f-4440-4597-b3f1-776311412461'::uuid, 'Direito do Trabalho'),
  ('db4e71ba-87cc-4d61-b675-69039fc75fc1'::uuid, 'Ética Profissional'),
  ('dc239ded-4316-4a7c-9955-85c0bb792ecc'::uuid, 'Direito Processual Civil'),
  ('ddd50954-975e-42d9-a7c1-1a01cae41965'::uuid, 'Direito Internacional e Migração'),
  ('de0823ee-8e22-4fd1-a102-5ee06edd7db8'::uuid, 'Ética Profissional'),
  ('df2095b9-0d7f-49a3-be0f-f8b8b9080f29'::uuid, 'Direito Ambiental'),
  ('df7692ea-cf7c-4957-9b4a-c7fa6fc4f327'::uuid, 'Direito Empresarial'),
  ('df9e8a80-c424-4f42-97ba-dd8728152880'::uuid, 'Direito Civil'),
  ('e0b5f796-1b13-4626-9144-b9c7604e8be1'::uuid, 'Direito Tributário'),
  ('e0f23057-bf82-4ca2-aa3e-2b7f2f2c9e9f'::uuid, 'Outras'),  -- antes: Direito Constitucional, baixa confiança -> Outras
  ('e142f95e-6339-46e8-b87a-627643995f0f'::uuid, 'Outras'),  -- antes: Direito Processual do Trabalho, baixa confiança -> Outras
  ('e2ae1f3b-4e11-4739-ae41-211ecfb0ae02'::uuid, 'Filosofia do Direito e Direitos Humanos'),
  ('e2f78014-2b5a-46c6-b3e8-22125a0ad98e'::uuid, 'Direito Civil'),
  ('e39744c4-802e-43b1-96f4-eafce14ed0c9'::uuid, 'Filosofia do Direito e Direitos Humanos'),
  ('e3cac204-d9be-464c-92fd-3cf5207bf3e3'::uuid, 'Direito Civil'),
  ('e3d39903-fa0f-45ff-a65d-8b22e1d45ab1'::uuid, 'Direito Processual Civil'),
  ('e40ab96b-c114-40e6-866f-72ade325765d'::uuid, 'Direito Civil'),
  ('e45094de-f3ee-4841-963a-8a41bff8683f'::uuid, 'Direito Civil'),
  ('e4699ef9-c690-40f7-9893-c3797a73da7c'::uuid, 'Direito Empresarial'),
  ('e961a6f9-0263-472b-a398-02ca2acb9a93'::uuid, 'Direito Constitucional'),
  ('e9686283-dbbc-4cd1-bad8-06725862ceca'::uuid, 'Direito Civil'),
  ('ea8a725b-65d1-477e-919d-6bc0f8c26d02'::uuid, 'Direito Constitucional'),
  ('ec5d7273-a592-4a68-9992-0fbdf65fdbc0'::uuid, 'Direito Empresarial'),
  ('ecbef69f-e733-4b9e-b094-b85aff5a18a9'::uuid, 'Direito Administrativo'),
  ('edfdbdc3-44c6-42d2-bcdc-39999bac2e58'::uuid, 'Direito Constitucional'),
  ('ee359a39-d335-42c7-8bc9-0f748a8c3590'::uuid, 'Direito Constitucional'),
  ('ee9e8ec2-cbf4-49fd-9810-421fb219c443'::uuid, 'Direito Constitucional'),
  ('eee27d7b-ecdc-42ed-9953-7c620e79057e'::uuid, 'Direito Constitucional'),
  ('f574bb92-b36e-437c-91dd-933aa5c92272'::uuid, 'Direito Constitucional'),
  ('f6979f23-f1c3-4bc2-859b-0eed69167403'::uuid, 'Ética Profissional'),
  ('f6aea5d3-198b-4573-bdf6-f613b447231c'::uuid, 'Direito Constitucional'),
  ('f866accf-12a2-40ff-b7d0-9b1443dcb4b3'::uuid, 'Direito Internacional e Migração'),
  ('fa85707f-37f4-4f39-b301-462aadaf4070'::uuid, 'Direito Processual Civil'),
  ('fabd2765-7d32-4310-bac9-fb70751d9d4d'::uuid, 'Direito Internacional e Migração'),
  ('fc4f4f82-d61c-4044-a261-87c9a928e9c6'::uuid, 'Direito Civil'),
  ('fd790164-7f6f-42d4-ab7b-77d7243e7559'::uuid, 'Direito Civil'),
  ('ff98dee6-5305-4521-8058-d9198761f53b'::uuid, 'Ética Profissional'),
  ('ffd92a40-0354-40b6-a599-8aad4fea6c37'::uuid, 'Direito Constitucional'),
  ('fffdc588-a46f-4fdf-a622-04ddd0d128e0'::uuid, 'Direito Constitucional')
) as v(id, discipline)
where q.id = v.id
  and q.discipline is null;

commit;

-- Conferência DEPOIS: deve sobrar 0
select count(*) as sem_disciplina_depois from oab_questions where discipline is null;

-- Quantas foram pra "Outras" — deve bater com 26
select count(*) as total_outras from oab_questions where discipline = 'Outras';

