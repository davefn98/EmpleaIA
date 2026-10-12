import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { PDF_PAGEBREAK_OPTIONS } from '../src/utils/exportToPdf.js';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let vite;
let CVPreview;
let normalizeCvData;

before(async () => {
  vite = await createServer({
    root: frontendRoot,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    plugins: [react()],
    server: { middlewareMode: true }
  });
  ({ default: CVPreview, normalizeCvData } = await vite.ssrLoadModule('/src/components/cv/CVPreview.jsx'));
});

after(async () => {
  await vite?.close();
});

test('normalizeCvData adapta el contrato nuevo y respeta el orden priorizado de categorías', () => {
  const result = normalizeCvData({}, {
    headline: 'Frontend Engineer',
    professional_summary: 'Resumen dirigido a la vacante.',
    work_experience: [{ company: 'Acme', role: 'Developer', start_date: '2023-01-01', end_date: '', bullets: ['Redujo latencia', 'Lideró entregas'] }],
    technical_skills: {
      backend: ['Node.js'],
      cloud: ['AWS'],
      frontend: ['React', 'TypeScript']
    },
    technical_skill_order: ['frontend', 'cloud', 'backend'],
    soft_skills: ['Comunicación', 'Liderazgo']
  });

  assert.equal(result.headline, 'Frontend Engineer');
  assert.equal(result.professionalSummary, 'Resumen dirigido a la vacante.');
  assert.deepEqual(result.workExperience[0].bullets, ['Redujo latencia', 'Lideró entregas']);
  assert.equal(result.workExperience[0].period, '2023-01-01 - Actual');
  assert.deepEqual(result.skillCategories.map((category) => category.label), ['Frontend', 'Cloud', 'Backend']);
  assert.deepEqual(result.softSkills, ['Comunicación', 'Liderazgo']);
});

test('normalizeCvData mantiene compatibilidad con CV persistidos anteriores', () => {
  const result = normalizeCvData({}, {
    profile_summary: 'Resumen antiguo',
    experience: [{ role: 'Analista', impact_description: 'Automatizó reportes', achievements: ['Ahorró 10 horas'] }],
    skills_categories: {
      languages_and_frameworks: ['JavaScript'],
      tools_and_databases: ['PostgreSQL'],
      methodologies_and_soft_skills: ['Scrum']
    }
  });

  assert.equal(result.professionalSummary, 'Resumen antiguo');
  assert.equal(result.workExperience[0].description, 'Automatizó reportes');
  assert.deepEqual(result.workExperience[0].bullets, ['Ahorró 10 horas']);
  assert.deepEqual(result.technicalSkills, ['JavaScript', 'PostgreSQL']);
  assert.deepEqual(result.softSkills, ['Scrum']);
});

test('normalizeCvData respeta una selección técnica explícitamente vacía', () => {
  const result = normalizeCvData({ technical_skills: ['React'] }, {
    technical_skills: {
      backend: [], cloud: [], architecture: [], databases: [], integration: [],
      testing: [], devops: [], security: [], frontend: [], other: []
    }
  });
  assert.deepEqual(result.technicalSkills, []);
});

test('las seis plantillas renderizan el contrato nuevo y los selectores usados por html2pdf', () => {
  const templates = ['classic', 'modern-sidebar', 'minimal', 'executive', 'tech', 'creative-simple'];
  const renderedTemplates = [];
  const longBullet = 'Implementó una mejora medible y documentada. '.repeat(20);
  const props = {
    profile: { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' },
    cvData: {
      headline: 'Principal Platform Engineer',
      professional_summary: 'Diseña plataformas confiables.',
      work_experience: [
        { company: 'Acme', role: 'Engineer', period: '2024 - Actual', bullets: ['Mejoró la entrega continua'] },
        { company: 'Globex', role: 'Lead Engineer', period: '2020 - 2024', bullets: [longBullet, longBullet, longBullet, longBullet] }
      ],
      technical_skills: {
        devops: ['Kubernetes', 'Terraform']
      },
      technical_skill_order: ['devops'],
      soft_skills: ['Mentoría'],
      certifications: ['AWS Cloud Practitioner']
    },
    sectionOrder: ['summary', 'experience', 'skills']
  };

  for (const template of templates) {
    const html = renderToStaticMarkup(React.createElement(CVPreview, {
      ...props,
      theme: { template }
    }));
    renderedTemplates.push(html);

    assert.match(html, /Principal Platform Engineer/, `${template} debe renderizar headline`);
    assert.match(html, /Mejoró la entrega continua/, `${template} debe renderizar bullets`);
    assert.match(html, /DevOps/, `${template} debe renderizar la categoría priorizada`);
    assert.match(html, /Mentoría/, `${template} debe renderizar soft skills`);
    assert.match(html, /AWS Cloud Practitioner/, `${template} debe renderizar certificaciones`);
    assert.match(html, /class="pdf-section-heading"/, `${template} debe marcar encabezados`);
    assert.match(html, /data-pdf-experience-size="small"/, `${template} debe proteger experiencias pequeñas`);
    assert.match(html, /data-pdf-experience-size="large"/, `${template} debe permitir experiencias grandes`);
    assert.doesNotMatch(html, /position:absolute/, `${template} no debe usar pies absolutos`);
  }

  const renderedMarkup = renderedTemplates.join('');
  for (const selector of PDF_PAGEBREAK_OPTIONS.avoid) {
    if (selector.startsWith('.')) {
      assert.match(renderedMarkup, new RegExp(`class="[^"]*${selector.slice(1)}`), `${selector} debe existir en el CV real`);
    } else {
      assert.equal(selector, '[data-pdf-keep-together="true"]');
      assert.match(renderedMarkup, /data-pdf-keep-together="true"/, `${selector} debe existir en el CV real`);
    }
  }
});
