import { Hero } from "./landing/Hero";
import { BuiltOn, HowItWorks, ValueProp } from "./landing/Narrative";
import { Disputes, Features } from "./landing/Features";
import { Faq, Proof } from "./landing/ProofFaq";
import { CtaBand, Footer } from "./landing/Closing";

export default function Landing() {
  return (
    <div>
      <Hero />
      <BuiltOn />
      <ValueProp />
      <HowItWorks />
      <Features />
      <Disputes />
      <Proof />
      <Faq />
      <CtaBand />
      <Footer />
    </div>
  );
}
