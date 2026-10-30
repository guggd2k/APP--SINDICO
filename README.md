# Gestão Condominial

Aplicação web responsiva, preparada para instalação como PWA, para a rotina de síndicos e equipes de manutenção em vários condomínios.

## Requisitos

- Node.js 20.9 ou superior
- npm

## Executar

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. Sem configurar o Supabase, é possível usar a demonstração local. Ao configurar a autenticação e entrar com uma conta, condomínios, visitas, manutenções, estoque e fotos são carregados e sincronizados com o Supabase.

Use `npm run lint` para verificar o código e `npm run build` para gerar a versão de produção.

## Contas individuais

Configure o Supabase Auth para ativar cadastro e login com e-mail e senha para cada síndico:

1. Copie `.env.example` para `.env.local`.
2. Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` com a URL e a chave publicável (anon) do projeto Supabase. Nunca use a chave `service_role` no navegador.
3. Aplique, em ordem, as migrações `supabase/migrations/0001_initial_schema.sql` e `supabase/migrations/0002_cloud_data_and_photos.sql`. A segunda migração também atualiza bancos que já aplicaram a primeira versão do esquema.
4. Habilite cadastro por e-mail no Supabase e reinicie `npm run dev`.

Sem essas variáveis, a tela permite entrar apenas na demonstração local. Com login, o usuário só lê dados dos condomínios em que está cadastrado. A criação do primeiro condomínio é feita pela função protegida `create_condo_for_current_user`.

## O que já está no protótipo

- Visão geral do dia e alternância entre condomínios.
- Cadastro de condomínios com busca de endereço pelo CEP (ViaCEP), preenchimento de logradouro, bairro e cidade, e inclusão de número e complemento.
- Visitas diárias com data e horário, responsável, atividades, áreas verificadas, pontos de atenção, observações e registro fotográfico obrigatório.
- Agenda semanal de manutenções, com data, horário, duração, equipe responsável, fotos obrigatórias e prevenção de conflito de horário.
- Abertura e atualização de solicitações de manutenção.
- Consulta de materiais e movimentação de estoque.
- Relatórios resumidos do condomínio selecionado.
- Layout adaptável e manifesto PWA.

Com Supabase configurado, os registros são sincronizados com o banco PostgreSQL e as fotos são guardadas em um bucket privado, com acesso por associação ao condomínio. A demonstração local armazena as fotos no IndexedDB e mantém os registros apenas neste dispositivo.

Registros antigos de visitantes salvos no navegador são preservados no histórico local durante a atualização, mas não aparecem como visitas diárias.

## Supabase

As migrações `0001_initial_schema.sql` e `0002_cloud_data_and_photos.sql` definem as tabelas, políticas RLS por condomínio e bucket privado para os registros fotográficos. A função `create_condo_for_current_user` cria um condomínio e associa o usuário autenticado como síndico. O saldo de estoque muda por movimentações registradas; as políticas e permissões impedem alterações diretas no saldo.

O Supabase precisa estar configurado e as migrações precisam ser aplicadas antes de usar contas e sincronização. Os dados já salvos anteriormente no modo de demonstração permanecem locais e não são enviados automaticamente para uma conta.

Nunca use a chave `service_role` no navegador. A chave `anon` não substitui as políticas de Row Level Security.
