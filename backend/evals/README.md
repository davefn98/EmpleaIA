# Evaluación de «Sobre mí» en EmpleaIA

Los seis casos son perfiles sintéticos sin nombres, teléfonos, correos ni empleadores reales. Los ejemplos de referencia indican qué debería destacar un resumen. La evaluación llama al mismo servicio que usa el generador de CV, con datos en memoria y sin guardar documentos. Cada caso ejecuta **Generar** y **Regenerar** con la misma vacante. La segunda solicitud incluye el resumen anterior, como hace la aplicación.

```powershell
cd backend
node evals/cv-summary.mjs
node evals/cv-summary.mjs --live
```

El primer comando de Node simula respuestas repetidas, demasiado cortas o con afirmaciones sin respaldo. El segundo llama al modelo configurado en el servidor y consume 12 solicitudes. Ambos imprimen el texto que devolvió el modelo, el que terminó en el CV y los resultados de la evaluación. Un criterio incumplido produce un código de salida distinto de cero.

| Criterio | Comprobación |
| --- | --- |
| Adaptación | Las dos versiones mencionan los dos hechos esperados, usan vocabulario de la vacante y tienen al menos 16 palabras. Para el caso sin evidencia, el resultado esperado es un resumen vacío. |
| Variación | Los dos resúmenes finales difieren tras ignorar tildes, mayúsculas, espacios y puntuación. No aplica cuando faltan hechos para redactar. |
| Fidelidad | La prueba busca afirmaciones sin respaldo definidas por caso, cifras nuevas y cargos alterados. La ausencia de alertas solo cubre estas comprobaciones. También se debe leer el texto para valorar cualquier afirmación que no esté cubierta por los patrones. |

## Resultado de la primera ejecución

Una generación y una regeneración por caso. Se usó `gpt-4o-mini` en la evaluación en vivo. Las dos modalidades dieron el mismo resultado después de que el servidor validara y preparara el texto para el CV.

| Caso | Adaptación | Regeneración distinta | Alertas de fidelidad |
| --- | --- | --- | --- |
| Backend → Atención al Cliente | Cumple | Sí | Ninguna |
| Almacén → Asistente de logística | Falta la verificación de guías de despacho y el vínculo con inventario o entregas | No | Ninguna |
| Biblioteca → Asistente administrativo | Cumple | Sí | Ninguna |
| Backend → Backend Developer | Cumple el criterio automático | No | Ninguna |
| Proyecto académico → Practicante de análisis de datos | Falta la limpieza de datos y el uso de tablas dinámicas | No | Ninguna |
| Perfil sin evidencia → Auxiliar de farmacia | Deja el resumen vacío | No aplica | Ninguna |

En vivo, el modelo devolvió dos textos distintos en los cinco casos con evidencia. Después de la validación, solo dos casos mostraron un resumen distinto. Por ejemplo, en logística, las dos respuestas del modelo mencionaban las guías de despacho y conectaban la experiencia con el inventario. El servidor sustituyó ambas por el mismo resumen, que conservaba el registro de materiales pero perdía los otros detalles. En análisis de datos, una respuesta mencionaba registros duplicados y tablas dinámicas. El resumen final solo conservó la formación y Excel.

## Resultado después de ajustar el validador

El validador distingue entre las oraciones que declaran experiencia y las que expresan qué puede aportar la persona a la vacante. El resumen de respaldo recupera hasta dos hechos del historial laboral o académico y los prioriza por afinidad con la vacante.

| Criterio | Primera ejecución en vivo | Después del ajuste en vivo | Después del ajuste con respuestas simuladas |
| --- | --- | --- | --- |
| Adaptación en ambas versiones | 4 de 6 | 6 de 6 | 6 de 6 |
| Variación en los casos con evidencia | 2 de 5 | 5 de 5 | 5 de 5 |
| Sin alertas de fidelidad | 6 de 6 | 6 de 6 | 6 de 6 |

La última ejecución en vivo usó `gpt-4o-mini` y 12 solicitudes. En logística se conservaron las guías de despacho y la relación con inventario y entregas en ambas versiones. En primer empleo, el respaldo conservó la limpieza de registros duplicados y las tablas dinámicas de Excel. En ese caso las dos versiones comparten el hecho académico y difieren en la frase que lo conecta con el puesto. El perfil de farmacia sin evidencia mantuvo vacío el resumen. Se ampliaron los patrones de la rúbrica para reconocer «atención de consultas» como equivalente a «atender consultas» y detectar afirmaciones de estudios en curso o mantenimiento que las fuentes de esos casos no acreditaban.
