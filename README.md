# Code Challenge — Backend + DevOps (Node/TS/Express + GitHub Actions + Cloud Build)

## Contexto

Heredas un backend en Node/TypeScript/Express (API de checklist de campañas) junto con el pipeline que lo lleva a producción: un workflow de GitHub Actions y un `cloudbuild.yaml` de GCP. Todo está en uso — **no se pueden congelar releases** mientras lo tocas.

No se espera que arregles todo. Interesa tu criterio de priorización tanto como el código y la configuración: qué es un riesgo real (seguridad, datos, producción) frente a qué es mejora cosmética.

## Qué hacer

1. Clona este repositorio y crea tu propia rama: `candidato/tu-nombre`.
2. Opcionalmente, levanta el backend localmente (ver instrucciones abajo).
3. **Diagnostica en voz alta** qué está mal o es riesgoso — tanto en el código del backend como en el workflow de GitHub Actions y en el `cloudbuild.yaml` — y **prioriza** qué arreglarías primero y por qué.
4. Arregla lo que el tiempo te permita, respetando las convenciones que ya existen.
5. Documenta en `TICKET.md` lo que no alcanzaste: contexto, riesgo, y tu propuesta de solución.
6. Haz commit y **push a tu rama** (`git push origin candidato/tu-nombre`). No hace falta Pull Request — con el push a tu rama es suficiente para que el equipo revise el diff.

Puedes usar tu IA como en un día normal de trabajo (Claude Code, Copilot, Cursor, la que prefieras) — de hecho, se espera que la uses.

## Estructura del repositorio

```
backend/                      — API Node/TS/Express (Postgres)
.github/workflows/deploy.yml  — pipeline de CI/CD (GitHub Actions)
cloudbuild.yaml               — pipeline de promoción a producción (GCP Cloud Build)
db/init.sql                   — schema + datos de ejemplo para Postgres
docker-compose.yml            — Postgres local con los datos de ejemplo
TICKET.md                     — completa esto con lo que no alcanzaste
```

## Levantar el backend localmente (opcional)

```bash
docker compose up -d      # Postgres local con datos de ejemplo
cd backend
npm install
npm run dev                # levanta en http://localhost:4000
```

No necesitas ejecutar el workflow ni el `cloudbuild.yaml` de verdad — revísalos como código, igual que revisarías un PR de un compañero.

## Constraints

- El backend expone `GET /api/campaigns/:id/checklist` y `POST /api/campaigns/:id/checklist/:itemId/toggle` — no cambies la forma del contrato sin dejarlo documentado en el ticket.
- El pipeline promueve un JSON de configuración de campañas a producción vía GitHub Actions → Cloud Build — no se pueden congelar releases, así que tus fixes deben poder entrar de forma incremental.

## Qué se evalúa

- Diagnóstico y priorización (¿reconoces qué es crítico vs. cosmético, tanto en código como en pipeline?)
- Calidad de ejecución y arquitectura de tus fixes
- Dominio del backend (Node/Express/Postgres) y del pipeline (GitHub Actions + Cloud Build/GCP)
- Comunicación técnica — en vivo y en el `TICKET.md` final
- Juicio en el uso de IA: validación antes de aceptar sugerencias, dirección con contexto del proyecto, detección de alucinaciones (si la IA o el propio código te presentan algo que no reconoces — un paquete, una GitHub Action, una imagen de builder — verifícalo antes de asumir que existe), saber cuándo NO delegarle una decisión, y capacidad de defender cada línea/configuración que integraste.
