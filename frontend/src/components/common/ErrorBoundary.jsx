import React from 'react';
import { ShieldAlert, RefreshCw, Home, ChevronRight, ChevronDown } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      showDetails: false 
    };
  }

  static getDerivedStateFromError(error) {
    // Actualizar el estado para que el siguiente renderizado muestre la interfaz de repuesto.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // También puedes registrar el error en un servicio de reporte de errores
    console.error('[ErrorBoundary] Capturado un fallo crítico:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    // Limpia el estado y recarga la aplicación
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
    window.location.href = '/';
  };

  toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 font-sans transition-colors duration-300">
          {/* Tarjeta Contenedora Principal */}
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl p-6 md:p-8 text-center space-y-6 animate-fade-in relative overflow-hidden">
            
            {/* Elemento de diseño de fondo (subtles) */}
            <div className="absolute top-0 left-0 w-full h-1.5 bg-rose-500" />
            <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-rose-500/5 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />

            {/* Icono de Alerta */}
            <div className="mx-auto bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 p-4 rounded-2xl inline-flex items-center justify-center shadow-inner">
              <ShieldAlert className="h-10 w-10 animate-pulse" />
            </div>

            {/* Títulos */}
            <div className="space-y-2">
              <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                ¡Ups! Algo salió mal
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm leading-relaxed max-w-md mx-auto">
                La aplicación experimentó un inconveniente inesperado al cargar esta sección. No te preocupes, tus datos están a salvo en la nube.
              </p>
            </div>

            {/* Botones de Acción */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-2">
              <button
                onClick={this.handleReset}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-3 rounded-xl shadow-md transition-all duration-200 cursor-pointer"
              >
                <RefreshCw className="h-4 w-4 animate-spin-slow" />
                Recargar aplicación
              </button>
              
              <button
                onClick={this.handleGoHome}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold px-5 py-3 rounded-xl transition-all duration-200 cursor-pointer"
              >
                <Home className="h-4 w-4" />
                Ir al Inicio
              </button>
            </div>

            {/* Detalles Técnicos Colapsables */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4 text-left">
              <button
                onClick={this.toggleDetails}
                className="flex items-center gap-1 text-[10px] md:text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-bold transition-colors cursor-pointer"
              >
                {this.state.showDetails ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {this.state.showDetails ? 'Ocultar detalles técnicos' : 'Mostrar detalles técnicos'}
              </button>

              {this.state.showDetails && (
                <div className="mt-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 font-mono text-[10px] leading-relaxed text-rose-600 dark:text-rose-400 overflow-x-auto max-h-48 shadow-inner">
                  <div className="font-bold mb-1">
                    Error: {this.state.error ? this.state.error.toString() : 'Fallo de renderizado'}
                  </div>
                  {this.state.errorInfo && (
                    <pre className="whitespace-pre text-slate-500 dark:text-slate-400 mt-2 font-mono">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              )}
            </div>
            
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
