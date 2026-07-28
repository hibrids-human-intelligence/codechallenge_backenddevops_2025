# TICKET — Pendientes del reto

> Completa esta plantilla con lo que **no** alcanzaste a resolver. Para cada ítem: contexto (qué está mal y dónde), riesgo (qué pasa si no se arregla), y tu propuesta de solución (aunque no la hayas implementado).

## Pendiente 1 — Secretos hardcodeados en el código y en CI

**Contexto:**

`backend/.env` contiene credenciales en texto plano (`DATABASE_URL` con password, `JWT_SECRET`, `FIREBASE_PRIVATE_KEY`). El paso "Set environment variables" de `.github/workflows/deploy.yml` (líneas 28-32) repite el patrón: expone `DATABASE_URL` de producción, un `JWT_SECRET` hardcodeado y un `GCP_SA_KEY` completo directamente en el YAML. Además, `backend/src/middleware/auth.ts:5` define un fallback hardcodeado (`'supersecret123'`) para `JWT_SECRET` si la variable de entorno no está seteada.

**Riesgo:**

Cualquiera con acceso al repo (o al historial de git) obtiene credenciales de producción: DB, JWT signing key y la service account key de GCP. Con el `JWT_SECRET` se pueden forjar tokens válidos; con el `GCP_SA_KEY` se puede operar sobre la infraestructura de GCP. El fallback en `auth.ts` es especialmente peligroso: si en algún ambiente `JWT_SECRET` no está seteado, el sistema cae silenciosamente a un secreto público y conocido.

**Propuesta de solución:**

Migrar todos los secretos a un secret manager (GCP Secret Manager, ya que el pipeline usa GCP; o Vault/AWS Secrets Manager según el proveedor final). El backend debe leerlos en runtime (vía SDK o inyección de env vars desde el secret manager al arrancar el contenedor), nunca desde archivos versionados ni desde el YAML del workflow. En CI, usar GitHub Actions secrets (`${{ secrets.X }}`) como mínimo, y preferentemente Workload Identity Federation para autenticar a GCP sin exponer una service account key. Eliminar el fallback hardcodeado en `auth.ts`; si `JWT_SECRET` no está seteado, la app debe fallar al arrancar (fail-fast), no degradar a un valor conocido.

---

## Pendiente 2 — `.env` versionado en git

**Contexto:**

`backend/.gitignore` solo excluye `node_modules/`, `dist/`, `*.log` y `.DS_Store`. No incluye `.env`. Confirmé con `git ls-files` que `backend/.env` está efectivamente trackeado y commiteado en el repositorio.

**Riesgo:**

Los secretos del Pendiente 1 no solo están en el working directory: quedaron en el historial de git, accesible a cualquiera con clone del repo, aunque se borre el archivo en un commit futuro (seguiría en el historial).

**Propuesta de solución:**

Agregar `.env` (y variantes como `.env.local`, `.env.*.local`) a `backend/.gitignore`. Remover `.env` del tracking (`git rm --cached backend/.env`). Rotar todas las credenciales que estuvieron expuestas (DB password, JWT secret, Firebase key), ya que quitarlas del historial no invalida lo que ya fue expuesto. Proveer un `.env.example` con las claves sin valores reales, para onboarding.

---

## Pendiente 3 — Workflow de deploy incompleto

**Contexto:**

`.github/workflows/deploy.yml` hace checkout, install, test, build, "promueve config", autentica contra GCP y dispara `gcloud builds submit`. Ese último paso construye la imagen según `cloudbuild.yaml`, pero no hay ningún paso que efectivamente despliegue esa imagen sobre la infraestructura (p. ej. `gcloud run deploy`, `kubectl apply`, o el paso equivalente de `cloudbuild.yaml` si delega el deploy ahí — no queda explícito en el workflow).

**Riesgo:**

El pipeline da la falsa sensación de que un push a la rama dispara un release completo, pero en la práctica el build queda armado sin promoción al ambiente destino. Esto puede generar despliegues manuales fuera de proceso (sin auditoría, sin rollback consistente) o directamente la percepción de que "el CI ya deployó" cuando no fue así.

**Propuesta de solución:**

Agregar el paso explícito de despliegue al final del workflow (p. ej. `gcloud run deploy <service> --image <imagen> --region <region>` si es Cloud Run, o el manifiesto correspondiente si es GKE/otro). Idealmente separar el workflow en jobs `build` → `deploy` con un environment de GitHub (`environment: production`) que permita gates de aprobación, y agregar un paso de verificación post-deploy (health check) antes de marcar el run como exitoso.

---

## Pendiente 4 — Falta de autorización (IDOR) en `/campaigns/:id/checklist`

**Contexto:**

`router.get('/campaigns/:id/checklist', ...)` en `backend/src/routes/campaigns.ts:13` consulta el checklist de una campaña usando directamente el `:id` de la URL, sin validar que el usuario autenticado tenga acceso a esa campaña. Esto se agrava por un bug adicional que encontré: en `backend/src/index.ts:11-12`, `campaignsRouter` se monta *antes* que `requireAuth` (`app.use('/api', campaignsRouter)` en la línea 11, `app.use('/api', requireAuth)` en la línea 12). En Express el orden de `app.use` determina el orden de ejecución de middlewares, por lo que `requireAuth` nunca llega a ejecutarse para las rutas de `campaignsRouter`: hoy el endpoint está completamente abierto, sin autenticación.

**Riesgo:**

Cualquiera (autenticado o no) puede enumerar `:id` y leer el checklist de campañas ajenas — exposición de datos de otros clientes/campañas (IDOR). Es un hallazgo más severo que "debería ser POST": el método HTTP no es la causa raíz del problema.

**Propuesta de solución:**

1. Corregir el orden de middlewares en `index.ts` para que `requireAuth` se aplique antes del router de campaigns.
2. Agregar una verificación de autorización a nivel de objeto (ownership check): validar que la campaña `:id` pertenece al usuario/tenant del token antes de devolver el checklist, no solo que el token sea válido.
3. Nota sobre la propuesta original de cambiar el verbo a POST: cambiar `GET` por `POST` por sí solo **no** mitiga un IDOR (el `id` seguiría llegando sin validación de pertenencia, ya sea por query param, path o body); sí puede ser razonable si el objetivo es evitar que el `id` quede en logs de acceso/proxies o en el historial del navegador, pero la causa raíz a resolver es la autorización faltante, no el método HTTP.

---

## Pendiente 5 — Sin ORM: SQL manual con riesgo de inyección

**Contexto:**

El acceso a datos usa `pg` directo (`pool.query`) sin ORM/query builder. El caso GET (línea 17-20) sí usa placeholders parametrizados (`$1`), pero `router.post('/campaigns/:id/checklist/:itemId/toggle', ...)` (líneas 27-40) arma la query por interpolación de strings directamente sobre `id`, `itemId` y `done` (template literal en las líneas 31-35), sin parametrizar.

**Riesgo:**

El endpoint de toggle es vulnerable a inyección SQL: un `itemId` o `id` malicioso permite modificar o filtrar datos arbitrarios de la base, además de que un `done` no validado como boolean podría inyectarse igual. Es explotable sin necesitar el bug de autenticación del Pendiente 4, pero se combina con él (endpoint hoy sin auth real).

**Propuesta de solución:**

Corto plazo: parametrizar la query del toggle igual que se hizo en el GET (usar `$1`, `$2`, `$3` con `pool.query(text, params)`), y validar `done` como boolean antes de usarlo. Mediano plazo: introducir un ORM/query builder (p. ej. Prisma o Knex, dado que el proyecto es TypeScript) para que la parametrización sea la ruta por defecto y no dependa de la disciplina de cada desarrollador, además de ganar migraciones versionadas y tipado de esquema.

---

## Notas adicionales / supuestos que tomaste

- Los valores de `backend/.env` presentes en el repo (`Sup3rSecret2024`, la private key de Firebase, etc.) parecen ser fixtures/fakes para el challenge, pero se documentan igual como si fueran reales dado que ese es justamente el riesgo a comunicar: en un repo real no hay forma de distinguir "secreto de prueba" de "secreto real" una vez está commiteado, y el hábito correcto es el mismo en ambos casos.
- No se implementó ninguna de las soluciones propuestas arriba; este documento es solo el registro de hallazgos y propuestas, tal como pide la plantilla.
