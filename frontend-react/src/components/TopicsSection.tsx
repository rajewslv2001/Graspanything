const tags = [
  "Quantum Physics", "Contract Law", "Machine Learning", "Japanese Grammar",
  "The Stock Market", "React Hooks", "Stoic Philosophy", "Human Anatomy",
  "Options Trading", "Blockchain", "The French Revolution", "Figma",
  "Tax Law", "Behavioral Economics", "Thermodynamics",
];

const TopicsSection = () => {
  return (
    <section id="topics" className="relative z-10 py-24 px-6 bg-background">
      <div className="max-w-4xl mx-auto text-center">
        <p className="font-pixel text-[10px] tracking-[0.3em] text-accent mb-4">
          TOPICS
        </p>
        <h2 className="font-body text-3xl md:text-4xl font-semibold mb-16 text-foreground">
          If you can ask it, Grasp can teach it.
        </h2>

        <div className="flex flex-wrap justify-center gap-4">
          {tags.map((tag, i) => (
            <span
              key={tag}
              className="scroll-fade-in pixel-tag bg-background text-foreground font-body text-sm px-4 py-2 cursor-default select-none"
              style={{ transitionDelay: `${i * 60}ms` }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TopicsSection;
