# TICKET — Pendientes del reto

> Completa esta plantilla con lo que **no** alcanzaste a resolver. Para cada ítem: contexto (qué está mal y dónde), riesgo (qué pasa si no se arregla), y tu propuesta de solución (aunque no la hayas implementado).

## Pendiente 1 — SQL Injection en `POST .../toggle`

**Contexto:**  
En `backend/src/routes/campaigns.ts`, el handler `POST /campaigns/:id/checklist/:itemId/toggle` construye el SQL con interpolación de strings:

```ts
SET done = ${done}
WHERE campaign_id = '${id}' AND item_id = '${itemId}'
```

`id`, `itemId` y `done` llegan del cliente (`req.params` / `req.body`) y se insertan crudos en la query. El endpoint `GET` del mismo archivo sí usa placeholders (`$1`) — el `POST` no. Cualquier payload tipo `' OR 1=1 --` o un `done` no booleano puede alterar la sentencia.

**Riesgo:**  
SQL injection autenticada (el router está detrás de `requireAuth`). Un atacante con un JWT válido puede leer/modificar filas ajenas, alterar el schema o, según privilegios del rol de Postgres, comprometer la base de producción.

**Propuesta de solución:**  
Reescribir el `UPDATE` con queries parametrizadas, igual que el `GET`:

```ts
await pool.query(
  `UPDATE campaign_checklist_items
   SET done = $1
   WHERE campaign_id = $2 AND item_id = $3`,
  [Boolean(done), id, itemId]
);
```

Validar tipos (`done` booleano, IDs numéricos/UUID según el schema) antes de ejecutar. No cambiar el contrato HTTP del endpoint.

---

## Pendiente 2 — `npm install` en CI en lugar de install reproducible

**Contexto:**  
En `.github/workflows/deploy.yml`, el step "Install dependencies" ejecuta `npm install` sobre `backend/`. Existe `package-lock.json`, pero `npm install` puede resolver versiones distintas a las del lockfile según el momento del build. Además el script `test` en `package.json` es un no-op (`echo ... && exit 0`), así que CI “pasa tests” sin cobertura real.

**Riesgo:**  
Builds no deterministas: una dependencia transitiva nueva puede romper producción o introducir vulnerabilidades sin que el diff del repo lo muestre. Falsa sensación de calidad porque el job de tests siempre sale en verde.

**Propuesta de solución:**  
- Sustituir `npm install` por `npm ci` (falla si el lock no cuadra; instala exactamente lo lockeado).  
- Fijar `actions/checkout` y `actions/setup-node` a SHAs o tags estables (hoy checkout usa `@master`).  
- Añadir tests reales (al menos del toggle y del auth) o marcar el step como `continue-on-error` / quitarlo hasta que existan, para no mentir en el pipeline.

---

## Pendiente 3 — Imagen `:latest` en deploy a producción (Cloud Build)

**Contexto:**  
En `cloudbuild.yaml`, el deploy a Cloud Run usa:

```yaml
--image gcr.io/${PROJECT_ID}/cms-challenge-backend:latest
```

`latest` es un tag mutable: dos builds consecutivos pueden apuntar a digests distintos con el mismo nombre. No hay pin a digest (`@sha256:...`) ni tag inmutable (`$SHORT_SHA`, `$BUILD_ID`, semver).

**Riesgo:**  
Deploys no reproducibles, rollbacks ambiguos (“¿qué era latest hace una hora?”), y posibilidad de promover accidentalmente una imagen no validada si alguien retaguea `latest` en el registry.

**Propuesta de solución:**  
En el pipeline de build, tagear la imagen con el commit SHA / `$BUILD_ID` y desplegar esa referencia inmutable:

```bash
--image gcr.io/${PROJECT_ID}/cms-challenge-backend:${SHORT_SHA}
```

Idealmente pasar también el digest. Mantener `latest` solo como alias opcional de lectura, nunca como única fuente de verdad del deploy a prod.

---

## Pendiente 4 — Exposición / hardcodeo de credenciales

**Contexto:**  
Secretos aparecen en claro en varios sitios:

| Ubicación | Qué se vio |
|-----------|------------|
| `.github/workflows/deploy.yml` | `DATABASE_URL` con user/password, `JWT_SECRET`, JSON de service account escrito a `$GITHUB_ENV` y a `/tmp/key.json` |
| `cloudbuild.yaml` | Mismos `DATABASE_URL` y `JWT_SECRET` en `--set-env-vars` del Cloud Run |
| `backend/.env` | Credenciales locales (DB, JWT, Firebase private key) |
| `backend/.gitignore` | **No** ignora `.env` — riesgo de commit accidental |
| `backend/src/middleware/auth.ts` | Fallback `JWT_SECRET \|\| 'supersecret123'` si falta la env |

El workflow corre en `on: [push]` a cualquier rama, así que esos valores pueden filtrarse en logs de Actions.

**Riesgo:**  
Compromiso de DB de prod, forjado de JWTs, y abuso de la service account de GCP. Secretos en el historial de git/logs quedan expuestos aunque se borren después. El fallback del JWT hace que un misconfig en prod firme tokens con un secreto conocido.

**Propuesta de solución:**  
- Mover secretos a GitHub Actions Secrets / GCP Secret Manager (o Cloud Run `--set-secrets`).  
- Referenciarlos por nombre (`${{ secrets.DATABASE_URL }}`, `--update-secrets=DATABASE_URL=db-url:latest`).  
- Añadir `.env` a `.gitignore`; rotar cualquier secreto que haya estado en el repo.  
- Eliminar el fallback hardcodeado de `JWT_SECRET`: fallar al arrancar si no está definido.  
- No escribir la SA key a disco en el runner si se puede usar Workload Identity Federation.

---

## Pendiente 5 — CORS abierto (`cors()` sin origen)

**Contexto:**  
En `backend/src/index.ts`:

```ts
app.use(cors());
```

Sin `origin`, Express CORS refleja/permite cualquier Origin. La API autenticada por Bearer queda accesible desde cualquier sitio que pueda inducir al browser a enviar requests (y, con credenciales mal configuradas, ampliar la superficie).

**Riesgo:**  
Facilita ataques CSRF-like desde orígenes no confiables si el cliente guarda el token de forma accesible al JS, y abre la API a consumo no controlado desde frontends arbitrarios. En un CMS de campañas, datos sensibles de checklist quedan expuestos a cualquier origen.

**Propuesta de solución:**  
Restringir orígenes vía env, por ejemplo:

```ts
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') ?? [],
  methods: ['GET', 'POST'],
}));
```

En prod, solo los dominios del frontend conocido. Documentar la variable en el deploy (Cloud Run env / Secret Manager).

---

## Pendiente 6 — Error handling incompleto / inconsistente

**Contexto:**  
- En `POST .../toggle` (`campaigns.ts`) **no hay** `try/catch`: un fallo de Postgres o un body inválido termina en un crash no controlado (o en el default handler de Express sin JSON uniforme).  
- El `GET` sí captura errores y responde `500` genérico, pero no loguea el error real (dificulta operación).  
- No hay middleware global `app.use((err, req, res, next) => ...)`.  
- No se valida que `done` exista / sea boolean antes del UPDATE.  
- No se distingue `404` (campaign/item inexistente, `rowCount === 0`) de un update exitoso.

**Riesgo:**  
Respuestas 500 opacas o procesos caídos bajo carga/errores de DB; imposibilidad de diagnosticar incidentes; clientes que asumen éxito cuando `updated: 0`. Inconsistencia entre GET y POST dificulta contratos estables.

**Propuesta de solución:**  
- Envolver el `POST` en `try/catch` simétrico al `GET`.  
- Middleware de errores centralizado que loguee `err` (sin filtrar secretos) y responda `{ error: string }` con status adecuado.  
- Validar body (`done: boolean` requerido) → `400`.  
- Si `rowCount === 0` → `404`.  
- Opcional: librería tipo `zod`/`express-validator` para params y body.

---

## Notas adicionales / supuestos que tomaste

**Priorización que aplicaría si hubiera más tiempo (crítico → menor):**  
1. SQL injection (P1) + secretos en pipeline/cloudbuild (P4)  
2. Tag inmutable en prod (P3) + `npm ci` (P2)  
3. CORS (P5) + error handling (P6)  

**Otros hallazgos no listados como pendientes formales (cosméticos / deuda):**  
- `actions/checkout@master` es inestable; pin a versión/SHA.  
- Action de terceros `hibrids-actions/promote-config-action@v3` — habría que auditar qué hace antes de confiar en prod.  
- En `cloudbuild.yaml` el validador de `config/campaigns.json` está comentado (`config-validator:v2`) y luego se hace `gsutil cp` directo a prod: riesgo de promover JSON inválido.  
- `npm test` es un stub a propósito del reto; no debe considerarse señal de calidad.  
- Contrato de API (`GET` / `POST` de checklist) no se modificó; las propuestas anteriores preservan paths y shape de respuesta salvo status codes más precisos (`400`/`404`), que deberían documentarse si se implementan.

**Supuesto:** el entorno GCP/`fake-project` y las claves del challenge son deliberadamente ficticias para el ejercicio, pero el patrón de hardcodeo es el mismo que habría que eliminar en un repo real.
