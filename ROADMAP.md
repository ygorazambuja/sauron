# Roadmap

## Prioridades

1. Plugin system para geradores (core + plugins de `fetch`, `angular`, futuros `axios`, `react-query`)
2. Geração modular (models por arquivo + barrel, e organização por domínio quando aplicável)
3. Autenticação configurável no cliente HTTP (Bearer, API Key, hooks para OAuth2)
4. Comando `diff`/`breaking-changes` entre duas specs

## Outras Features (sem ordem)

- Suporte completo a `oneOf`, `anyOf`, `allOf` e `discriminator`
- `--strict` para falhar quando houver `any` gerado
- Entrada por URL (`--url`) com cache local
- Estratégia configurável de nomes de métodos (ex: `operationId`, path-based, custom)
- `--watch` para regeneração contínua
- Publicação oficial no NPM (CLI global + versionamento semântico)
