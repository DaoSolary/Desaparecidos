# Base de Dados de Pessoas Desaparecidas

Plataforma nacional para publicação, investigação e colaboração em casos de desaparecimento. Este monorepo reutiliza a stack do projeto **Segurança Escolar** e a estende para atender funcionalidades de publicação pública, alertas por proximidade, inteligência de dados e operações de campo.

## Estrutura

- `backend/` API Node.js/Express + Prisma/PostgreSQL + Socket.IO + Firebase Admin.
- `web/` aplicação React + Vite + Tailwind para cidadãos, familiares e autoridades.
- `mobile/` app React Native 0.72 com push notifications, mapa e check-ins de campo.

## Principais Casos de Uso

1. Cadastro/autenticação de cidadãos, familiares, voluntários e autoridades.
2. Publicação completa de pessoas desaparecidas com fotos, prioridade e status em tempo real.
3. Pesquisa avançada por nome, localização, género, faixa etária ou data.
4. Página detalhada com histórico de atualizações, avistamentos e botão de reporte.
5. Sistema de alertas multi-canal (push/app/email) com segmentação geográfica.
6. Geolocalização com heatmap, rotas recomendadas e check-ins de voluntários.
7. Canal de comunicação (chat privado/anónimo) e workflow de validação familiar.
8. Inteligência de dados para identificar padrões, zonas críticas e estatísticas.

## Scripts Importantes

- `backend`: `npm run dev`, `npm run db:migrate`, `npm run db:seed`.
- `web`: `npm run dev`, `npm run build`.
- `mobile`: `npm run android`/`npm run ios`.

Consulte cada diretório para instruções específicas. Configure variáveis de ambiente a partir de `backend/env.example` e equivalentes no web/mobile para integrar mapas, Firebase e serviços de AI.


