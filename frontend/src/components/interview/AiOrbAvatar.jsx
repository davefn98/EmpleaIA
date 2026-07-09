import React from 'react';

/**
 * Presencia visual de la entrevistadora IA: orbe/núcleo luminoso con halo,
 * anillos concéntricos, ondas de voz y partículas orbitales. Solo CSS
 * (keyframes ai-orb-* en index.css), sin assets externos ni video.
 *
 * status: 'idle' | 'speaking' | 'listening' | 'analyzing'
 * orbRef: ref al nodo raíz; el detector de silencio inyecta la variable CSS
 *         --voice-level para que el núcleo reaccione al volumen real del mic.
 */
export default function AiOrbAvatar({ status = 'idle', orbRef }) {
  return (
    <div ref={orbRef} className={`ai-orb ai-orb--${status}`} aria-hidden="true">
      <div className="ai-orb__halo" />
      <span className="ai-orb__wave" />
      <span className="ai-orb__wave" />
      <span className="ai-orb__wave" />
      <div className="ai-orb__ring ai-orb__ring--outer" />
      <div className="ai-orb__ring ai-orb__ring--mid" />
      <div className="ai-orb__ring ai-orb__ring--inner" />
      <div className="ai-orb__orbit ai-orb__orbit--a"><span className="ai-orb__particle" /></div>
      <div className="ai-orb__orbit ai-orb__orbit--b"><span className="ai-orb__particle" /></div>
      <div className="ai-orb__orbit ai-orb__orbit--c"><span className="ai-orb__particle" /></div>
      <div className="ai-orb__core" />
    </div>
  );
}
