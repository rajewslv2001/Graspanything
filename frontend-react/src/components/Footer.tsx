import GraspLogo from "./GraspLogo";

const Footer = () => {
  return (
    <footer className="relative z-10 border-t-2 border-foreground bg-background py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <GraspLogo size="small" />
        <p className="font-body italic text-sm text-muted-foreground">
          Built to make sure you actually get it.
        </p>
        <div className="flex gap-6">
          <a href="#" className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy</a>
          <a href="#" className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors">Terms</a>
          <a href="#" className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
