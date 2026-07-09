# Equipo de agentes de EmpleaIA

Definiciones de subagentes por rol para usar con **Claude Code**.

## Cómo activarlos

Los agentes de Claude Code se leen desde `.claude/agents/`. Copia estos archivos ahí:

```bash
# desde la raíz del proyecto
mkdir -p .claude/agents
cp dev-team-agents/*.md .claude/agents/
```

(No pude escribirlos directamente en `.claude/` porque es una carpeta protegida en la sesión; por eso quedaron aquí.)

Luego, en Claude Code, puedes verlos y gestionarlos con el comando `/agents`, o invocarlos pidiendo por su rol (p. ej. "usa el backend-engineer para…").

## Roles

- **tech-lead** — arquitectura, convenciones y planificación. Diseña, no implementa features grandes.
- **backend-engineer** — implementa el backend (rutas, servicios, repositorios, validadores).
- **frontend-engineer** — implementa el frontend React + Vite.
- **qa-engineer** — escribe y ejecuta tests; monta la red de seguridad antes de refactorizar.
- **code-reviewer** — revisa diffs (seguridad, integridad, SRP, calidad). Solo lectura.

## Notas

- Cada agente arranca sin memoria de conversaciones previas: dale contexto claro en el encargo.
- Úsalos para trabajo acotado y paralelizable (revisar, planificar, implementar un módulo). Para cambios triviales, es más rápido hacerlo directo.
- El modelo sugerido va en el frontmatter (`model:`); ajústalo según tu plan.
