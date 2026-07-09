# Capa de validadores

Validación de la entrada de cada endpoint con **zod**. Un validador por dominio:
`letterValidator.js`, `cvValidator.js`, `interviewValidator.js`…

Responsabilidades:
- Definir esquemas zod para los payloads (`safeParse`) y devolver datos ya
  tipados/limpios, o un error de validación claro.
- Reemplazar los `if (!campo) return 400` dispersos por un único punto declarativo.

Uso típico en el controlador:

```js
const parsed = letterGenerateSchema.safeParse(req.body);
if (!parsed.success) return fail(res, 'Datos inválidos', 400, 'VALIDATION_ERROR');
const data = parsed.data;
```

Requiere la dependencia `zod` (ver package.json). Instalar con `npm install`.
