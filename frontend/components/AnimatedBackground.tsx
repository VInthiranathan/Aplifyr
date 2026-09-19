import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

interface AnimatedBackgroundProps {
  isFocused: boolean;
}

const AnimatedBackground = ({ isFocused }: AnimatedBackgroundProps) => {
  const reduceMotion = useReducedMotion();
  const orbDuration = isFocused ? 42 : 28;
  const logoDuration = isFocused ? 10 : 7;

  return (
    <div className="relative isolate h-full w-full overflow-hidden bg-slate-50 dark:bg-[#090b12]">
      <div
        className="absolute inset-0 opacity-80 dark:opacity-100"
        style={{
          background:
            "linear-gradient(145deg, rgba(248,250,252,0.98) 0%, rgba(239,246,255,0.94) 44%, rgba(245,243,255,0.96) 100%)",
        }}
      />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          background:
            "linear-gradient(145deg, rgba(9,11,18,1) 0%, rgba(12,25,47,0.98) 48%, rgba(29,17,52,0.96) 100%)",
        }}
      />

      <motion.div
        aria-hidden="true"
        className="absolute -left-[18%] -top-[28%] h-[74vw] max-h-[920px] min-h-[620px] w-[74vw] max-w-[920px] min-w-[620px] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(56,189,248,0.38) 0%, rgba(59,130,246,0.2) 42%, transparent 70%)",
        }}
        animate={reduceMotion ? undefined : {
          x: [0, 70, 20, 0],
          y: [0, 35, 90, 0],
          scale: [1, 1.08, 0.96, 1],
        }}
        transition={{ duration: orbDuration, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden="true"
        className="absolute -bottom-[34%] -right-[24%] h-[76vw] max-h-[960px] min-h-[660px] w-[76vw] max-w-[960px] min-w-[660px] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(168,85,247,0.34) 0%, rgba(236,72,153,0.18) 44%, transparent 70%)",
        }}
        animate={reduceMotion ? undefined : {
          x: [0, -65, -15, 0],
          y: [0, -55, -95, 0],
          scale: [1, 0.94, 1.07, 1],
        }}
        transition={{ duration: orbDuration + 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden="true"
        className="absolute left-[38%] top-[36%] h-[420px] w-[420px] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(99,102,241,0.22) 0%, rgba(14,165,233,0.1) 46%, transparent 72%)",
        }}
        animate={reduceMotion ? undefined : {
          x: [-30, 55, -10, -30],
          y: [20, -60, 45, 20],
          scale: [0.96, 1.08, 1, 0.96],
        }}
        transition={{ duration: orbDuration + 12, repeat: Infinity, ease: "easeInOut" }}
      />

      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.16] dark:opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(71,85,105,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(71,85,105,0.22) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(circle at center, black 8%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(circle at center, black 8%, transparent 72%)",
        }}
      />

      <motion.div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 h-[430px] w-[430px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-500/15 dark:border-sky-300/15 lg:h-[520px] lg:w-[520px]"
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: isFocused ? 70 : 52, repeat: Infinity, ease: "linear" }}
      >
        <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400 shadow-[0_0_24px_rgba(56,189,248,0.85)]" />
        <span className="absolute bottom-[12%] right-[8%] h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_20px_rgba(167,139,250,0.8)]" />
      </motion.div>

      <div className="absolute inset-0 flex items-center justify-center p-10">
        <motion.div
          className="relative flex w-full max-w-xl flex-col items-center rounded-[2.5rem] border border-white/70 bg-white/55 px-10 py-14 text-center shadow-[0_30px_90px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/35 dark:shadow-[0_30px_100px_rgba(0,0,0,0.35)] lg:px-16 lg:py-16"
          animate={reduceMotion ? { opacity: isFocused ? 0.82 : 1 } : {
            y: [0, -6, 0],
            scale: isFocused ? 0.985 : [1, 1.012, 1],
            opacity: isFocused ? 0.82 : 1,
          }}
          transition={{
            y: { duration: logoDuration, repeat: Infinity, ease: "easeInOut" },
            scale: { duration: logoDuration, repeat: Infinity, ease: "easeInOut" },
            opacity: { duration: 0.45, ease: "easeOut" },
          }}
        >
          <div aria-hidden="true" className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/70 to-transparent" />
          <motion.div
            animate={reduceMotion ? undefined : { rotate: [0, 2, -2, 0] }}
            transition={{ duration: logoDuration + 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <Image
              src="/Aplifyr_Ikon.png"
              alt=""
              width={112}
              height={112}
              priority
              className="h-24 w-24 drop-shadow-[0_18px_24px_rgba(59,130,246,0.2)] lg:h-28 lg:w-28"
            />
          </motion.div>
          <h1 className="mt-7 select-none text-6xl font-bold tracking-[-0.045em] text-slate-900 dark:text-white lg:text-7xl">
            Aplifyr
          </h1>
          <div className="mt-7 flex items-center gap-2" aria-hidden="true">
            <span className="h-1.5 w-12 rounded-full bg-sky-400" />
            <span className="h-1.5 w-5 rounded-full bg-indigo-400" />
            <span className="h-1.5 w-2 rounded-full bg-violet-400" />
          </div>
        </motion.div>
      </div>

      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_42%,rgba(15,23,42,0.08)_100%)] dark:bg-[radial-gradient(circle_at_center,transparent_38%,rgba(0,0,0,0.36)_100%)]" />
    </div>
  );
};

export default AnimatedBackground;
