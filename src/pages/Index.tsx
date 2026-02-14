import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Navbar } from '@/components/Navbar';
import { Zap, Scissors, Captions, TrendingUp, Upload, Sparkles } from 'lucide-react';
import heroBg from '@/assets/hero-bg.jpg';

const features = [
  { icon: Upload, title: 'Upload Any Video', desc: 'Drop your long-form content — podcasts, streams, interviews.' },
  { icon: Sparkles, title: 'AI Transcription', desc: 'Automatic speech-to-text with timestamp precision.' },
  { icon: TrendingUp, title: 'Viral Moment Detection', desc: 'AI finds the most engaging 30–60s segment.' },
  { icon: Scissors, title: 'Auto Clip & Resize', desc: 'Cuts and converts to vertical 9:16 format.' },
  { icon: Captions, title: 'Captions & Hooks', desc: 'Adds viral hook overlay and styled captions.' },
  { icon: Zap, title: 'Export & Schedule', desc: 'Download or schedule to YouTube & Instagram.' },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-16">
        <div
          className="absolute inset-0 opacity-40"
          style={{ backgroundImage: `url(${heroBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />

        <div className="container relative z-10 text-center">
          <div className="mx-auto max-w-3xl opacity-0 animate-fade-in">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary">
              <Zap className="h-3.5 w-3.5" />
              AI-Powered Viral Clip Generator
            </div>
            <h1 className="mb-6 text-5xl font-bold leading-tight tracking-tight md:text-7xl">
              Turn Long Videos Into
              <span className="block text-gradient glow-text">Viral Clips</span>
            </h1>
            <p className="mx-auto mb-10 max-w-xl text-lg text-muted-foreground opacity-0 animate-fade-in-delay-1">
              Upload your raw footage. Our AI finds the most engaging moments, clips them, adds captions & hooks — ready to post.
            </p>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center opacity-0 animate-fade-in-delay-2">
              <Button size="lg" className="glow-cyan text-lg px-8" asChild>
                <Link to="/auth">Start Creating — Free</Link>
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8" asChild>
                <Link to="/auth">Watch Demo</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24">
        <div className="container">
          <div className="mb-16 text-center opacity-0 animate-fade-in">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              From Raw Video to Viral in <span className="text-gradient">Minutes</span>
            </h2>
            <p className="mx-auto max-w-lg text-muted-foreground">
              A fully automated pipeline that handles everything from transcription to final export.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="glass group rounded-xl p-6 transition-all duration-300 hover:glow-cyan hover:border-primary/40"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border py-24">
        <div className="container text-center">
          <h2 className="mb-4 text-3xl font-bold">Ready to Go Viral?</h2>
          <p className="mx-auto mb-8 max-w-md text-muted-foreground">
            Join creators who turn hours of content into scroll-stopping clips.
          </p>
          <Button size="lg" className="glow-cyan px-8" asChild>
            <Link to="/auth">Get Started Free</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © 2026 Migoo. AI-powered viral content creation.
      </footer>
    </div>
  );
};

export default Index;
