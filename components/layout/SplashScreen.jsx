export default function SplashScreen({ label = "Loading…" }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 42%, rgba(59,130,246,0.18) 0%, rgba(0,0,0,0) 70%)",
        }}
      />

      <div className="relative flex flex-col items-center gap-7 px-6">
        <img
          src="/brand-icon.png"
          alt=""
          className="w-44 sm:w-56 max-w-[58vw] h-auto select-none splash-logo-anim"
          draggable="false"
        />

        <div className="text-center -mt-1">
          <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Right Tail
          </div>
          <div className="text-[11px] uppercase tracking-[0.32em] text-muted-foreground mt-1.5">
            Project Management Tool
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="relative h-[3px] w-44 overflow-hidden rounded-full bg-white/10">
            <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-white/80 splash-bar-anim" />
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/50 font-body">
            {label}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes splash-logo-float {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.95; }
          50%      { transform: translateY(-4px) scale(1.02); opacity: 1; }
        }
        @keyframes splash-bar-slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        .splash-logo-anim {
          animation: splash-logo-float 2.4s ease-in-out infinite;
          filter: drop-shadow(0 12px 32px rgba(59,130,246,0.28));
        }
        .splash-bar-anim {
          animation: splash-bar-slide 1.4s cubic-bezier(0.65, 0, 0.35, 1) infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .splash-logo-anim,
          .splash-bar-anim { animation: none; }
        }
      `}</style>
    </div>
  );
}
