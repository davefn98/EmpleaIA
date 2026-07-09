import React, { useState } from 'react';
import { User, Mail, Phone, MapPin, ChevronRight, AlertCircle } from 'lucide-react';

export default function PersonalInfoForm({ data, onChange, onNext }) {
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!data.first_name || !data.first_name.trim()) {
      newErrors.first_name = 'El nombre es obligatorio.';
    }
    if (!data.last_name || !data.last_name.trim()) {
      newErrors.last_name = 'El apellido es obligatorio.';
    }
    if (!data.phone || !data.phone.trim()) {
      newErrors.phone = 'El teléfono es obligatorio.';
    }
    if (!data.location || !data.location.trim()) {
      newErrors.location = 'La ubicación es obligatoria.';
    }
    
    // Email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email || !data.email.trim()) {
      newErrors.email = 'El correo es obligatorio.';
    } else if (!emailRegex.test(data.email)) {
      newErrors.email = 'El correo electrónico no es válido.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onNext();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-left">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 mb-2">
          <User className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">1. Información Personal</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Nombres */}
          <div>
            <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
              Nombres <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={data.first_name || ''}
              onChange={(e) => onChange('first_name', e.target.value)}
              placeholder="ej: David Francisco"
              className={`w-full bg-slate-50 border ${
                errors.first_name ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-indigo-500'
              } text-slate-900 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:bg-white transition-all`}
            />
            {errors.first_name && (
              <p className="text-[10px] text-red-500 font-semibold mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {errors.first_name}
              </p>
            )}
          </div>

          {/* Apellidos */}
          <div>
            <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
              Apellidos <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={data.last_name || ''}
              onChange={(e) => onChange('last_name', e.target.value)}
              placeholder="ej: Yparraguirre Bravo"
              className={`w-full bg-slate-50 border ${
                errors.last_name ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-indigo-500'
              } text-slate-900 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:bg-white transition-all`}
            />
            {errors.last_name && (
              <p className="text-[10px] text-red-500 font-semibold mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {errors.last_name}
              </p>
            )}
          </div>

          {/* Correo */}
          <div>
            <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
              Correo Electrónico <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="email"
                disabled
                value={data.email || ''}
                className="w-full bg-slate-100 border border-slate-200 text-slate-400 rounded-xl pl-4 pr-10 py-2.5 text-xs cursor-not-allowed"
              />
              <Mail className="h-4 w-4 text-slate-400 absolute right-3 top-3" />
            </div>
            {errors.email && (
              <p className="text-[10px] text-red-500 font-semibold mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {errors.email}
              </p>
            )}
          </div>

          {/* Teléfono */}
          <div>
            <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
              Teléfono / Celular <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={data.phone || ''}
                onChange={(e) => onChange('phone', e.target.value)}
                placeholder="ej: +51 987 654 321"
                className={`w-full bg-slate-50 border ${
                  errors.phone ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-indigo-500'
                } text-slate-900 rounded-xl pl-4 pr-10 py-2.5 text-xs focus:outline-none focus:bg-white transition-all`}
              />
              <Phone className="h-4 w-4 text-slate-450 absolute right-3 top-3" />
            </div>
            {errors.phone && (
              <p className="text-[10px] text-red-500 font-semibold mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {errors.phone}
              </p>
            )}
          </div>

          {/* Ubicación */}
          <div className="md:col-span-2">
            <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
              Ubicación (Ciudad, Departamento, País) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={data.location || ''}
                onChange={(e) => onChange('location', e.target.value)}
                placeholder="ej: Trujillo, La Libertad, Perú"
                className={`w-full bg-slate-50 border ${
                  errors.location ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-indigo-500'
                } text-slate-900 rounded-xl pl-4 pr-10 py-2.5 text-xs focus:outline-none focus:bg-white transition-all`}
              />
              <MapPin className="h-4 w-4 text-slate-450 absolute right-3 top-3" />
            </div>
            {errors.location && (
              <p className="text-[10px] text-red-500 font-semibold mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {errors.location}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-slate-100">
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/15 transition-all cursor-pointer"
        >
          Siguiente
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
