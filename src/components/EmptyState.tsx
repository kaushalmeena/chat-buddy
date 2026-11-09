import { Cpu, type LucideIcon, Lightbulb, ShieldCheck, Sparkles } from "lucide-react";

import { sendMessage, useChat } from "@/stores/chat.ts";

import { BrandMark } from "./BrandMark.tsx";

type Starter = {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly prompt: string;
};

/**
 * Prompts offered on an empty thread. Concrete starters replace guesswork, and
 * double as a hint about what a small local model does well.
 */
const STARTERS: readonly Starter[] = [
  { icon: Sparkles, title: "What can you do?", prompt: "What can you do?" },
  {
    icon: Cpu,
    title: "Explain WebGPU",
    prompt: "Explain WebGPU in two sentences",
  },
  {
    icon: Lightbulb,
    title: "Name my pet robot",
    prompt: "Give me a name for a pet robot",
  },
  {
    icon: ShieldCheck,
    title: "Is my data private?",
    prompt: "Is anything I type sent to a server?",
  },
];

function EmptyState() {
  const provider = useChat((state) => state.activeProvider);

  return (
    <div className="scrollbar-slim flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-4 py-10">
      <div className="flex animate-enter flex-col items-center gap-4 text-center">
        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-6 rounded-full bg-brand-500/20 blur-2xl"
          />
          <BrandMark size={56} className="relative rounded-2xl shadow-float" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-2xl font-semibold tracking-tight text-content sm:text-3xl">
            How can I help?
          </h2>
          <p className="mx-auto max-w-sm text-sm text-content-muted">
            {provider
              ? `Answering with ${provider.label}. Nothing you type leaves this device.`
              : "Getting ready…"}
          </p>
        </div>
      </div>

      <ul className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
        {STARTERS.map((starter, index) => (
          <StarterCard key={starter.prompt} starter={starter} index={index} />
        ))}
      </ul>
    </div>
  );
}

// Animation (not transition) delays; the `both` fill mode keeps each card hidden
// until its turn, so the stagger never flashes the final state first.
const STAGGER = [
  "[animation-delay:60ms]",
  "[animation-delay:100ms]",
  "[animation-delay:140ms]",
  "[animation-delay:180ms]",
] as const;

function StarterCard({
  starter,
  index,
}: {
  readonly starter: Starter;
  readonly index: number;
}) {
  const Icon = starter.icon;

  const handleClick = () => {
    void sendMessage(starter.prompt);
  };

  return (
    <li className={`animate-enter ${STAGGER[index] ?? ""}`}>
      <button
        type="button"
        onClick={handleClick}
        className="group flex w-full items-start gap-3 rounded-xl border border-border-subtle bg-surface px-3.5 py-3 text-left shadow-card transition-[border-color,transform] hover:-translate-y-px hover:border-brand-400"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-600 transition-colors group-hover:bg-brand-500/15 dark:text-brand-400">
          <Icon size={16} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-content">{starter.title}</span>
          <span className="truncate text-xs text-content-muted">{starter.prompt}</span>
        </span>
      </button>
    </li>
  );
}

export { EmptyState };
