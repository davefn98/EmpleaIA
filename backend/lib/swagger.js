import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'EmpleaIA API',
      version: '1.0.0',
      description: 'API para gestión de perfil, generación de documentos, entrevistas simuladas, métricas y recursos personalizados.'
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Servidor de Desarrollo Local'
      }
    ],
    components: {
      schemas: {
        Profile: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', description: 'ID único del perfil del usuario (Supabase auth.uid)', example: '730f4e3d-804d-47df-8bf9-ae82926b457e' },
            first_name: { type: 'string', description: 'Nombres del candidato', example: 'David Francisco' },
            last_name: { type: 'string', description: 'Apellidos del candidato', example: 'Yparraguirre Bravo' },
            email: { type: 'string', format: 'email', description: 'Correo electrónico', example: 'david.yparrab@gmail.com' },
            phone: { type: 'string', description: 'Número de teléfono de contacto', example: '944038550' },
            career: { type: 'string', description: 'Carrera o área de estudio técnica', example: 'Computación e Informática' },
            target_role: { type: 'string', description: 'Puesto u objetivo laboral al que postula', example: 'Líder Técnico' },
            target_job_description: { type: 'string', nullable: true, description: 'Descripción completa de la vacante objetivo, conservada sin resumir ni transformar', example: 'Funciones:\n- Liderar el equipo técnico\n\nRequisitos:\n- React y PostgreSQL' },
            bio: { type: 'string', description: 'Resumen profesional o biografía breve', example: 'Estudiante técnico de Computación e Informática aspirando a desempeñarse como Líder Técnico.' },
            technical_skills: { type: 'array', items: { type: 'string' }, description: 'Lista de lenguajes, frameworks o tecnologías dominadas', example: ['.NET', 'React', 'SQL', 'PostgreSQL'] },
            soft_skills: { type: 'array', items: { type: 'string' }, description: 'Lista de habilidades blandas y metodologías de gestión', example: ['Scrum', 'Liderazgo', 'Trabajo en equipo'] }
          }
        },
        ImportedCVProfile: {
          type: 'object',
          properties: {
            full_name: { type: 'string', example: 'David Francisco Yparraguirre Bravo' },
            email: { type: 'string', format: 'email', example: 'david.yparrab@gmail.com' },
            phone: { type: 'string', example: '944038550' },
            location: { type: 'string', example: 'Lima, Perú' },
            career: { type: 'string', example: 'Computación e Informática' },
            education: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  institution: { type: 'string', example: 'Instituto de Educación Superior' },
                  degree: { type: 'string', example: 'Técnico en Computación' },
                  start_date: { type: 'string', example: '2023-03-01' },
                  end_date: { type: 'string', example: '2026-12-15' }
                }
              }
            },
            experience: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  company: { type: 'string', example: 'Pacífico Seguros' },
                  role: { type: 'string', example: 'Líder Técnico Académico' },
                  start_date: { type: 'string', example: '2024-01-01' },
                  end_date: { type: 'string', example: 'Actual' },
                  description: { type: 'string', example: 'Diseño e implementación de arquitectura y lógica backend.' },
                  achievements: { type: 'array', items: { type: 'string' }, example: ['Optimización de consultas SQL reduciendo latencia en un 25%'] }
                }
              }
            },
            projects: { type: 'array', items: { type: 'string' }, example: ['Portal de Auto-Evaluación Académica responsivo'] },
            technical_skills: { type: 'array', items: { type: 'string' }, example: ['.NET', 'SQL', 'PostgreSQL', 'Git'] },
            soft_skills: { type: 'array', items: { type: 'string' }, example: ['Scrum', 'Organización', 'Liderazgo'] },
            certifications: { type: 'array', items: { type: 'string' }, example: ['Scrum Foundation Professional Certificate'] },
            languages: { type: 'array', items: { type: 'string' }, example: ['Español (Nativo)', 'Inglés (Básico)'] },
            target_position: { type: 'string', example: 'Líder Técnico' },
            professional_summary: { type: 'string', example: 'Estudiante de Computación enfocado en desarrollo de software robusto...' }
          }
        },
        GenerateCVRequest: {
          type: 'object',
          required: ['profileId'],
          properties: {
            profileId: { type: 'string', format: 'uuid', description: 'ID del perfil de Supabase a partir del cual generar el CV', example: '730f4e3d-804d-47df-8bf9-ae82926b457e' },
            target_job_description: { type: 'string', nullable: true, description: 'Descripción completa de la vacante usada para matching y priorización ATS' },
            custom_target_role: { type: 'string', description: 'Puesto objetivo específico para este CV' },
            cv_focus: { type: 'string', enum: ['ATS', 'técnico', 'ejecutivo', 'junior', 'senior'] },
            excluded_experience_ids: { type: 'array', items: { type: 'string' } },
            excluded_skills: { type: 'array', items: { type: 'string' } },
            candidate_data: { type: 'object', description: 'Snapshot temporal validado del wizard. Permite generar sin modificar el CV maestro.' },
            cv_style: { type: 'object', additionalProperties: true }
          }
        },
        GenerateCoverLetterRequest: {
          type: 'object',
          required: ['profileId', 'jobOfferText'],
          properties: {
            profileId: { type: 'string', format: 'uuid', description: 'ID del perfil de Supabase del candidato', example: '730f4e3d-804d-47df-8bf9-ae82926b457e' },
            jobOfferText: { type: 'string', description: 'Descripción o texto libre de la oferta de trabajo a la que postula', example: 'Se busca Desarrollador Backend con conocimientos sólidos de bases de datos PostgreSQL y control de versiones Git...' }
          }
        },
        InterviewStartRequest: {
          type: 'object',
          required: ['profileId', 'interviewType'],
          properties: {
            profileId: { type: 'string', format: 'uuid', description: 'ID del perfil en Supabase', example: '730f4e3d-804d-47df-8bf9-ae82926b457e' },
            interviewType: { type: 'string', enum: ['general', 'technical', 'behavioral'], description: 'Categoría de simulación conversacional', example: 'technical' }
          }
        },
        InterviewEvaluationRequest: {
          type: 'object',
          required: ['interviewId', 'userAnswer'],
          properties: {
            interviewId: { type: 'string', format: 'uuid', description: 'ID único de la sesión de entrevista simulada', example: '422a04ad-4e83-44b5-9d1d-663f8b735af0' },
            questionId: { type: 'string', description: 'Identificador sintético o ID de la pregunta evaluada', example: 'msg_1' },
            questionText: { type: 'string', description: 'Texto de la pregunta planteada por la IA', example: '¿Cómo optimizarías el rendimiento de una aplicación web con alta carga?' },
            userAnswer: { type: 'string', description: 'Respuesta real formulada por el candidato', example: 'Implementaría estrategias de renderizado del lado del servidor (SSR) para reducir JavaScript crítico, y configuraría almacenamiento en caché con Redis en la base de datos.' },
            interviewType: { type: 'string', enum: ['general', 'technical', 'behavioral'], example: 'technical' },
            userProfile: { $ref: '#/components/schemas/Profile' }
          }
        },
        InterviewResult: {
          type: 'object',
          properties: {
            score: { type: 'integer', description: 'Calificación asignada (0-100)', example: 92 },
            strengths: { type: 'array', items: { type: 'string' }, description: 'Fortalezas semánticas reales identificadas', example: ['Muestra excelente disposición para responder', 'Usa terminología técnica adecuada adaptada al perfil'] },
            improvements: { type: 'array', items: { type: 'string' }, description: 'Áreas reales de mejora conceptuales o estructurales', example: ['Añadir más métricas cuantitativas sobre el impacto del trabajo realizado'] },
            general_comment: { type: 'string', description: 'Retroalimentación explicativa de la respuesta', example: 'Demuestras un buen desarrollo de la respuesta. Se observa que abordas el problema con bases adecuadas y buena estructuración conceptual.' }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string', description: 'Mensaje descriptivo del error arrojado', example: 'Perfil incompleto' },
            missingFields: { type: 'array', items: { type: 'string' }, description: 'Listado de campos obligatorios faltantes (si aplica)', example: ['nombre', 'carrera', 'puesto objetivo'] }
          }
        }
      }
    },
    paths: {
      '/api/health': {
        get: {
          summary: 'Obtener el estado del servidor backend',
          description: 'Devuelve el estado de disponibilidad y salud general de la API de EmpleaIA.',
          responses: {
            200: {
              description: 'El servidor API está en funcionamiento óptimo.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      message: { type: 'string', example: 'Servidor API de EmpleaIA en ejecución.' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/profile/import-cv': {
        post: {
          summary: 'Extraer información estructurada de un CV adjunto',
          description: 'Procesa un archivo PDF o DOCX subido a través de multipart/form-data y extrae la información del perfil del candidato mediante IA (OpenAI gpt-4o-mini).',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    file: { type: 'string', format: 'binary', description: 'Archivo de CV (PDF o DOCX, máximo 5 MB)' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'CV extraído exitosamente de forma estructurada.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/ImportedCVProfile' }
                    }
                  }
                }
              }
            },
            400: {
              description: 'Solicitud inválida. Archivo faltante, formato no soportado o que excede el límite de 5 MB.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            422: {
              description: 'Extracción fallida. No se pudo leer texto del archivo (ej. PDF escaneado como imagen).',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            429: {
              description: 'Límite de cuota de OpenAI excedido.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            500: {
              description: 'Error interno del servidor.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            }
          }
        }
      },
      '/api/profile/{userId}': {
        get: {
          summary: 'Recuperar el perfil profesional de un usuario',
          description: 'Obtiene el registro de información profesional completo a partir del ID de usuario autenticado de la tabla Supabase profiles.',
          parameters: [
            { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'ID de usuario autenticado' }
          ],
          responses: {
            200: {
              description: 'Perfil recuperado con éxito.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      profile: { $ref: '#/components/schemas/Profile' }
                    }
                  }
                }
              }
            },
            404: {
              description: 'Perfil no encontrado en base de datos.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            500: {
              description: 'Error del servidor.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            }
          }
        },
        put: {
          summary: 'Crear o actualizar el perfil profesional del usuario',
          description: 'Actualiza o inserta la información del currículum básico del candidato en la tabla profiles de Supabase.',
          parameters: [
            { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'ID de usuario autenticado' }
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Profile' } } }
          },
          responses: {
            200: {
              description: 'Perfil guardado exitosamente.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      profile: { $ref: '#/components/schemas/Profile' }
                    }
                  }
                }
              }
            },
            400: {
              description: 'Error al actualizar base de datos o parámetros inválidos.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            500: {
              description: 'Error del servidor.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            }
          }
        }
      },
      '/api/cv-generate': {
        post: {
          summary: 'Generar currículum vitae optimizado por IA',
          description: 'Recupera perfil, estudios académicos y experiencias laborales de Supabase para redactar un currículum moderno y pulido utilizando IA. Almacena el resultado final en la base de datos.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/GenerateCVRequest' } } }
          },
          responses: {
            200: {
              description: 'CV redactado y almacenado correctamente.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      cvId: { type: 'string', format: 'uuid', example: '12ef45ad-783a-4be5-2b1d-00ef12349aba' },
                      cvData: {
                        type: 'object',
                        properties: {
                          professional_summary: { type: 'string', example: 'Resumen optimizado por IA...' },
                          work_experience: { type: 'array', items: { type: 'object' } },
                          academic_background: { type: 'array', items: { type: 'object' } },
                          skills_categories: { type: 'object' }
                        }
                      }
                    }
                  }
                }
              }
            },
            400: {
              description: 'Falta parámetro profileId.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            404: {
              description: 'Perfil no encontrado.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            500: {
              description: 'Error interno o de almacenamiento.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            }
          }
        }
      },
      '/api/cv-parse': {
        post: {
          summary: 'Parser de datos rápido para CV',
          description: 'Toma el texto directo de un currículum e inserta los datos estructurados en Supabase actualizando de manera síncrona el perfil, experiencias y estudios.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['profileId', 'cvText'],
                  properties: {
                    profileId: { type: 'string', format: 'uuid', example: '730f4e3d-804d-47df-8bf9-ae82926b457e' },
                    cvText: { type: 'string', example: 'Texto completo de mi CV...' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Currículum parseado y actualizado.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      parsedData: { $ref: '#/components/schemas/ImportedCVProfile' }
                    }
                  }
                }
              }
            },
            400: {
              description: 'Faltan parámetros requeridos.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            500: {
              description: 'Error del servidor.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            }
          }
        }
      },
      '/api/letter-generate': {
        post: {
          summary: 'Redactar carta de presentación altamente adaptada',
          description: 'Cruza la información profesional del candidato con los requerimientos específicos de una oferta laboral de empleo para generar una carta de postulación formal persuasiva por IA, registrándola en la base de datos.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/GenerateCoverLetterRequest' } } }
          },
          responses: {
            200: {
              description: 'Carta redactada y guardada.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      letterId: { type: 'string', format: 'uuid', example: '9a9b9c9d-12ef-34ab-56cd-78ef901234ba' },
                      letterContent: { type: 'string', example: 'Estimado Equipo de Selección:\n\nMe dirijo a ustedes...' }
                    }
                  }
                }
              }
            },
            400: {
              description: 'Parámetros faltantes.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            404: {
              description: 'Perfil del candidato no encontrado.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            500: {
              description: 'Error de servidor o almacenamiento.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            }
          }
        }
      },
      '/api/interview/start': {
        post: {
          summary: 'Iniciar una nueva simulación de entrevista interactiva',
          description: 'Crea una sesión de simulación activa en Supabase y genera la primera pregunta de entrevista de acuerdo a la especialidad del candidato y el tipo de entrevista elegido (Técnica, Competencias o General).',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/InterviewStartRequest' } } }
          },
          responses: {
            200: {
              description: 'Simulación iniciada con éxito. Devuelve la sesión y la primera pregunta de la IA.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      interviewId: { type: 'string', format: 'uuid', example: '422a04ad-4e83-44b5-9d1d-663f8b735af0' },
                      firstQuestion: { type: 'string', example: 'Hola David Francisco. Veo que te estás postulando para el puesto de Líder Técnico. Para iniciar la evaluación, ¿podrías explicarme cómo optimizarías el rendimiento de una base de datos?' }
                    }
                  }
                }
              }
            },
            400: {
              description: 'Parámetros faltantes o perfil del candidato incompleto (faltan campos MVP obligatorios).',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            404: {
              description: 'Perfil profesional inexistente en Supabase.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            500: {
              description: 'Error interno del servidor Express.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            }
          }
        }
      },
      '/api/interview/respond': {
        post: {
          summary: 'Enviar respuesta a un desafío y recibir evaluación interactiva',
          description: 'Evalúa la respuesta real del candidato contra la pregunta correspondiente en base a coherencia y estructura, inyecta comentarios precisos de fortalezas/mejoras, y determina la siguiente pregunta. Concluye automáticamente en la tercera ronda.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/InterviewEvaluationRequest' } } }
          },
          responses: {
            200: {
              description: 'Respuesta evaluada correctamente.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      feedback: { $ref: '#/components/schemas/InterviewResult' },
                      isFinished: { type: 'boolean', example: false },
                      nextQuestion: { type: 'string', nullable: true, example: 'Entiendo tu enfoque sobre bases de datos. Ahora bien, ¿cómo diseñarías una estrategia de caché distribuida para soportar picos repentinos de tráfico?' }
                    }
                  }
                }
              }
            },
            400: {
              description: 'Solicitud inválida. La respuesta está vacía, no se inyectó pregunta o se envió texto placeholder de ejemplo.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            404: {
              description: 'Sesión de entrevista simulada no encontrada.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            500: {
              description: 'Error del servidor.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            }
          }
        }
      },
      '/api/metrics/{userId}': {
        get: {
          summary: 'Obtener métricas reales agregadas de simulaciones',
          description: 'Calcula el promedio de puntajes reales de todas las entrevistas finalizadas de un candidato determinado en Supabase, organizando rachas e históricos.',
          parameters: [
            { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'ID del usuario autenticado' }
          ],
          responses: {
            200: {
              description: 'Métricas agregadas recuperadas exitosamente.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      stats: {
                        type: 'object',
                        properties: {
                          totalInterviews: { type: 'integer', example: 3 },
                          avgScore: { type: 'string', example: '85%' },
                          streak: { type: 'integer', example: 1 }
                        }
                      }
                    }
                  }
                }
              }
            },
            400: {
              description: 'ID de usuario inválido o error en base de datos.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            500: {
              description: 'Error del servidor.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            }
          }
        }
      },
      '/api/resources/{userId}': {
        get: {
          summary: 'Obtener recomendaciones didácticas personalizadas',
          description: 'Analiza la carrera, puesto objetivo y primer skill técnico principal del usuario en su perfil para proponer guías didácticas y metodologías específicas para su preparación laboral.',
          parameters: [
            { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'ID del usuario autenticado' }
          ],
          responses: {
            200: {
              description: 'Lista de recursos recomendados recuperada con éxito.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      resources: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            title: { type: 'string', example: 'Guía esencial de Computación e Informática' },
                            description: { type: 'string', example: 'Aprende conceptos clave para destacar en tu carrera de Computación e Informática.' },
                            category: { type: 'string', example: 'Career' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            404: {
              description: 'Perfil profesional del usuario no encontrado.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            500: {
              description: 'Error del servidor.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            }
          }
        }
      }
    }
  },
  apis: []
};

const swaggerSpec = swaggerJSDoc(options);

export { swaggerUi, swaggerSpec };
