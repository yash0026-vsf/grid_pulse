import React, { useState, useRef } from 'react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Check, X, Shield, Activity, Battery, CloudSun } from 'lucide-react';

// --- Shared Animation Component: WordsPullUp ---
interface WordsPullUpProps {
  text: string;
  className?: string;
  showAsterisk?: boolean;
}

export function WordsPullUp({ text, className = "", showAsterisk = false }: WordsPullUpProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const isInView = useInView(containerRef, { once: true });
  const words = text.split(" ");

  return (
    <span ref={containerRef} className={`inline-flex flex-wrap ${className}`}>
      {words.map((word, index) => {
        const isLastWord = index === words.length - 1;
        return (
          <span key={index} className="inline-block overflow-hidden mr-[0.2em] last:mr-0">
            <motion.span
              className="inline-block relative"
              initial={{ y: 30, opacity: 0 }}
              animate={isInView ? { y: 0, opacity: 1 } : { y: 30, opacity: 0 }}
              transition={{
                duration: 0.8,
                delay: index * 0.08,
                ease: [0.16, 1, 0.3, 1]
              }}
            >
              {word}
              {showAsterisk && isLastWord && (
                <span className="absolute top-[0.65em] -right-[0.3em] text-[0.31em] select-none font-normal">
                  *
                </span>
              )}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

// --- Shared Animation Component: WordsPullUpMultiStyle ---
interface MultiStyleSegment {
  text: string;
  className: string;
}

export function WordsPullUpMultiStyle({ segments, className = "" }: { segments: MultiStyleSegment[]; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true });

  let wordIndex = 0;
  return (
    <div ref={containerRef} className={`inline-flex flex-wrap justify-center ${className}`}>
      {segments.map((segment, segIdx) => {
        const words = segment.text.split(" ");
        return (
          <span key={segIdx} className="inline-flex flex-wrap justify-center">
            {words.map((word, wIdx) => {
              const currentIdx = wordIndex++;
              return (
                <span key={wIdx} className="inline-block overflow-hidden mx-[0.14em]">
                  <motion.span
                    className={`inline-block ${segment.className}`}
                    initial={{ y: 24, opacity: 0 }}
                    animate={isInView ? { y: 0, opacity: 1 } : { y: 24, opacity: 0 }}
                    transition={{
                      duration: 0.7,
                      delay: currentIdx * 0.08,
                      ease: [0.16, 1, 0.3, 1]
                    }}
                  >
                    {word}
                  </motion.span>
                </span>
              );
            })}
          </span>
        );
      })}
    </div>
  );
}

// --- Shared Animation Component: AnimatedLetter (Scroll-linked) ---
interface AnimatedLetterProps {
  char: string;
  index: number;
  totalChars: number;
  scrollYProgress: any;
}

export function AnimatedLetter({ char, index, totalChars, scrollYProgress }: AnimatedLetterProps) {
  const charProgress = index / totalChars;
  const start = Math.max(0, charProgress - 0.1);
  const end = Math.min(1, charProgress + 0.05);

  const opacity = useTransform(scrollYProgress, [start, end], [0.2, 1]);

  return (
    <motion.span style={{ opacity }} className="inline">
      {char}
    </motion.span>
  );
}

// --- Main GridPulse Application ---
export default function App() {
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isCloudDropSimulated, setIsCloudDropSimulated] = useState(false);

  const aboutContainerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: aboutScrollProgress } = useScroll({
    target: aboutContainerRef,
    offset: ["start 0.8", "end 0.2"]
  });

  const aboutBodyText = "When sudden cloud cover slashes rooftop solar generation by fifty percent during high manufacturing production, factories face catastrophic utility demand surcharges. GridPulse steps in within thirty eight milliseconds, discharging battery reserves to insulate the plant from utility penalty thresholds.";
  const aboutChars = aboutBodyText.split("");

  // Features Cards inView ref
  const featuresRef = useRef<HTMLDivElement>(null);
  const isFeaturesInView = useInView(featuresRef, { once: true, margin: "-100px" });

  return (
    <div className="bg-black text-[#E1E0CC] min-h-screen">

      {/* SECTION 1: HERO */}
      <section className="h-screen w-full p-4 md:p-6 relative">
        <div className="w-full h-full rounded-2xl md:rounded-[2rem] overflow-hidden relative bg-black">
          
          {/* Background video */}
          <video
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_170732_8a9ccda6-5cff-4628-b164-059c500a2b41.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          />

          {/* Noise overlay */}
          <div className="noise-overlay absolute inset-0 opacity-[0.7] mix-blend-overlay pointer-events-none" />

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 pointer-events-none" />

          {/* Navbar: Hanging Pill from top edge */}
          <nav className="absolute top-0 left-1/2 -translate-x-1/2 z-20 bg-black rounded-b-2xl md:rounded-b-3xl px-4 py-2 md:px-8 flex items-center justify-center gap-3 sm:gap-6 md:gap-12 lg:gap-14 shadow-2xl border-b border-x border-white/5">
            {["The Problem", "Architecture", "Core Features", "Plant Audit", "Specifications"].map((item, idx) => (
              <a
                key={idx}
                href={`#${item.toLowerCase().replace(" ", "-")}`}
                style={{ color: "rgba(225, 224, 204, 0.8)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#E1E0CC")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(225, 224, 204, 0.8)")}
                className="text-[10px] sm:text-xs md:text-sm font-medium tracking-wide transition-colors duration-200"
              >
                {item}
              </a>
            ))}
          </nav>

          {/* Hero Content: Bottom-aligned 12-column grid */}
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 lg:p-12 z-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
              
              {/* Left 8 columns: Giant Heading "GridPulse" with asterisk */}
              <div className="lg:col-span-8 flex items-end">
                <h1 className="text-[26vw] sm:text-[24vw] md:text-[22vw] lg:text-[20vw] xl:text-[19vw] 2xl:text-[20vw] font-medium leading-[0.85] tracking-[-0.07em] text-[#E1E0CC] select-none">
                  <WordsPullUp text="GridPulse" showAsterisk={true} />
                </h1>
              </div>

              {/* Right 4 columns: Description text + CTA button */}
              <div className="lg:col-span-4 flex flex-col items-start gap-5 pb-2">
                <motion.p
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="text-primary/70 text-xs sm:text-sm md:text-base leading-[1.2] max-w-sm"
                >
                  GridPulse coordinates on site solar arrays, industrial battery storage, and heavy factory machinery in real time to throttle grid spikes and eliminate peak demand penalties.
                </motion.p>

                <motion.button
                  onClick={() => setIsConsoleOpen(true)}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  className="bg-primary rounded-full pl-5 pr-1.5 py-1.5 sm:pl-6 sm:pr-2 sm:py-2 text-black font-medium text-sm sm:text-base inline-flex items-center gap-2 group transition-all duration-300 hover:gap-3 cursor-pointer shadow-lg"
                >
                  <span>Launch Live Console</span>
                  <div className="bg-black rounded-full w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                    <ArrowRight className="w-4 h-4 text-[#DEDBC8]" />
                  </div>
                </motion.button>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* SECTION 2: ABOUT / INDUSTRIAL CONTEXT */}
      <section id="the-problem" className="bg-black py-20 md:py-32 px-4 md:px-6">
        <div className="bg-[#101010] rounded-2xl md:rounded-[2rem] p-8 sm:p-14 md:p-20 max-w-6xl mx-auto text-center border border-white/5 shadow-2xl">
          
          {/* Small Top Label */}
          <span className="text-primary text-[10px] sm:text-xs uppercase tracking-[0.25em] font-medium block mb-8">
            Autonomous Energy Control
          </span>

          {/* Main Heading with WordsPullUpMultiStyle */}
          <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl max-w-3xl mx-auto leading-[0.95] sm:leading-[0.9] text-[#E1E0CC] mb-12">
            <WordsPullUpMultiStyle
              segments={[
                { text: "We build GridPulse,", className: "font-normal" },
                { text: "an autonomous energy OS.", className: "italic font-serif" },
                { text: "Engineered to eliminate peak demand penalties and protect industrial battery life.", className: "font-normal" }
              ]}
            />
          </div>

          {/* Body paragraph with scroll-linked character opacity animation */}
          <div ref={aboutContainerRef} className="text-[#DEDBC8] text-xs sm:text-sm md:text-base max-w-2xl mx-auto mt-12 leading-relaxed">
            {aboutChars.map((char, index) => (
              <AnimatedLetter
                key={index}
                char={char}
                index={index}
                totalChars={aboutChars.length}
                scrollYProgress={aboutScrollProgress}
              />
            ))}
          </div>

        </div>
      </section>

      {/* SECTION 3: FEATURES */}
      <section id="core-features" className="min-h-screen bg-black py-20 md:py-32 px-4 md:px-6 relative">
        
        {/* Subtle bg-noise overlay */}
        <div className="bg-noise absolute inset-0 opacity-[0.15] pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10">
          
          {/* Header Text with WordsPullUpMultiStyle */}
          <div className="mb-14 text-center">
            <div className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-normal">
              <WordsPullUpMultiStyle
                segments={[
                  { text: "Plant-grade energy control for modern industry.", className: "text-primary" }
                ]}
              />
            </div>
            <div className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-normal mt-2">
              <WordsPullUpMultiStyle
                segments={[
                  { text: "Built for zero downtime. Powered by predictive AI.", className: "text-gray-500" }
                ]}
              />
            </div>
          </div>

          {/* 4-Column Card Grid */}
          <div ref={featuresRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 lg:h-[480px] gap-3 sm:gap-2 md:gap-1.5">
            
            {/* Card 1: Video Card */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={isFeaturesInView ? { scale: 1, opacity: 1 } : { scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.7, delay: 0 * 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="relative rounded-2xl overflow-hidden min-h-[360px] lg:h-full bg-[#181818] border border-white/5"
            >
              <video
                src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260406_133058_0504132a-0cf3-4450-a370-8ea3b05c95d4.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover absolute inset-0"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
              <div className="absolute bottom-6 left-6 right-6 z-10">
                <p className="text-[#E1E0CC] text-lg sm:text-xl font-medium tracking-tight">
                  Your factory digital twin.
                </p>
              </div>
            </motion.div>

            {/* Card 2: Peak Shaving Dispatch (01) */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={isFeaturesInView ? { scale: 1, opacity: 1 } : { scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.7, delay: 1 * 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="bg-[#212121] rounded-2xl p-6 flex flex-col justify-between min-h-[360px] lg:h-full border border-white/5 hover:border-white/10 transition-colors duration-300"
            >
              <div>
                <img
                  src="https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260405_171918_4a5edc79-d78f-4637-ac8b-53c43c220606.png&w=1280&q=85"
                  alt="Peak Shaving Icon"
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover mb-6 border border-white/10"
                />
                <h3 className="text-base sm:text-lg font-medium text-[#E1E0CC] mb-6">
                  Peak Shaving Dispatch. <span className="text-gray-500 text-sm font-normal">(01)</span>
                </h3>
                <ul className="flex flex-col gap-3">
                  {[
                    "Sub-80ms battery discharge response",
                    "Contracted grid ceiling enforcement",
                    "15-minute sliding window protection",
                    "28% to 42% demand surcharge reduction"
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-gray-400 text-xs sm:text-sm leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-6 border-t border-white/5 mt-6">
                <button onClick={() => setIsConsoleOpen(true)} className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-white transition-colors group cursor-pointer">
                  <span>Open live simulation</span>
                  <ArrowRight className="w-3.5 h-3.5 -rotate-45 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>
            </motion.div>

            {/* Card 3: Cloud Cover Shield (02) */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={isFeaturesInView ? { scale: 1, opacity: 1 } : { scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.7, delay: 2 * 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="bg-[#212121] rounded-2xl p-6 flex flex-col justify-between min-h-[360px] lg:h-full border border-white/5 hover:border-white/10 transition-colors duration-300"
            >
              <div>
                <img
                  src="https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260405_171741_ed9845ab-f5b2-4018-8ce7-07cc01823522.png&w=1280&q=85"
                  alt="Cloud Cover Shield Icon"
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover mb-6 border border-white/10"
                />
                <h3 className="text-base sm:text-lg font-medium text-[#E1E0CC] mb-6">
                  Cloud Cover Shield. <span className="text-gray-500 text-sm font-normal">(02)</span>
                </h3>
                <ul className="flex flex-col gap-3">
                  {[
                    "Instant detection of 50% solar loss",
                    "Millisecond supply deficit balancing",
                    "Zero weather-driven grid penalties"
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-gray-400 text-xs sm:text-sm leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-6 border-t border-white/5 mt-6">
                <button onClick={() => setIsConsoleOpen(true)} className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-white transition-colors group cursor-pointer">
                  <span>Test solar drop</span>
                  <ArrowRight className="w-3.5 h-3.5 -rotate-45 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>
            </motion.div>

            {/* Card 4: Tariff & Cell Health (03) */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={isFeaturesInView ? { scale: 1, opacity: 1 } : { scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.7, delay: 3 * 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="bg-[#212121] rounded-2xl p-6 flex flex-col justify-between min-h-[360px] lg:h-full border border-white/5 hover:border-white/10 transition-colors duration-300"
            >
              <div>
                <img
                  src="https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260405_171809_f56666dc-c099-4778-ad82-9ad4f209567b.png&w=1280&q=85"
                  alt="Tariff & Cell Health Icon"
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover mb-6 border border-white/10"
                />
                <h3 className="text-base sm:text-lg font-medium text-[#E1E0CC] mb-6">
                  Tariff & Cell Health. <span className="text-gray-500 text-sm font-normal">(03)</span>
                </h3>
                <ul className="flex flex-col gap-3">
                  {[
                    "Automated night charge / peak discharge",
                    "Thermal & DoD degradation boundaries",
                    "Extended battery lifespan by 4.2 years"
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-gray-400 text-xs sm:text-sm leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-6 border-t border-white/5 mt-6">
                <button onClick={() => setIsConsoleOpen(true)} className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-white transition-colors group cursor-pointer">
                  <span>Explore economics</span>
                  <ArrowRight className="w-3.5 h-3.5 -rotate-45 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>
            </motion.div>

          </div>

        </div>
      </section>

      {/* INTERACTIVE LIVE CONSOLE MODAL */}
      {isConsoleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl">
          <div className="bg-[#121212] border border-white/10 rounded-2xl max-w-2xl w-full p-6 sm:p-8 relative shadow-2xl">
            <button
              onClick={() => setIsConsoleOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-2 text-primary text-xs uppercase tracking-widest font-medium">
              <Activity className="w-4 h-4" />
              <span>Plant Unit 04 Telemetry</span>
            </div>

            <h3 className="text-xl sm:text-2xl font-medium text-[#E1E0CC] mb-2">
              Live Microgrid Dispatch Simulator
            </h3>
            <p className="text-xs sm:text-sm text-gray-400 mb-6">
              Simulate an instantaneous 50% solar drop during peak machine operation to observe automated peak shaving in action.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-[#1c1c1c] p-3 rounded-xl border border-white/5">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>Solar PV</span>
                  <CloudSun className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-lg font-mono font-medium text-white">
                  {isCloudDropSimulated ? "280 kW" : "600 kW"}
                </div>
                <div className="text-[10px] text-gray-500">
                  {isCloudDropSimulated ? "(-53% cloud dip)" : "(Clear sky)"}
                </div>
              </div>

              <div className="bg-[#1c1c1c] p-3 rounded-xl border border-white/5">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>Battery</span>
                  <Battery className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="text-lg font-mono font-medium text-primary">
                  {isCloudDropSimulated ? "+320 kW" : "0 kW"}
                </div>
                <div className="text-[10px] text-gray-500">
                  {isCloudDropSimulated ? "(Discharging)" : "(Standby)"}
                </div>
              </div>

              <div className="bg-[#1c1c1c] p-3 rounded-xl border border-white/5">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>Grid Draw</span>
                  <Activity className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="text-lg font-mono font-medium text-white">
                  200 kW
                </div>
                <div className="text-[10px] text-primary">
                  (Capped at 250 kW)
                </div>
              </div>

              <div className="bg-[#1c1c1c] p-3 rounded-xl border border-white/5">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>Avoided Cost</span>
                  <Shield className="w-3.5 h-3.5 text-green-400" />
                </div>
                <div className="text-lg font-mono font-medium text-white">
                  {isCloudDropSimulated ? "$14,200" : "$0"}
                </div>
                <div className="text-[10px] text-green-400">
                  {isCloudDropSimulated ? "Penalty shaved" : "Nominal baseline"}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/5">
              <button
                onClick={() => setIsCloudDropSimulated(!isCloudDropSimulated)}
                className="w-full sm:w-auto px-5 py-2.5 bg-primary text-black font-medium text-sm rounded-full transition-all duration-300 hover:opacity-90 cursor-pointer"
              >
                {isCloudDropSimulated ? "Reset to clear sky" : "Trigger 50% solar loss event"}
              </button>

              <a
                href="http://localhost:8501"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary underline hover:text-white transition-colors flex items-center gap-1"
              >
                <span>Launch Full Python SCADA Console (localhost:8501)</span>
                <span>↗</span>
              </a>
            </div>

          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="border-t border-white/5 bg-black py-8 px-4 text-center text-xs text-gray-500">
        <p>GridPulse Energy Systems &copy; 2026. Ready for Vercel Deployment.</p>
      </footer>

    </div>
  );
}
