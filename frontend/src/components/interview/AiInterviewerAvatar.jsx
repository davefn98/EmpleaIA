import './AiInterviewerAvatar.css';

const AVATAR_STATES = new Set(['idle', 'speaking', 'listening', 'analyzing', 'paused', 'completed', 'error', 'writing']);

/**
 * Original layered illustration. Animation reflects application activity,
 * not the candidate's emotions or score. Speaking uses approximate movement;
 * its duration must be driven by the actual audio start/end/cancel events.
 * Keep the accessible status label outside this decorative component.
 */
export default function AiInterviewerAvatar({ status = 'idle', variant = 'woman', avatarRef }) {
  const state = AVATAR_STATES.has(status) ? status : 'idle';
  const appearance = variant === 'man' ? 'man' : 'woman';

  return (
    <div ref={avatarRef} className={`ai-interviewer ai-interviewer--${state}`} data-state={state} data-variant={appearance} aria-hidden="true">
      <svg className="ai-interviewer__illustration" viewBox="0 0 240 280" fill="none" focusable="false" aria-hidden="true">
        <circle className="ai-interviewer__backdrop" cx="120" cy="140" r="106" />
        <circle className="ai-interviewer__activity-ring" cx="120" cy="140" r="108" />
        <circle className="ai-interviewer__accent" cx="33" cy="103" r="7" />
        <circle className="ai-interviewer__accent ai-interviewer__accent--small" cx="204" cy="178" r="4" />
        <path className="ai-interviewer__spark" d="M200 74v14m-7-7h14" stroke="#8A82EE" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="120" cy="258" rx="71" ry="10" fill="#4536A7" opacity=".09" />

        <g className="ai-interviewer__body">
          {appearance === 'woman' && <path d="M72 83c-13 27-7 70-12 95 20 20 102 20 123-1-8-24 0-63-14-94Z" fill="#352E4A" />}
          <path d="M87 169 60 182c-10 5-19 30-21 71 43 13 119 13 162 0-2-41-11-66-21-71l-27-13Z" fill="#5146B6" />
          <path d="M102 149v27l18 22 18-22v-27" fill="#EAB699" />
          <path d="M102 156c11 8 25 8 36 0v10c-12 7-25 7-36 0Z" fill="#DDA184" />
          <path d="m88 169 14 3 18 26 18-26 14-3-3 64H91Z" fill="#FCFBFF" />
          <path d="m88 169-15 11 12 19-9 7 24 52h20l-17-64Z" fill="#6C60CC" />
          <path d="m152 169 15 11-12 19 9 7-24 52h-20l17-64Z" fill="#6C60CC" />
          {appearance === 'man' && <path d="m115 192 5-4 5 4-2 9 5 34-8 12-8-12 5-34Z" fill="#4D4490" />}
          <circle cx="153" cy="199" r="3" fill="#B8F0EB" />
          <g className="ai-interviewer__arm ai-interviewer__arm--left">
            <path d="M64 188c-11 10-15 30-17 54l32 8 14-31-16-10-11 21-4-1 10-28Z" fill="#5146B6" />
            <path d="m82 216 10-11c3-4 9-9 13-5 2 3-2 7-5 10l9-1c8-1 11 3 8 7-4 5-14 8-23 7Z" fill="#F1C4A8" />
            <path d="m92 213 7-7" stroke="#C78D72" strokeWidth="1.6" strokeLinecap="round" />
          </g>
          <g className="ai-interviewer__arm ai-interviewer__arm--right">
            <path d="M176 188c11 10 16 32 17 54l-31 8-15-31 16-10 11 21 4-1-10-28Z" fill="#5146B6" />
            <path d="m158 216-10-11c-3-4-9-9-13-5-2 3 2 7 5 10l-9-1c-8-1-11 3-8 7 4 5 14 8 23 7Z" fill="#F1C4A8" />
            <path d="m148 213-7-7" stroke="#C78D72" strokeWidth="1.6" strokeLinecap="round" />
          </g>

          <g className="ai-interviewer__head">
            <path d="M74 94c-3-36 15-53 46-53 35 0 52 21 47 56l-9 26H83Z" fill="#352E4A" />
            <ellipse cx="80" cy="111" rx="7" ry="12" fill="#F1C4A8" />
            <ellipse cx="160" cy="111" rx="7" ry="12" fill="#F1C4A8" />
            <path d="M80 91c0-26 80-26 80 0v32c-3 28-23 43-40 43s-37-15-40-43Z" fill="#F1C4A8" />
            {appearance === 'woman' ? (
              <>
                <path d="M76 102c-3-39 16-57 46-57 30 0 46 20 43 54-18-7-29-19-37-34-10 19-29 29-52 37Z" fill="#352E4A" />
                <path d="M86 76c10-15 27-21 40-17" stroke="#514660" strokeWidth="5" strokeLinecap="round" />
                <circle cx="78" cy="122" r="3" fill="#E6D1A8" />
                <circle cx="162" cy="122" r="3" fill="#E6D1A8" />
              </>
            ) : (
              <>
                <path d="M77 98c-4-15-3-32 7-41 14-14 35-15 47-11l18-7-3 12c21 5 25 25 17 47l-9-23c-23 8-39 6-55-1l-15 24Z" fill="#352E4A" />
                <path d="M88 65c12-10 27-12 41-9" stroke="#514660" strokeWidth="5" strokeLinecap="round" />
              </>
            )}
            <path className="ai-interviewer__brow" d="M94 99c5-3 10-3 15-1m22 0c5-2 10-2 15 1" stroke="#51404A" strokeWidth="2.7" strokeLinecap="round" />
            <g className="ai-interviewer__eyes">
              <ellipse cx="102" cy="111" rx="3.2" ry="4.4" fill="#352E4A" />
              <ellipse cx="138" cy="111" rx="3.2" ry="4.4" fill="#352E4A" />
              <circle cx="103" cy="110" r="1" fill="white" />
              <circle cx="139" cy="110" r="1" fill="white" />
            </g>
            <path d="m119 114-2 12 5 1" stroke="#D49B7E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <ellipse cx="95" cy="129" rx="7" ry="3" fill="#EBA29A" opacity=".46" />
            <ellipse cx="145" cy="129" rx="7" ry="3" fill="#EBA29A" opacity=".46" />
            <path className="ai-interviewer__closed-mouth" d="M110 141c6 5 14 5 20 0" stroke="#A75562" strokeWidth="2.5" strokeLinecap="round" />
            <g className="ai-interviewer__speaking-mouth">
              <ellipse cx="120" cy="142" rx="10" ry="7" fill="#743D51" />
              <path d="M112 138h16c-2 3-14 3-16 0Z" fill="#FFF8EF" />
              <ellipse cx="120" cy="146" rx="5" ry="2" fill="#D9828C" />
            </g>
          </g>
        </g>
      </svg>
      <div className="ai-interviewer__processing"><span /><span /><span /></div>
    </div>
  );
}
