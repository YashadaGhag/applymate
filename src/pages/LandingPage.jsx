import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  ArrowRight,
  Search,
  FileText,
  FolderOpen,
  BarChart3,
  ListChecks,
  ShieldCheck,
  Camera,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Button from "../components/Button";
import heroVideo from "../assets/hero-video.mp4";
import heroPoster from "../assets/hero-poster.jpg";
import jobRecommendationsImg from "../assets/Job Recommendations.png";
import resumeTailoringImg from "../assets/Resume Tailoring.png";
import applicationKitImg from "../assets/Application Kit.png";

const HOW_IT_WORKS = [
  {
    image: jobRecommendationsImg,
    icon: Search,
    title: "Find the Right Jobs, Fast",
    description:
      "ApplyMate scans the career pages of companies you're targeting and scores them against your profile — skills, experience, location. New roles from companies you're watching are grouped so you see them first.",
  },
  {
    image: resumeTailoringImg,
    icon: FileText,
    title: "Adapt Without Losing Yourself",
    description:
      "AI tailors your resume to the job description, then shows you a plain-language summary of what it changed. You edit every line directly before exporting.",
  },
  {
    image: applicationKitImg,
    icon: FolderOpen,
    title: "Your Complete Kit, Ready",
    description:
      "Downloadable resume (PDF) and cover letter (PDF), both tailored to the role. You edit, approve, and submit manually on the job portal. We remember everything.",
  },
];

const FEATURES = [
  {
    icon: BarChart3,
    title: "Transparent Match Scores",
    description:
      "Every match comes with a score, a plain reason and the role highlights behind it. No black box deciding your next move.",
  },
  {
    icon: ListChecks,
    title: "What Changed, Plainly",
    description:
      "No hidden rewrites. Every tailored resume comes with a summary of what changed, and you can edit any line yourself.",
  },
  {
    icon: ShieldCheck,
    title: "You Approve Every Action",
    description:
      "Tailoring and cover letters start only when you click. You review every change, and you submit every application yourself on the job portal.",
  },
  {
    icon: Camera,
    title: "Application Snapshots",
    description:
      "Every tailored resume and cover letter is saved with each job, so you're ready when interviews arrive weeks later.",
  },
];

function HeroSection({ onGetStarted }) {
  return (
    <section className="px-sp16 py-sp40 md:px-sp40 md:py-sp64 lg:py-sp100 xl:px-sp80 2xl:px-sp200">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-sp32 lg:flex-row lg:items-center lg:gap-sp40">
        <div className="flex flex-col items-start gap-sp16 lg:flex-1 lg:min-w-0 lg:gap-sp32">
          <span className="inline-flex items-center gap-[8px] rounded-lg border border-primary-200 bg-white px-sp8 py-sp8">
            <Sparkles size={16} className="text-primary-500" />
            <span className="text-body-small font-regular text-primary-500">
              SMART PREPARATION LAYER
            </span>
          </span>

          <h1 className="text-h1 font-semibold text-neutral-800">
            Job Search Without
            <br />
            the Burnout
          </h1>

          <p className="max-w-[504px] text-body-large font-regular text-neutral-500">
            Add the companies you want to work for. ApplyMate checks their
            careers pages daily, scores new roles against your resume, and
            prepares your application kit.
          </p>

          <Button
            variant="primary"
            iconPosition="right"
            icon={<ArrowRight size={18} />}
            onClick={onGetStarted}
          >
            Get started
          </Button>
        </div>

        <div className="overflow-hidden rounded-[16px] shadow-card lg:flex-1 lg:min-w-0">
          <video
            className="block w-full scale-101 object-cover"
            poster={heroPoster}
            autoPlay
            loop
            muted
            playsInline
          >
            <source src={heroVideo} type="video/mp4" />
          </video>
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="border-y border-primary-200 bg-primary-50 px-sp16 py-sp40 md:px-sp40 md:py-sp64 lg:py-sp100 xl:px-sp80 2xl:px-sp200"
    >
      <div className="mx-auto max-w-[1280px]">
        <div className="flex flex-col items-center gap-sp40 md:gap-sp64">
          <div className="flex flex-col items-center gap-sp16 text-center">
            <h3 className="text-h3 font-semibold text-neutral-800">
              Your Intelligent Preparation Layer
            </h3>
            <p className="text-body-large font-regular text-neutral-500">
              Maintain control while AI handles the cognitive heavy lifting of
              your job search.
            </p>
          </div>

          <div className="flex w-full flex-col gap-sp40 lg:grid lg:grid-cols-3 lg:gap-sp32">
            {HOW_IT_WORKS.map(({ image, icon: Icon, title, description }) => (
              <div key={title} className="flex flex-col gap-sp24">
                <img
                  src={image}
                  alt={title}
                  className="h-landing-shot w-full rounded-md object-cover object-top shadow-card"
                />
                <div className="flex flex-col gap-sp12">
                  <div className="flex size-[48px] items-center justify-center rounded-md border border-neutral-100 bg-white">
                    <Icon size={24} className="text-neutral-700" />
                  </div>
                  <h5 className="text-h5 font-medium text-neutral-800">
                    {title}
                  </h5>
                  <p className="text-body-large font-regular text-neutral-500">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section
      id="features"
      className="bg-white px-sp16 py-sp40 md:px-sp40 md:py-sp64 lg:py-sp100 xl:px-sp80 2xl:px-sp200"
    >
      <div className="mx-auto max-w-[1280px]">
        <div className="flex flex-col items-center gap-sp40 md:gap-sp64">
          <div className="flex flex-col items-center gap-sp16 text-center">
            <h3 className="text-h3 font-semibold text-neutral-800">
              Built for Quality, Not Volume
            </h3>
            <p className="text-body-large font-regular text-neutral-500">
              We don&rsquo;t automate your identity. We provide the intelligence
              you need to make every application count.
            </p>
          </div>

          <div className="flex w-full flex-col gap-sp40 lg:grid lg:grid-cols-2 lg:gap-sp40">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-start gap-sp16">
                <div className="flex size-[40px] shrink-0 items-center justify-center rounded-sm border border-neutral-100 bg-neutral-50">
                  <Icon size={20} className="text-neutral-700" />
                </div>
                <div className="flex flex-col gap-sp8">
                  <h5 className="text-h5 font-medium text-neutral-800">
                    {title}
                  </h5>
                  <p className="text-body-large font-regular text-neutral-500">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCTASection({ onGetStarted }) {
  return (
    <section className="bg-primary-900 px-sp16 py-sp40 md:px-sp40 md:py-sp64 lg:py-sp100 xl:px-sp80 2xl:px-sp200">
      <div className="mx-auto flex max-w-[896px] flex-col items-center gap-sp16 text-center lg:gap-sp32">
        <h2 className="text-h2 font-semibold text-white">
          Ready to Job Search Without the Burnout?
        </h2>
        <p className="text-body-large font-medium text-white lg:text-h5">
          Take back control of your applications. Let ApplyMate handle the
          tedious prep work.
        </p>
        <Button
          variant="secondary"
          iconPosition="right"
          icon={<ArrowRight size={18} />}
          onClick={onGetStarted}
        >
          Get started
        </Button>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const handleGetStarted = () => navigate("/onboarding");

  return (
    <div className="min-h-screen bg-white">
      <Navbar onGetStarted={handleGetStarted} />
      <HeroSection onGetStarted={handleGetStarted} />
      <HowItWorksSection />
      <FeaturesSection />
      <FinalCTASection onGetStarted={handleGetStarted} />
    </div>
  );
}
