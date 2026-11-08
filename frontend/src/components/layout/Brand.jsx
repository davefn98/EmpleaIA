import { Signpost } from 'lucide-react';

export default function Brand({ iconOnly = false }) {
  return (
    <span className="brand">
      <span className="brand__mark">
        <Signpost aria-hidden="true" />
      </span>
      {!iconOnly && <span>Emplea<span className="brand__accent">IA</span></span>}
    </span>
  );
}
