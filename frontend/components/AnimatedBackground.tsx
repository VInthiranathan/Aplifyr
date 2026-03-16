import { motion } from "framer-motion";

interface AnimatedBackgroundProps {
  isFocused: boolean;
}

const AnimatedBackground = ({ isFocused }: AnimatedBackgroundProps) => {
  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-50 dark:bg-[#0d0d0d]">
      {/* Large slow-moving gradient orbs */}
      <motion.div
        className="absolute w-[900px] h-[900px] rounded-full opacity-40"
        style={{
          background: "radial-gradient(circle, hsl(270 60% 50% / 0.5), transparent 70%)",
          top: "-10%",
          left: "-5%",
        }}
        animate={{
          x: [0, 300, -100, 200, 0],
          y: [0, -150, 200, -50, 0],
          scale: [1, 1.2, 0.9, 1.15, 1],
        }}
        transition={{
          duration: isFocused ? 50 : 14,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute w-[800px] h-[800px] rounded-full opacity-35"
        style={{
          background: "radial-gradient(circle, hsl(345 100% 60% / 0.4), transparent 70%)",
          bottom: "-15%",
          right: "-10%",
        }}
        animate={{
          x: [0, -250, 150, -200, 0],
          y: [0, 200, -150, 100, 0],
          scale: [1, 0.85, 1.2, 0.95, 1],
        }}
        transition={{
          duration: isFocused ? 60 : 16,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute w-[700px] h-[700px] rounded-full opacity-30"
        style={{
          background: "radial-gradient(circle, hsl(200 80% 50% / 0.35), transparent 70%)",
          top: "30%",
          left: "30%",
        }}
        animate={{
          x: [0, 200, -250, 100, 0],
          y: [0, -200, 100, -150, 0],
          scale: [1, 1.1, 0.85, 1.15, 1],
        }}
        transition={{
          duration: isFocused ? 70 : 18,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Logo */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2"
        style={{ top: "10%" }}
        animate={{
          filter: isFocused ? "blur(8px)" : "blur(0px)",
          opacity: isFocused ? 0.5 : 1,
        }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
      >
        <h1 className="text-7xl md:text-8xl font-bold tracking-wider text-gray-900 dark:text-white select-none">
          Aplifyr
        </h1>
      </motion.div>
    </div>
  );
};

export default AnimatedBackground;
