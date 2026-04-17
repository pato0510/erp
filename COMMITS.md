# Convencion de commits

Este proyecto sigue la convencion de [Conventional Commits](https://www.conventionalcommits.org/).

## Formato

```
tipo(scope): descripcion breve en ingles
```

## Tipos permitidos

| Tipo | Uso |
|------|-----|
| `feat` | Nueva funcionalidad |
| `fix` | Correccion de bugs |
| `chore` | Tareas de mantenimiento (deps, config, CI) |
| `refactor` | Cambio de codigo que no agrega funcionalidad ni corrige bugs |
| `test` | Agregar o modificar tests |
| `docs` | Cambios en documentacion |

## Scope

El scope corresponde al modulo o area afectada. Ejemplos:

- `iam` — autenticacion, sesiones, usuarios
- `tenancy` — multi-empresa, membresías
- `banking` — integracion bancaria
- `tax` — integracion SII/fiscal
- `movements` — movimientos financieros
- `cashflow` — caja, tesoreria, compromisos
- `ui` — componentes de UI compartidos
- `infra` — infraestructura, Docker, CI/CD

## Ejemplos

```
feat(iam): add JWT auth with HttpOnly cookie
fix(banking): handle timeout on bank sync retry
chore(infra): update Docker base image to node 20
refactor(movements): extract reconciliation logic to service
test(cashflow): add unit tests for projection calculator
docs(api): document REST endpoints for banking module
```

## Ramas

Las ramas siguen el formato:

```
feature/TICKET-ID-descripcion
```

Ejemplo:

```
feature/ARC-002-nx-monorepo-setup
```
