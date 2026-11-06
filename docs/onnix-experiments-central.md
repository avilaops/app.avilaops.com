# ONNIX → Experiments → Central Ávila Ops

A central administrativa reutiliza o worker ONNX CPU existente no `apps-noclient`, sem criar outra instância de inferência.

## Fluxo

1. `avila-upscale-cpu.service` recebe somente imagens autenticadas em `127.0.0.1:3391`.
2. `avila-onnix-evidence.timer` executa o teste sintético e escreve `/data/onnix/latest.json` no volume persistente do Experiments, sem armazenar a imagem.
3. A API do Experiments oferece `GET /api/v1/onnix`, protegida pelo Bearer `LAB_API_TOKEN`.
4. A central acessa a API apenas pelo WireGuard `10.10.0.2 → 10.10.0.4:3300` em consulta server-side; o navegador só recebe os campos permitidos.
5. `/operacao/onnix` exige login de plataforma e papel `OWNER`.

## Variáveis de execução no app

- `EXPERIMENTS_PRIVATE_API_URL=http://10.10.0.4:3300`
- `EXPERIMENTS_API_TOKEN`: segredo do Experiments, fornecido por canal privado. Nunca incluir no Git ou no navegador.

O programa recusa qualquer endereço que não seja a URL HTTP privada exata acima (sem proxy aberto à internet). Caso a API não esteja acessível ou a credencial falte, exibe indisponibilidade, nunca um resultado fictício.

## Operação e rollout

1. Verificar evidência aprovada em `/data/onnix/latest.json`.
2. Garantir que a API do Experiments está vinculada a `10.10.0.4:3300`, além de `127.0.0.1:3300`, e protegida por firewall somente para `10.10.0.2`.
3. Configurar as variáveis no `.env.production` do `applications`, via transporte privado de segredos.
4. Confirmar que o app alcança a API pela VPN com Bearer sem expor o token.
5. Executar a CI e publicar a imagem da central; conferir `/operacao/onnix` como `OWNER` e rejeição de usuários não autorizados.
6. Validar o próximo ciclo do timer e sinalização de evidência com mais de 36 h.

Não há migração de banco, escrita na API do Experiments ou nova dependência Redis/BullMQ.

## Recuperação

A alteração da central é uma tela de leitura: se o Experiments cair, somente a tela ONNIX mostra indisponibilidade. Para rollback, reverter a versão do app e o binding adicional da API privada; preservar os arquivos de evidências e o serviço ONNIX existente.
