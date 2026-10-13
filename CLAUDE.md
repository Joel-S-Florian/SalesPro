# FACTOS (salespro-v2): reglas del proyecto para Claude

## Cómo conversar con Joel

- Responde en **español**, directo y sin relleno.
- **Al terminar cada respuesta, haz una pregunta interactiva** con la herramienta `AskUserQuestion` (no una pregunta suelta en el texto) que sugiera cómo seguir y evite que
  la conversación se estanque: continuar con lo actual, otra tarea pendiente, hacer **commit** (por tema) o **push**, probar/verificar algo, o «otra cosa». Pon primero la opción
  recomendada. Detalle y reglas: skill `siguiente-paso` (`.claude/skills/siguiente-paso/SKILL.md`).
- Incluye siempre la opción **«Parar de preguntar»**: si Joel la elige, no vuelvas a hacer esas preguntas hasta que él lo reactive explícitamente (ni siquiera después de un /compact).
- **No hagas commit ni push** sin que Joel lo pida; ofrécelo como opción.
- No toques sus otros proyectos. Los puertos de FACTOS son suyos: API 4010, web 5180, landing 5190 (para pruebas usa otros, p. ej. 3999/5199/4091).
- Mantén la documentación de `Doc/` al día cuando cambies algo que ya está documentado.

## Convenciones técnicas

- Monorepo: `apps/api` (Express + Prisma, multi-empresa por `companyId`), `apps/web` (React + Vite + Tailwind), `apps/landing`, `prisma/`, `scripts/`, `Doc/`.
- Tablas nuevas por empresa: añadirlas a `TENANT_MODELS` en `apps/api/src/config/db.js`. Los `create` anidados deben llevar `companyId` explícito.
- Validadores zod de rutas: usar la forma plana `{ body, params, query }`; la forma `z.object({ body })` **no se ejecuta**.
- Migraciones en esta máquina: `prisma migrate diff --from-schema-datasource … --script` a una carpeta nueva + `migrate deploy`; `prisma generate` exige detener el API de 4010 y reiniciarlo.
- Selectores: **no uses `<select>` nativo**; usa `components/ui/SmartSelect.jsx` (acepta `<option>` como hijos; búsqueda y carga de 8 en 8).
- Pruebas: `npx vitest run` en `apps/api`; scripts de integración en `scripts/test-*.mjs` (`node --env-file=apps/api/.env …`); limpian sus datos.
