/**
 * Utilidad unificada para exportar elementos HTML a PDF usando html2pdf.js.
 * Utiliza configuraciones estandarizadas para evitar deformaciones, cortes abruptos o diferencias de márgenes.
 */
export const exportToPdf = async (elementId, fileName) => {
  try {
    const html2pdf = (await import('html2pdf.js')).default;
    const element = document.getElementById(elementId);
    
    if (!element) {
      throw new Error(`Elemento con ID "${elementId}" no encontrado en el DOM.`);
    }

    // Esperar a que carguen las fuentes tipográficas
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    const opt = {
      margin:       0,
      filename:     fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, letterRendering: true, scrollY: 0 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
    };

    // Generar y guardar el archivo PDF
    await html2pdf().set(opt).from(element).save();
    return true;
  } catch (error) {
    console.error('[exportToPdf] Error al exportar PDF:', error);
    throw error;
  }
};
