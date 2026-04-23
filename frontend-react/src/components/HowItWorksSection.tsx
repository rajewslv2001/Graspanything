const steps = [
  {
    num: "①",
    title: "Ask or upload",
    desc: "Ask Grasp anything out loud, or drop in your notes, slides, or PDFs.",
  },
  {
    num: "②",
    title: "Grasp explains",
    desc: "Your AI tutor breaks it down in the clearest way for you — using examples, analogies, whatever clicks.",
  },
  {
    num: "③",
    title: "Prove you got it",
    desc: "Grasp asks you questions. Answer them. Only when you're ready does it move on.",
  },
];

const HowItWorksSection = () => {
  return (
    <section id="how-it-works" className="relative z-10 bg-dark-surface text-dark-surface-foreground py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <p className="font-pixel text-[10px] tracking-[0.3em] text-pink mb-4">
          HOW IT WORKS
        </p>
        <h2 className="font-body text-3xl md:text-4xl font-semibold mb-16">
          Learning that checks itself.
        </h2>

        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <div
              key={i}
              className="scroll-fade-in border-2 border-dark-card-border bg-dark-card p-8"
              style={{ transitionDelay: `${i * 150}ms` }}
            >
              <span className="font-pixel text-3xl text-accent block mb-6">
                {step.num}
              </span>
              <h3 className="font-pixel text-xs mb-4">{step.title}</h3>
              <p className="font-body text-base leading-relaxed text-dark-surface-foreground/80">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
