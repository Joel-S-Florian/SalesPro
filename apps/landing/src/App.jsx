import React from 'react';
import { Footer, Nav } from './components/Chrome';
import Hero from './components/Hero';
import Tour from './components/Tour';
import Contact from './components/Contact';
import { Audience, Faq, Features, Fiscal, Pricing, Steps } from './components/Sections';

export default function App() {
  return (
    <>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-white">
        Saltar al contenido
      </a>
      <Nav />
      <main id="contenido">
        <Hero />
        <Audience />
        <Tour />
        <Features />
        <Steps />
        <Fiscal />
        <Pricing />
        <Faq />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
