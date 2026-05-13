# Fluxos operacionais

## Login de gerente

1. Usuario acessa `/login`.
2. Frontend formata CPF e envia CPF sem pontuacao para `/api/auth/login`.
3. API busca `Workers` por CPF.
4. API aceita somente `userType === 0`.
5. API valida senha.
6. API grava cookie `auth_token` e retorna objeto `user`.
7. Frontend salva `user` no `localStorage`.
8. Usuario e enviado para `/`.

## Carregamento do dashboard

1. `Layout` e `HomePage` leem `localStorage.user`.
2. Ambos buscam `/api/user?id={id}` para enriquecer dados.
3. Dashboard carrega materiais e trabalhadores.
4. Apos materiais, carrega estoque.
5. Em paralelo/reativo, carrega ganhos, coletas, preco e aniversariantes.
6. Filtros de material/trabalhador/periodo disparam novas consultas.

## Criar usuario

1. Gerente abre `/manage-workers`.
2. Pagina carrega cooperativas e todos os usuarios.
3. Gerente abre modal `Novo Usuario`.
4. Frontend valida campos obrigatorios e senha.
5. Envia `POST /api/users/create`.
6. API valida CPF/PIS/RG/datas/tipo/cooperativa.
7. API bloqueia CPF duplicado.
8. API cria `Workers`.
9. Frontend recarrega lista.

## Editar usuario

1. Gerente seleciona usuario em `/manage-workers`.
2. Modal e preenchido com dados existentes.
3. Frontend valida campos.
4. Envia `POST /api/users/update`.
5. API atualiza dados e senha se enviada.
6. Frontend recarrega lista.

## Excluir usuario

1. Gerente confirma exclusao.
2. Frontend envia `POST /api/users/delete`.
3. API verifica existencia.
4. API conta vendas, medicoes e contribuicoes vinculadas.
5. Se houver uso, bloqueia exclusao.
6. Se nao houver uso, remove worker.

## Criar material

1. Gerente abre `/materials`.
2. Frontend carrega `/api/materials`.
3. Gerente preenche material e grupo.
4. API bloqueia material duplicado.
5. API reutiliza/cria grupo.
6. API cria material.
7. Frontend recarrega lista.

## Excluir material

1. Gerente confirma exclusao.
2. API verifica material.
3. API conta uso em medicoes, vendas, estoque e contribuicoes.
4. Se houver uso, bloqueia exclusao.
5. Se nao houver uso, remove material.

## Criar venda

1. Gerente abre `/sales`.
2. Frontend carrega vendas, materiais, cooperativas, estoque e compradores.
3. Frontend le cooperativa do gerente em `localStorage.user`.
4. Gerente preenche material, peso, preco, data e comprador.
5. Frontend verifica estoque pelo nome do material.
6. Envia `POST /api/sales`.
7. API valida JWT e identifica gerente.
8. API valida material, peso, preco, data e comprador.
9. API cria comprador se necessario.
10. API verifica estoque da cooperativa do gerente.
11. API cria `Sales`.
12. API atualiza `Stock`.
13. Frontend recarrega vendas e estoque.

## Editar venda

1. Gerente seleciona venda em `/sales`.
2. Frontend envia `PUT /api/sales/[id]`.
3. API valida JWT.
4. API exige que `responsible` da venda seja o gerente autenticado.
5. API impede trocar material.
6. API recalcula estoque considerando peso antigo e novo.

## Excluir venda

1. Gerente confirma exclusao.
2. API valida JWT.
3. API exige que `responsible` seja o gerente autenticado.
4. API remove venda.
5. API devolve peso ao estoque e reduz total vendido.

## Recalcular contribuicoes

1. No dashboard, gerente aciona recalc.
2. Frontend exige `user.userType === 0`.
3. Envia `POST /api/recalculate-contributions`.
4. API recalcula a partir de todas as medicoes.
5. API apaga `Worker_contributions`.
6. API regrava contribuicoes semanais.
7. Frontend tenta mostrar total processado e recarrega a pagina.

## Diagnosticar dados

1. No dashboard, gerente aciona debug.
2. Frontend exige `user.userType === 0`.
3. Envia `GET /api/debug/check-data`.
4. API retorna contagens e amostras de catadores, medicoes, contribuicoes e materiais.
5. Frontend mostra resumo textual.
